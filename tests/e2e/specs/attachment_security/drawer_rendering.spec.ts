import { test, expect } from '../../fixtures/auth.fixture';


import { navigateToAttachmentSecurity, switchToTab } from './helpers';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });


test.describe('Attachment Security Drawer Rendering', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
  });

  test('title and master switch are visible', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.locator('[data-testid="attachment-security-title"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="master-switch-toggle"]')).toBeVisible();
  });

  test('all 4 html_spec tabs are visible', async ({ authenticatedPage }) => {
    const tabKeys = ['basicLimit', 'antivirus', 'image', 'encrypted'];
    for (const key of tabKeys) {
      await expect(authenticatedPage.locator(`[data-testid="tab-${key}"]`)).toBeVisible();
    }
  });

  test('basic limit tab is shown by default', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.locator('[data-testid="basic-limit-tab"]')).toBeVisible();
  });

  test('switching tabs changes content', async ({ authenticatedPage }) => {
    await switchToTab(authenticatedPage, 'antivirus');
    await expect(authenticatedPage.locator('[data-testid="antivirus-tab"]')).toBeVisible();

    await switchToTab(authenticatedPage, 'image');
    await expect(authenticatedPage.locator('[data-testid="image-detect-tab"]')).toBeVisible();

    await switchToTab(authenticatedPage, 'encrypted');
    await expect(authenticatedPage.locator('[data-testid="encrypted-attachment-tab"]')).toBeVisible();

  });

  test('master switch persists across a page reload (GT-11639)', async ({ authenticatedPage }) => {
    const toggle = authenticatedPage.locator('[data-testid="master-switch-toggle"]');
    await toggle.click();
    await expect(authenticatedPage.locator('[data-testid="module-disabled-overlay"]')).toBeVisible();
    await authenticatedPage.getByTestId('attachment-security-save').click();

    await authenticatedPage.reload();
    await authenticatedPage.getByTestId('pipeline-policy-card-attachment').click();
    await expect(authenticatedPage.locator('[data-testid="module-disabled-overlay"]')).toBeVisible();
    await expect(
      authenticatedPage.locator('[data-testid="module-content-attachment_security"]'),
    ).toHaveAttribute('data-enabled', 'false');

    // 恢复，避免污染后续 spec
    await toggle.click();
    await authenticatedPage.getByTestId('attachment-security-save').click();
    await expect(authenticatedPage.locator('[data-testid="module-disabled-overlay"]')).toBeHidden();
  });

  test('closing drawer via pipeline close button', async ({ authenticatedPage }) => {
    await authenticatedPage.getByTestId('pipeline-config-drawer-close').click();
    await expect(authenticatedPage.locator('[data-testid="pipeline-config-drawer"]')).not.toBeVisible({ timeout: 5000 });
  });
});
