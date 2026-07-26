import { test, expect } from '../fixtures/auth.fixture';

// GT-11988: the 三方向对比 (proportion) donut used to render a *blank* ECharts
// donut (a ring with total=0 draws nothing but the legend) when there was no
// delivery-traffic data, because the backend always emits three zero-value
// distribution items for direction=all. SideChart's length-only guard never
// fired, so instead of a clean "暂无数据" (like TrendChart) the region looked
// broken/missing. This spec pins the empty-state to "暂无数据" while keeping the
// with-data rendering intact.

const ZERO = {
  kpi: { inbound_total: 0, outbound_total: 0, internal_total: 0, total_success_rate: 0, queue_backlog: 0 },
  trend: { points: [] },
  distribution: [
    { name: 'receive', value: 0 },
    { name: 'send', value: 0 },
    { name: 'internal', value: 0 },
  ],
  latency: { buckets: [] },
  queue_health: { receive: 0, send: 0, internal: 0 },
  detail_table: [],
};

const DATA = {
  kpi: { inbound_total: 5927, outbound_total: 631, internal_total: 143, total_success_rate: 90.6, queue_backlog: 12 },
  trend: {
    points: [
      { date: '2026-07-10', receive: 800, send: 90, internal: 20 },
      { date: '2026-07-11', receive: 900, send: 100, internal: 25 },
      { date: '2026-07-12', receive: 850, send: 95, internal: 22 },
      { date: '2026-07-13', receive: 950, send: 110, internal: 30 },
    ],
  },
  distribution: [
    { name: 'receive', value: 5927 },
    { name: 'send', value: 631 },
    { name: 'internal', value: 143 },
  ],
  latency: { buckets: [] },
  queue_health: { receive: 3, send: 1, internal: 0 },
  detail_table: [],
};

async function stub(page: any, payload: any) {
  await page.route('**/api/v1/statistics/delivery-traffic?**', async (route: any) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
}

function donutCard(page: any) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: '流量占比' }) });
}

test.describe('Delivery Traffic — proportion donut empty-state (GT-11988)', () => {
  test('all-zero data shows 暂无数据, not a blank donut', async ({ authenticatedPage: page }) => {
    await stub(page, ZERO);
    await page.goto('/zh/statistics/delivery-traffic');
    await page.waitForLoadState('networkidle');

    const card = donutCard(page);
    await expect(card).toBeVisible({ timeout: 15000 });
    // Empty-state text present; no ECharts canvas drawn inside the donut card.
    await expect(card.getByText('暂无数据')).toBeVisible({ timeout: 10000 });
    await expect(card.locator('canvas')).toHaveCount(0);
  });

  test('with data the donut renders an ECharts canvas', async ({ authenticatedPage: page }) => {
    await stub(page, DATA);
    await page.goto('/zh/statistics/delivery-traffic');
    await page.waitForLoadState('networkidle');

    const card = donutCard(page);
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.locator('canvas')).toHaveCount(1, { timeout: 10000 });
    await expect(card.getByText('暂无数据')).toHaveCount(0);
  });
});
