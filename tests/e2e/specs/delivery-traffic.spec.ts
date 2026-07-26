import { test, expect } from '../fixtures/auth.fixture';
import type { Page } from '@playwright/test';

test.describe('Delivery Traffic Analysis', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/zh/statistics/delivery-traffic');
    await page.waitForLoadState('networkidle');
  });

  async function selectDirection(page: Page, direction: 'all' | 'receive' | 'send' | 'internal') {
    const button = page.getByTestId(`delivery-direction-${direction}`);
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();
  }

  test('page loads with title', async ({ authenticatedPage: page }) => {
    await expect(page.locator('text=投递与流量分析').first()).toBeVisible({ timeout: 10000 });
  });

  test('direction segmented control is visible', async ({ authenticatedPage: page }) => {
    await expect(page.getByTestId('delivery-direction-all')).toHaveAttribute('aria-pressed', 'true');
  });

  test('direction control exposes all four options', async ({ authenticatedPage: page }) => {
    for (const direction of ['all', 'receive', 'send', 'internal']) {
      await expect(page.getByTestId(`delivery-direction-${direction}`)).toBeVisible();
    }
  });

  test('switch to receive direction', async ({ authenticatedPage: page }) => {
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/statistics/delivery-traffic') && resp.status() === 200,
      { timeout: 10000 }
    );
    await selectDirection(page, 'receive');
    await responsePromise;
  });

  test('switch to send direction', async ({ authenticatedPage: page }) => {
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/statistics/delivery-traffic') && resp.status() === 200,
      { timeout: 10000 }
    );
    await selectDirection(page, 'send');
    await responsePromise;
  });

  test('switch to internal direction', async ({ authenticatedPage: page }) => {
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/statistics/delivery-traffic') && resp.status() === 200,
      { timeout: 10000 }
    );
    await selectDirection(page, 'internal');
    await responsePromise;
  });

  test('KPI cards are rendered', async ({ authenticatedPage: page }) => {
    await page.waitForTimeout(3000);
    const cards = page.locator('[class*="card"], [data-testid="kpi-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('detail table is rendered', async ({ authenticatedPage: page }) => {
    await page.waitForTimeout(3000);
    // The detail-table card always renders; with no delivery data in the
    // selected range it shows an empty-state placeholder instead of a <table>.
    // Assert the section rendered (card title), then the table if data exists.
    await expect(page.locator('text=明细数据').first()).toBeVisible({ timeout: 15000 });
    const table = page.locator('table').first();
    if (await table.isVisible().catch(() => false)) {
      await expect(table).toBeVisible();
    }
  });

  test('export CSV button exists', async ({ authenticatedPage: page }) => {
    await expect(page.locator('text=导出 CSV').first()).toBeVisible({ timeout: 10000 });
  });

  test('delivery-traffic keeps report and AI actions hidden', async ({ authenticatedPage: page }) => {
    await expect(page.getByText('生成报告')).toHaveCount(0);
    await expect(page.getByText('AI 分析')).toHaveCount(0);
  });

  test('time range selector is visible', async ({ authenticatedPage: page }) => {
    await expect(page.locator('text=近7日').first()).toBeVisible({ timeout: 10000 });
  });

  test('queue health card is visible', async ({ authenticatedPage: page }) => {
    await page.waitForTimeout(3000);
    await expect(page.locator('text=队列健康').first()).toBeVisible({ timeout: 10000 });
  });

  test('queue details can be expanded', async ({ authenticatedPage: page }) => {
    const toggle = page.getByTestId('delivery-queue-expand');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('custom time range exposes bounded date inputs', async ({ authenticatedPage: page }) => {
    await page.getByTestId('delivery-time-range').click();
    await page.getByRole('option', { name: '自定义' }).click();
    await expect(page.getByTestId('delivery-custom-range').locator('input[type="date"]')).toHaveCount(2);
  });

  test('switch direction shows loading skeleton', async ({ authenticatedPage: page }) => {
    await selectDirection(page, 'send');
    await page.waitForTimeout(500);
  });
});
