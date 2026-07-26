import { expect, test } from '@playwright/test';

test.describe('Content rules html_spec alignment (mock)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      { name: 'osgateway_auth', value: '1', domain: 'localhost', path: '/' },
      { name: 'osgateway_token', value: 'mock-browser-token', domain: 'localhost', path: '/' },
    ]);
    // This spec authenticates with a FAKE token and relies on the app's in-app
    // mock mode for data. Anything the pipeline shell fetches that mock mode does
    // not intercept reaches the real API, 401s, and the global 401 handler
    // hard-redirects to /zh/login -- the test then dies waiting for a testid with
    // no hint that auth was the cause (observed: /api/v1/agent-center/overview).
    //
    // Register a catch-all FIRST so the spec is hermetic; Playwright resolves
    // routes last-registered-first, so any specific mock added later still wins.
    // NOTE: only for fake-token specs. Specs using the authenticatedPage fixture
    // log in for real and must keep talking to the real API.
    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('osgateway_mock_enabled', '1');
      // tenant_admin, not system_admin: in the cloud/multiTenant dev form the
      // platform admin is blocked from Module A (GT-12149 / PRD §1.4), so the
      // pipeline would render notAuthorized for a system_admin mock user.
      localStorage.setItem('osgateway_user', JSON.stringify({
        id: 888,
        username: 'pw-tenant-admin',
        role: 'tenant_admin',
        tenant_id: 71,
        created_at: '',
        updated_at: '',
      }));
    });
  });

  test('opens the 80vw workspace and 920px editor with real-time regex validation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/zh/security/pipeline');

    const card = page.getByTestId('pipeline-policy-card-content');
    await expect(card).toBeVisible();
    await expect.poll(async () => (await card.boundingBox())?.width).toBe(220);
    await expect.poll(async () => (await card.boundingBox())?.height).toBe(60);
    await card.click();

    const workspace = page.getByTestId('pipeline-config-drawer');
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText('身份证外发管控');
    await expect.poll(async () => Math.round((await workspace.boundingBox())?.width ?? 0)).toBe(1152);

    await workspace.getByRole('button', { name: /新增规则|新建规则|创建规则/ }).click();
    const editor = page.getByTestId('content-rule-drawer');
    await expect(editor).toBeVisible();
    await expect.poll(async () => Math.round((await editor.boundingBox())?.width ?? 0)).toBe(920);
    await expect(editor.getByRole('heading', { name: '新建内容规则' })).toBeVisible();

    const formPane = editor.getByTestId('content-rule-form-pane');
    const helpPane = editor.getByTestId('content-rule-help-pane');
    await expect.poll(async () => Math.round((await formPane.boundingBox())?.width ?? 0)).toBe(560);
    await expect.poll(async () => {
      const width = Math.round((await helpPane.boundingBox())?.width ?? 0);
      return width >= 359 && width <= 360;
    }).toBe(true);
    await expect(editor.locator('section h3')).toHaveText([
      '基础设置',
      '匹配条件',
      '执行动作',
      '备注说明',
    ]);
    await expect(editor.getByTestId('content-rule-current-effect')).toContainText('当前配置效果');
    await expect(editor.getByRole('button', { name: '查看配置示例' })).toBeVisible();
    await expect(editor.getByRole('button', { name: '模拟测试' })).toBeVisible();

    await editor.getByTestId('content-rule-action').click();
    await expect(page.getByRole('option')).toHaveCount(6);
    await page.getByRole('option', { name: '标记并放行' }).click();
    await expect(editor.getByText('头部名称')).toBeVisible();
    await editor.getByTestId('content-rule-action').click();
    await page.getByRole('option', { name: '隔离' }).click();

    await editor.getByTestId('content-rule-match-type').click();
    await page.getByRole('option', { name: '正则表达式' }).click();
    await editor.getByTestId('content-rule-match-content').fill('(');
    await expect(editor).toContainText('正则表达式无效');
    await expect(editor).toContainText('附件内容');
    await editor.getByRole('button', { name: '配置示例' }).click();
    await expect(editor.getByText('身份证号外发管控')).toBeVisible();

    await editor.getByRole('button', { name: '取消' }).click();
    const dirtyDialog = page.getByRole('alertdialog');
    await expect(dirtyDialog.getByRole('heading', { name: '放弃未保存的更改？' })).toBeVisible();
    await dirtyDialog.getByRole('button', { name: '取消' }).click();
    await expect(editor).toBeVisible();
  });

  test('collapses the help pane before the two-column editor would overflow', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto('/zh/security/pipeline');
    await page.getByTestId('pipeline-policy-card-content').click();
    const workspace = page.getByTestId('pipeline-config-drawer');
    await workspace.getByRole('button', { name: /新增规则|新建规则|创建规则/ }).click();

    const editor = page.getByTestId('content-rule-drawer');
    await expect(editor).toBeVisible();
    await expect(editor.getByTestId('content-rule-help-pane')).toBeHidden();
    await expect.poll(async () => editor.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  });

  test('creates a mock rule', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/zh/security/pipeline');
    await page.getByTestId('pipeline-policy-card-content').click();
    const workspace = page.getByTestId('pipeline-config-drawer');
    await workspace.getByRole('button', { name: /新增规则|新建规则|创建规则/ }).click();

    const editor = page.getByTestId('content-rule-drawer');
    await editor.getByTestId('content-rule-name').fill('Playwright 内容规则');
    await editor.getByTestId('content-rule-priority').fill('9875');
    await editor.getByTestId('content-rule-match-content').fill('playwright-keyword');
    await editor.getByTestId('content-rule-save').click();
    await expect(workspace).toContainText('Playwright 内容规则');
  });

  // SKIP (product gap, GT-12149 — same stranded gate as advanced-filter-rules.spec.ts):
  // the module master switch is gated to super admin (ModuleMasterSwitch passes
  // `disabled={!isSystemAdmin}`, tooltip 仅超级管理员可修改模块总开关), but Module A
  // is tenant-only in the cloud/multiTenant dev form — a system_admin gets
  // notAuthorized on /security/pipeline (PRD §1.4), which is why this spec mocks a
  // tenant_admin in the first place. So NO role can both reach the pipeline and
  // operate the switch, and the staged save flow below is unreachable through the
  // UI. Un-skip once the permission model is reconciled; this is a product
  // decision, not a test defect, so it is not worked around here.
  test.skip('persists the staged module switch', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/zh/security/pipeline');
    await page.getByTestId('pipeline-policy-card-content').click();
    const workspace = page.getByTestId('pipeline-config-drawer');

    await workspace.getByTestId('master-switch-toggle').click();
    const moduleSave = workspace.getByTestId('master-switch-save');
    await expect(moduleSave).toBeEnabled();
    await moduleSave.click();
    await expect(moduleSave).toBeDisabled();
  });
});
