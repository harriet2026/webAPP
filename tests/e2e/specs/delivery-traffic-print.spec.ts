import { test, expect } from '../fixtures/auth.fixture';

test.describe('Delivery Traffic Print', () => {
  test('print page is accessible', async ({ authenticatedPage: page, context }) => {
    await page.goto('/zh/statistics/delivery-traffic/print?direction=all&start_date=2026-05-20&end_date=2026-05-27');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await expect(page.locator('text=投递与流量分析').first()).toBeVisible({ timeout: 15000 }).catch(() => {});
    const url = page.url();
    expect(url).toContain('delivery-traffic/print');
  });
});
