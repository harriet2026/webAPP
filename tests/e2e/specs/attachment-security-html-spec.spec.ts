import { expect, test, type Page } from '@playwright/test';

async function installMockIdentity(page: Page, options?: { role?: 'system_admin' | 'tenant_admin'; form?: string }) {
  const role = options?.role ?? 'system_admin';
  await page.context().addCookies([
    { name: 'osgateway_auth', value: '1', domain: 'localhost', path: '/' },
    { name: 'osgateway_token', value: 'mock-browser-token', domain: 'localhost', path: '/' },
    { name: 'osg_form_override', value: options?.form ?? 'ai-single', domain: 'localhost', path: '/' },
    { name: 'osg_viewer', value: role === 'tenant_admin' ? 'tenant' : 'platform', domain: 'localhost', path: '/' },
  ]);
  // This spec authenticates with a FAKE token and relies on the app's in-app
  // mock mode for data. Anything the page shell fetches that mock mode does not
  // intercept therefore reaches the real API, 401s, and the global 401 handler
  // hard-redirects to /zh/login -- so the test dies on a missing testid with no
  // hint that auth was the cause. Observed here: the pipeline shell requests
  // /api/v1/agent-center/overview.
  //
  // Register a catch-all FIRST so the spec is hermetic. Playwright resolves
  // routes last-registered-first, so any specific mock added later still wins.
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }),
    });
  });
  await page.addInitScript(({ role }) => {
    localStorage.setItem('osgateway_mock_enabled', '1');
    localStorage.setItem('osgateway_show_advanced_rules', '1');
    localStorage.setItem('osgateway_user', JSON.stringify({
      id: 1,
      username: role === 'tenant_admin' ? 'tenant-admin' : 'admin',
      role,
      tenant_id: role === 'tenant_admin' ? 7 : null,
      created_at: '',
      updated_at: '',
    }));
  }, { role });
}

async function openAttachment(page: Page, locale = 'zh') {
  await page.goto(`/${locale}/security/pipeline`);
  await page.getByTestId('pipeline-policy-card-attachment').click();
  await expect(page.getByTestId('attachment-security-page')).toBeVisible();
}

test.describe('Attachment security html_spec alignment (mock)', () => {
  test.beforeEach(async ({ page }) => installMockIdentity(page));

  test('renders the receive-only four-tab basic-limit default and unified save', async ({ page }) => {
    await openAttachment(page);
    await expect(page.getByTestId('pipeline-config-drawer-title')).toContainText('阶段3: 内容层 / 附件安全检测');
    await expect(page.getByTestId('attachment-security-tabs').getByRole('tab')).toHaveCount(4);
    await expect(page.getByTestId('tab-basicLimit')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('attachment-count-max')).toHaveValue('10');
    await expect(page.getByTestId('attachment-size-max-kb')).toHaveValue('10240');
    await expect(page.getByTestId('nested-zip-count-max')).toHaveValue('2');
    await expect(page.getByTestId('nested-file-count-max')).toHaveValue('20');
    await expect(page.getByTestId('nested-level-max')).toHaveValue('2');
    await expect(page.getByTestId('scan-timeout-sec')).toHaveValue('30');
    await expect(page.getByTestId('basic-limit-save')).toBeDisabled();

    await page.getByTestId('attachment-count-max').fill('-1');
    await page.getByTestId('attachment-count-max').blur();
    await expect(page.getByTestId('attachment-unlimited-warning')).toBeVisible();
    await expect(page.getByTestId('attachment-security-dirty-indicator')).toBeVisible();
    await expect(page.getByTestId('basic-limit-save')).toBeEnabled();
  });

  test('covers antivirus, image deep routing, and encrypted password-book interactions', async ({ page }) => {
    await openAttachment(page);
    await page.getByTestId('tab-antivirus').click();
    await expect(page.getByTestId('av-status-configured')).toBeVisible();
    await expect(page.getByTestId('antivirus-status-section')).toContainText('每日 02:00');

    await page.getByTestId('tab-image').click();
    await expect(page.getByTestId('qr-light-config')).toBeVisible();
    await page.getByTestId('qr-detection-mode').click();
    await page.getByRole('option', { name: /深度检测 - 解码内容/ }).click();
    await expect(page.getByTestId('qr-deep-config')).toBeVisible();
    await page.getByTestId('qr-deep-limit').fill('99');
    await expect(page.getByTestId('qr-deep-limit')).toHaveValue('50');
    await page.getByTestId('qr-route-advanced').click();
    await expect(page.getByTestId('advanced-rule-hint')).toBeVisible();

    await page.getByTestId('tab-encrypted').click();
    await expect(page.getByTestId('password-book-row-1')).toContainText('company2024!');
    await expect(page.getByTestId('password-book-row-1')).toContainText('2024-01-15');
    await page.getByTestId('password-book-input').fill('test@123');
    await page.getByTestId('password-book-confirm-add').click();
    const added = page.locator('[data-testid^="password-book-row-"]').filter({ hasText: 'test@123' });
    await expect(added).toBeVisible();
    const rowID = (await added.getAttribute('data-testid'))!.split('-').at(-1)!;
    await page.getByTestId(`password-book-delete-${rowID}`).click();
    await expect(added).toHaveCount(0);
  });

  test('guards dirty close and module switches, and restores discarded drafts', async ({ page }) => {
    await openAttachment(page);
    await page.getByTestId('master-switch-toggle').click();
    await expect(page.getByTestId('module-disabled-overlay')).toBeVisible();
    await expect(page.getByTestId('module-content-attachment_security')).toHaveAttribute('data-enabled', 'false');
    await expect(page.getByTestId('pipeline-drawer-nav-attachment')).toContainText('已禁用');

    await page.getByTestId('pipeline-config-drawer-close').click();
    await expect(page.getByTestId('attachment-unsaved-confirm')).toBeVisible();
    await page.getByTestId('attachment-unsaved-cancel').click();
    await page.getByTestId('pipeline-drawer-nav-url').click();
    await expect(page.getByTestId('attachment-unsaved-confirm')).toBeVisible();
    await page.getByTestId('attachment-unsaved-discard').click();
    await page.getByTestId('pipeline-drawer-nav-attachment').click();
    await expect(page.getByTestId('module-content-attachment_security')).toHaveAttribute('data-enabled', 'true');
  });

  test('hides platform basic limits and the global password book from tenant admins', async ({ page }) => {
    await page.context().clearCookies();
    await installMockIdentity(page, { role: 'tenant_admin', form: 'cloud' });
    await openAttachment(page);
    await expect(page.getByTestId('attachment-security-tabs').getByRole('tab')).toHaveCount(3);
    await expect(page.getByTestId('tab-basicLimit')).toHaveCount(0);
    await expect(page.getByTestId('tab-antivirus')).toHaveAttribute('aria-selected', 'true');
    // attachment_security is a TENANT-scoped module
    // (TENANT_SECURITY_MODULE_PAGES in src/lib/api/security-modules.ts), so
    // GT-12151's canEditSecurityModule grants a tenant_admin write access to its
    // master switch -- only the globally-scoped stage-1 modules stay
    // platform-managed. Asserting "disabled" here encoded the older state where
    // the switch was system_admin-only, which combined with Module A being
    // tenant-only meant NO role could operate it.
    //
    // Keep this as a positive assertion: if the switch is ever re-gated to
    // system_admin-only, Module A is stranded again and this fails.
    await expect(page.getByTestId('master-switch-toggle')).toBeEnabled();
    await page.getByTestId('tab-encrypted').click();
    await expect(page.getByTestId('password-book-restricted')).toBeVisible();
  });
});
