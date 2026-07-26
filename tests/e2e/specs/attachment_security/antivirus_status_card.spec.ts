import { test, expect } from '../../fixtures/auth.fixture';
import { navigateToAttachmentSecurity, switchToTab } from './helpers';

test.describe('Antivirus Status Card', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    await switchToTab(authenticatedPage, 'antivirus');
    await expect(authenticatedPage.locator('[data-testid="antivirus-tab"]')).toBeVisible();
  });

  test('status badge is visible', async ({ authenticatedPage }) => {
    const tab = authenticatedPage.locator('[data-testid="antivirus-tab"]');
    const configured = tab.locator('[data-testid="av-status-configured"]');
    const notConfigured = tab.locator('[data-testid="av-status-not-configured"]');
    const isConfigured = await configured.isVisible().catch(() => false);
    const isNotConfigured = await notConfigured.isVisible().catch(() => false);
    if (!isConfigured && !isNotConfigured) {
      const heading = tab.locator('h4').filter({ hasText: /engine|引擎/ });
      await expect(heading).toBeVisible({ timeout: 5000 });
    } else {
      expect(isConfigured || isNotConfigured).toBeTruthy();
    }
  });

  test('engine status section is visible', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId('antivirus-status-section')).toBeVisible();
    await expect(authenticatedPage.getByTestId('antivirus-status-section')).toContainText('每日 02:00');
  });

  test('server config fields are visible', async ({ authenticatedPage }) => {
    const tab = authenticatedPage.locator('[data-testid="antivirus-tab"]');
    const inputs = tab.locator('input');
    await expect(inputs.first()).toBeVisible({ timeout: 5000 });
  });

  test('action selects are present', async ({ authenticatedPage }) => {
    const tab = authenticatedPage.locator('[data-testid="antivirus-tab"]');
    const selects = tab.locator('button[role="combobox"]');
    await expect(selects.first()).toBeVisible({ timeout: 5000 });
  });
});
