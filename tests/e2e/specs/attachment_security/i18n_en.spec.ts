import { test, expect } from '../../fixtures/auth.fixture';
import { navigateToAttachmentSecurity } from './helpers';

const EXPECTED_TABS_EN: Record<string, string> = {
  basicLimit: 'Basic Limits',
  antivirus: 'Antivirus Engine',
  image: 'Image Recognition',
  encrypted: 'Encrypted Attachments',
};

test.describe('i18n English (en)', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage, 'en');
  });

  test('title is in English when locale is en', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const title = page.locator('[data-testid="attachment-security-title"]');
    const text = await title.textContent();
    const isEn = text === 'Attachment Security';
    expect(isEn).toBeTruthy();
  });

  test('tab labels match expected English text', async ({ authenticatedPage }) => {
    for (const [key, en] of Object.entries(EXPECTED_TABS_EN)) {
      const tab = authenticatedPage.locator(`[data-testid="tab-${key}"]`);
      const text = await tab.textContent();
      expect(text).toContain(en);
    }
  });

  test('master switch label is present', async ({ authenticatedPage }) => {
    // ModuleMasterSwitch 容器（data-testid 由 page prop 派生）。
    const switchContainer = authenticatedPage.locator(
      '[data-testid="module-master-switch-attachment_security"]',
    );
    await expect(switchContainer).toBeVisible();
  });
});
