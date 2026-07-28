import { test, expect } from '../fixtures/auth.fixture';
import { mkdir } from 'node:fs/promises';

test('今日趋势请求并渲染完整的 00:00-23:00 小时序列 (GT-12594)', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/zh/statistics/delivery-traffic');
  await expect(authenticatedPage.getByText('投递与流量分析').first()).toBeVisible();

  const responsePromise = authenticatedPage.waitForResponse((response) => {
    const url = response.url();
    return url.includes('/statistics/delivery-traffic?')
      && url.includes('interval=hour')
      && response.request().method() === 'GET';
  });
  await authenticatedPage.getByTestId('delivery-time-range-today').click();
  const response = await responsePromise;

  expect(response.ok()).toBeTruthy();
  const body = await response.json() as {
    trend: {
      granularity: string;
      points: Array<{ date: string }>;
    };
  };
  const today = await authenticatedPage.evaluate(() => {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
  });

  expect(body.trend.granularity).toBe('hour');
  expect(body.trend.points).toHaveLength(24);
  expect(body.trend.points[0].date).toBe(`${today}T00:00`);
  expect(body.trend.points[23].date).toBe(`${today}T23:00`);

  const trendCard = authenticatedPage.getByTestId('delivery-main-analysis').locator('[data-slot="card"]').first();
  await expect(trendCard.locator('canvas')).toBeVisible();
  await mkdir('/tmp/gt-12594', { recursive: true });
  await authenticatedPage.screenshot({
    path: '/tmp/gt-12594/delivery-traffic-today-hourly.png',
    fullPage: true,
  });
  await trendCard.screenshot({
    path: '/tmp/gt-12594/delivery-traffic-today-hourly-chart.png',
  });
});
