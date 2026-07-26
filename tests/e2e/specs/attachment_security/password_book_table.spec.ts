import { test, expect } from '../../fixtures/auth.fixture';
import { navigateToAttachmentSecurity, switchToTab } from './helpers';

test.describe('Password Book Table', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    await switchToTab(authenticatedPage, 'encrypted');
    await expect(authenticatedPage.locator('[data-testid="encrypted-attachment-tab"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="password-book-table"]')).toBeVisible();
  });

  test('password book section is visible', async ({ authenticatedPage }) => {
    const table = authenticatedPage.locator('[data-testid="password-book-table"]');
    await expect(table).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="password-book-add-btn"]')).toBeVisible();
  });

  test('add form is inline', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.locator('[data-testid="password-book-add-form"]')).toBeVisible();
  });

  test('adding a password with empty string is blocked', async ({ authenticatedPage }) => {
    await authenticatedPage.locator('[data-testid="password-book-add-btn"]').click();
    await expect(authenticatedPage.getByText('密码不能为空')).toBeVisible();
  });

  test('add password flow', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.locator('[data-testid="password-book-add-form"]')).toBeVisible();

    const form = authenticatedPage.locator('[data-testid="password-book-add-form"]');
    const inputs = form.locator('input');
    const value = `test-password-e2e-${Date.now()}`;
    await inputs.first().fill(value);
    if (await inputs.count() > 1) {
      await inputs.nth(1).fill('E2E test entry');
    }

    await authenticatedPage.locator('[data-testid="password-book-confirm-add"]').click();

    const toast = authenticatedPage.locator('[data-sonner-toast], [role="status"]').first();
    try {
      await toast.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      // toast may not appear if API unavailable
    }
    const row = authenticatedPage.locator('[data-testid^="password-book-row-"]').filter({ hasText: value });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '删除' }).click();
  });

  test('delete password is immediate without a confirm dialog', async ({ authenticatedPage }) => {
    const value = `delete-me-${Date.now()}`;
    await authenticatedPage.getByTestId('password-book-input').fill(value);
    await authenticatedPage.getByTestId('password-book-confirm-add').click();
    const row = authenticatedPage.locator('[data-testid^="password-book-row-"]').filter({ hasText: value });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '删除' }).click();
    await expect(authenticatedPage.getByText('密码已删除')).toBeVisible();
    await expect(row).toHaveCount(0);
    await expect(authenticatedPage.getByRole('alertdialog')).toHaveCount(0);
  });
});
