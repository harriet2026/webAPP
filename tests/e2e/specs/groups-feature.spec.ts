import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

interface RuleListItem {
  id: number;
  name: string;
}

test.describe('Feature group tab (/security/groups)', () => {
  // /security/groups is tenant-scoped: since GT-12245/GT-12257 the PLATFORM
  // viewer (no tenant) renders a 403 interception page there, and it also
  // actively clears any residual tenant selection. So a system_admin must enter
  // with BOTH osg_viewer=tenant and a selected tenant -- see
  // group-policy.spec.ts, which drives the same page.
  test.beforeEach(async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const tenantId = api.getTenantId();
    expect(tenantId, 'a tenant must exist (see global-setup)').not.toBeNull();
    const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost';
    await authenticatedPage.context().addCookies([
      { name: 'osg_viewer', value: 'tenant', url: base, sameSite: 'Lax' },
      { name: 'osg_selected_tenant', value: String(tenantId), url: base, sameSite: 'Lax' },
    ]);
    await authenticatedPage.evaluate((tid) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
    }, tenantId);
    // Flipping the viewer makes the app navigate on its own; goto-ing straight
    // away truncates that into net::ERR_ABORTED.
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);
    await authenticatedPage.goto('/zh/security/groups');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('feature tab is visible with Chinese label', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByRole('tab', { name: /特征组/ })).toBeVisible();
  });

  test('create + list + delete a feature group via UI', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-feat-${uniqueSuffix()}`;

    await authenticatedPage.getByRole('tab', { name: /特征组/ }).click();
    const tabPanel = authenticatedPage.locator('[role="tabpanel"]').filter({ hasText: /新建群组/ }).first();
    await tabPanel.getByRole('button', { name: /新建群组/ }).click();

    await authenticatedPage.locator('[data-testid="feature-group-name"]').fill(unique);

    // The condition editor is the F6/F11 rewrite (ConditionsEditor wrapping
    // ConditionTree/ConditionConfigPanel/ExpressionPreview): click the
    // "主题"/subject catalogue item to append a leaf (auto-selected), then fill
    // its value in the middle column's text-values input (default "contains" mode).
    await authenticatedPage.locator('[data-testid="condition-button-subject"]').click();
    const valueInput = authenticatedPage.locator('[data-testid="config-text-values"]');
    await expect(valueInput).toBeVisible({ timeout: 10000 });
    await valueInput.fill('invoice');

    await authenticatedPage.locator('[data-testid="feature-group-save"]').click();
    await expect(authenticatedPage.getByRole('cell', { name: unique })).toBeVisible({ timeout: 10000 });

    const listResp = await api.get(`/unified-rules?rule_class=tag&page=groups`);
    const listData = await listResp.json();
    const created = ((listData.items || []) as RuleListItem[]).find(r => r.name === unique);
    expect(created, `feature group ${unique} should round-trip via API`).toBeTruthy();
    if (created) {
      await api.delete(`/unified-rules/${created.id}`);
    }
  });

  test('import/export buttons are disabled on feature tab', async ({ authenticatedPage }) => {
    // html_spec 对齐（2026-07-18）：demo 特征组 Tab 工具栏保留 批量导入/导出 按钮位，
    // webapp 按钮存在但置灰（特征组无成员名单概念）；行级仍无导入/导出按钮。
    await authenticatedPage.getByRole('tab', { name: /特征组/ }).click();
    const tabPanel = authenticatedPage.locator('[role="tabpanel"]').filter({ hasText: /新建群组/ }).first();
    await expect(tabPanel.getByTestId('groups-batch-import')).toBeDisabled();
    await expect(tabPanel.getByTestId('groups-export-all')).toBeDisabled();
    // 没有任何可点击的导入/导出按钮（工具栏两个均 disabled，行级为 0）
    await expect(tabPanel.locator('button:has(svg.lucide-upload):not([disabled])')).toHaveCount(0);
    await expect(tabPanel.locator('button:has(svg.lucide-download):not([disabled])')).toHaveCount(0);
  });

  test('import/export buttons are visible on sender tab', async ({ authenticatedPage, request }) => {
    // Import/export are per-row actions on each group row (GroupManagementPage),
    // so a sender group must exist for the buttons to render — a fresh DB has
    // none. Create one via API, then assert the row's buttons are visible.
    const api = await createAuthenticatedClient(request);
    const senderName = `e2e-sender-${uniqueSuffix()}`;
    const createResp = await api.post('/unified-rules', {
      name: senderName,
      description: '',
      stage: 'mail',
      condition_tree: { type: 'condition', field: 'sender', operator: 'within', value: 'e2e-sender@example.com' },
      tags: [`grp:${senderName}`],
      priority: 100,
      is_active: true,
      page: 'groups',
      metadata: { group_type: 'sender' },
      rule_class: 'tag',
    });
    expect([200, 201], `create sender group: ${createResp.status()} ${await createResp.text()}`).toContain(createResp.status());
    const createdId = (await createResp.json()).id as number;
    try {
      await authenticatedPage.goto('/zh/security/groups');
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.getByRole('tab', { name: /发信人/ }).click();
      const tabPanel = authenticatedPage.locator('[role="tabpanel"]').filter({ hasText: /新建群组/ }).first();
      await expect(tabPanel.locator('button:has(svg.lucide-upload)').first()).toBeVisible({ timeout: 10000 });
      await expect(tabPanel.locator('button:has(svg.lucide-download)').first()).toBeVisible();
    } finally {
      await api.delete(`/unified-rules/${createdId}`);
    }
  });
});
