import { test, expect } from '../../fixtures/auth.fixture';
import { navigateToAttachmentSecurity } from './helpers';

const EXPECTED_TABS_RU: Record<string, string> = {
  basicLimit: 'Базовые ограничения',
  antivirus: 'Антивирусный движок',
  image: 'Распознавание изображений',
  encrypted: 'Зашифрованные вложения',
};

test.describe('i18n Russian (ru)', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage, 'ru');
  });

  test('title is present', async ({ authenticatedPage }) => {
    const title = authenticatedPage.locator('[data-testid="attachment-security-title"]');
    const text = await title.textContent();
    const isRu = text === 'Безопасность вложений';
    expect(isRu).toBeTruthy();
  });

  test('tab labels are present', async ({ authenticatedPage }) => {
    for (const [key, expected] of Object.entries(EXPECTED_TABS_RU)) {
      const tab = authenticatedPage.locator(`[data-testid="tab-${key}"]`);
      await expect(tab).toHaveText(expected);
    }
  });
});
