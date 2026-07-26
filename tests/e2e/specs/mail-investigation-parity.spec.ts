import { test, expect } from '../fixtures/auth.fixture';

test.describe('Mail Investigation Center', () => {
  test('investigation route shows investigation title', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/logs/mail-investigation');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(1500);
    const heading = authenticatedPage.locator('main h1');
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('disposal route shows disposal title', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(1500);
    const heading = authenticatedPage.locator('main h1');
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
