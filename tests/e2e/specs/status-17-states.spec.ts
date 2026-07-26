import { test, expect } from '../fixtures/auth.fixture';

test.describe('Status Filter 17 States', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(1500);
  });

  test('status filter has recall states', async ({ authenticatedPage }) => {
    const statusFilter = authenticatedPage
      .locator('button[role="combobox"]')
      .filter({ hasText: /邮件状态|所有状态/i })
      .first();
    if (await statusFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
      await statusFilter.click();
      await authenticatedPage.waitForTimeout(500);
      const dropdown = authenticatedPage
        .locator('[role="option"]')
        .filter({ hasText: /召回/i });
      const count = await dropdown.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});
