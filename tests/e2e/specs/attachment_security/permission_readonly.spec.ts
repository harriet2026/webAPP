import { test, expect } from '../../fixtures/auth.fixture';
import { navigateToAttachmentSecurity, switchToTab } from './helpers';

test.describe('Permission Readonly', () => {
  test('admin can open attachment security drawer', async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    await expect(authenticatedPage.locator('[data-testid="attachment-security-page"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="attachment-security-title"]')).toBeVisible();
  });

  test('admin can toggle master switch', async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    const toggle = authenticatedPage.locator('[data-testid="master-switch-toggle"]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(authenticatedPage.locator('[data-testid="module-disabled-overlay"]')).toBeVisible();
    await toggle.click();
    await expect(authenticatedPage.locator('[data-testid="module-disabled-overlay"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('admin can see all 4 tabs', async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    const tabKeys = ['basicLimit', 'antivirus', 'image', 'encrypted'];
    for (const key of tabKeys) {
      await expect(authenticatedPage.locator(`[data-testid="tab-${key}"]`)).toBeVisible();
    }
  });

  test('admin can modify basic limit config', async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    await expect(authenticatedPage.locator('[data-testid="basic-limit-tab"]')).toBeVisible();

    const saveBtn = authenticatedPage.locator('[data-testid="basic-limit-save"]');
    await expect(saveBtn).toBeDisabled();

    const tab = authenticatedPage.locator('[data-testid="basic-limit-tab"]');
    const numberInputs = tab.locator('input[type="number"]');
    const count = await numberInputs.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      await expect(numberInputs.nth(i)).toBeEnabled();
    }
    await numberInputs.first().fill('12');
    await expect(saveBtn).toBeEnabled();
  });

  test('admin can add and delete passwords in password book', async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    await switchToTab(authenticatedPage, 'encrypted');
    await expect(authenticatedPage.locator('[data-testid="encrypted-attachment-tab"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="password-book-table"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="password-book-add-btn"]')).toBeEnabled();

    await expect(authenticatedPage.locator('[data-testid="password-book-add-form"]')).toBeVisible();

    const form = authenticatedPage.locator('[data-testid="password-book-add-form"]');
    const inputs = form.locator('input');
    const value = `admin-perm-test-pw-${Date.now()}`;
    await inputs.first().fill(value);

    await authenticatedPage.locator('[data-testid="password-book-confirm-add"]').click();

    const row = authenticatedPage.locator('[data-testid^="password-book-row-"]').filter({ hasText: value });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '删除' }).click();
    await expect(row).toHaveCount(0);
  });

  test('admin can see antivirus status', async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    await switchToTab(authenticatedPage, 'antivirus');
    await expect(authenticatedPage.locator('[data-testid="antivirus-tab"]')).toBeVisible();
    await expect(authenticatedPage.getByTestId('antivirus-status-section')).toBeVisible();
  });

  test('admin is warned before switching modules with an unsaved draft', async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    await authenticatedPage.getByTestId('attachment-count-max').fill('12');
    await authenticatedPage.getByTestId('pipeline-drawer-nav-url').click();
    await expect(authenticatedPage.getByTestId('attachment-unsaved-confirm')).toBeVisible();
  });
});
