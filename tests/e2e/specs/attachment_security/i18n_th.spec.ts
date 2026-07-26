import { test, expect } from '../../fixtures/auth.fixture';
import { navigateToAttachmentSecurity } from './helpers';

const EXPECTED_TABS_TH: Record<string, string> = {
  basicLimit: 'ข้อจำกัดพื้นฐาน',
  antivirus: 'เอนจินป้องกันไวรัส',
  image: 'การจดจำภาพ',
  encrypted: 'ไฟล์แนบที่เข้ารหัส',
};

test.describe('i18n Thai (th)', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage, 'th');
  });

  test('title is present', async ({ authenticatedPage }) => {
    const title = authenticatedPage.locator('[data-testid="attachment-security-title"]');
    const text = await title.textContent();
    const isThai = text === 'การรักษาความปลอดภัยไฟล์แนบ';
    expect(isThai).toBeTruthy();
  });

  test('tab labels are present', async ({ authenticatedPage }) => {
    for (const [key, expected] of Object.entries(EXPECTED_TABS_TH)) {
      const tab = authenticatedPage.locator(`[data-testid="tab-${key}"]`);
      await expect(tab).toHaveText(expected);
    }
  });
});
