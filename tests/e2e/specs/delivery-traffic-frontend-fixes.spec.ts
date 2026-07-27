import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const ZERO = {
  kpi: { inbound_total: 0, outbound_total: 0, internal_total: 0, total_success_rate: 0, queue_backlog: 0 },
  trend: { points: [] },
  distribution: [],
  latency: { buckets: [] },
  queue_health: { receive: 0, send: 0, internal: 0 },
  detail_table: [],
};

const DATA = {
  kpi: { inbound_total: 5927, outbound_total: 631, internal_total: 143, total_success_rate: 90.6, queue_backlog: 12 },
  trend: {
    points: [
      { date: '2026-07-20', receive: 800, send: 90, internal: 20, total: 910 },
      { date: '2026-07-21', receive: 900, send: 100, internal: 25, total: 1025 },
      { date: '2026-07-22', receive: 850, send: 95, internal: 22, total: 967 },
      { date: '2026-07-23', receive: 950, send: 110, internal: 30, total: 1090 },
    ],
  },
  distribution: [
    { name: 'user_not_exist', value: 21 },
    { name: 'mailbox_full', value: 13 },
    { name: 'policy_reject', value: 8 },
  ],
  latency: { buckets: [] },
  queue_health: { receive: 3, send: 1, internal: 0 },
  detail_table: [],
};

async function installSession(
  context: BrowserContext,
  page: Page,
  role: 'system_admin' | 'tenant_admin' = 'system_admin',
  mockEnabled = true,
) {
  await context.addCookies([
    { name: 'osgateway_token', value: `delivery-${role}`, domain: 'localhost', path: '/' },
    { name: 'osg_viewer', value: role === 'system_admin' ? 'platform' : 'tenant', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(({ selectedRole, useMock }) => {
    if (useMock) localStorage.setItem('osgateway_mock_enabled', '1');
    else localStorage.removeItem('osgateway_mock_enabled');
    localStorage.setItem('osgateway_user', JSON.stringify({
      id: selectedRole === 'system_admin' ? 1 : 2,
      username: `delivery-${selectedRole}`,
      role: selectedRole,
      role_id: null,
      is_super_admin: selectedRole === 'system_admin',
      tenant_id: selectedRole === 'tenant_admin' ? 2 : null,
      created_at: '2026-07-23T00:00:00Z',
      updated_at: '2026-07-23T00:00:00Z',
    }));
  }, { selectedRole: role, useMock: mockEnabled });
}

test.describe('Delivery traffic focused frontend fixes', () => {
  test('503 clears statistics, announces failure immediately and offers retry (GT-12460)', async ({ page, context }) => {
    await installSession(context, page, 'system_admin', false);
    let fail = false;
    await page.route('**/api/v1/**', async (route) => {
      if (!route.request().url().includes('/statistics/delivery-traffic?')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      } else if (fail) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'service_unavailable' } }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DATA) });
      }
    });

    await page.goto('/zh/statistics/delivery-traffic');
    await expect(page.getByText('5,927')).toBeVisible();
    fail = true;
    await page.getByTestId('delivery-direction-send').click();

    const alert = page.getByRole('alert').filter({ hasText: '投递统计加载失败' });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('button', { name: '重试' })).toBeVisible();
    await expect(page.getByText('5,927')).toHaveCount(0);

    fail = false;
    await alert.getByRole('button', { name: '重试' }).click();
    await expect(alert).toHaveCount(0);
  });

  test('platform tenant selection is page-local and remains selected (GT-12457)', async ({ page, context }) => {
    await installSession(context, page);
    await page.goto('/zh/statistics/delivery-traffic');

    const tenantPicker = page.getByTestId('delivery-traffic-filter-bar').getByRole('combobox').first();
    await expect(tenantPicker).toContainText('全部租户');
    await tenantPicker.click();
    await page.getByRole('option', { name: '示例租户 B (TENANT_B)' }).click();
    await expect(tenantPicker).toContainText('示例租户 B (TENANT_B)');
    await expect(page.getByText('全部租户', { exact: true })).toHaveCount(0);
  });

  test('tenant admin can export the CSV scoped to its own tenant (GT-12487)', async ({ page, context }) => {
    await installSession(context, page, 'tenant_admin');
    await page.goto('/zh/statistics/delivery-traffic');

    const exportButton = page.getByRole('button', { name: '导出 CSV' });
    await expect(exportButton).toBeEnabled();
    await expect(exportButton.locator('xpath=ancestor::a[1]')).toHaveAttribute('href', /tenant_id=2/);
  });

  test('empty detail data preserves headers and uses the explicit empty state (GT-12459)', async ({ page, context }) => {
    await installSession(context, page, 'system_admin', false);
    await page.route('**/api/v1/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: route.request().url().includes('/statistics/delivery-traffic?') ? JSON.stringify(ZERO) : '{}',
    }));
    await page.goto('/zh/statistics/delivery-traffic');

    const card = page.getByText('明细数据', { exact: true }).locator('xpath=ancestor::*[@data-slot="card"][1]');
    await expect(card.getByRole('columnheader', { name: '日期' })).toBeVisible();
    await expect(card.getByRole('columnheader', { name: '环比' })).toBeVisible();
    await expect(card.getByText('暂无数据')).toBeVisible();
  });

  test('receive chart uses the receive-side bounce title (GT-12458)', async ({ page, context }) => {
    await installSession(context, page, 'system_admin', false);
    await page.route('**/api/v1/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: route.request().url().includes('/statistics/delivery-traffic?') ? JSON.stringify(DATA) : '{}',
    }));
    await page.goto('/zh/statistics/delivery-traffic');
    await page.getByTestId('delivery-direction-receive').click();

    await expect(page.getByText('接收侧退信原因', { exact: true })).toBeVisible();
    await expect(page.getByText('退信原因分布', { exact: true })).toHaveCount(0);
  });

  test('trend canvas contracts from 1920px to 1280px without overflowing its card (GT-12456)', async ({ page, context }) => {
    await installSession(context, page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/zh/statistics/delivery-traffic');
    const analysis = page.getByTestId('delivery-main-analysis');
    const canvas = analysis.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const wide = await canvas.evaluate((node) => node.getBoundingClientRect().width);

    await page.setViewportSize({ width: 1280, height: 1080 });
    await expect.poll(() => canvas.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThan(wide);
    const narrow = await canvas.evaluate((node) => node.getBoundingClientRect().width);
    const cardWidth = await canvas.locator('xpath=ancestor::*[@data-slot="card"][1]').evaluate((node) => node.getBoundingClientRect().width);
    expect(narrow).toBeLessThanOrEqual(cardWidth);
  });

  test('Thai and Russian routes contain no English core-label fallback (GT-12488)', async ({ page, context }) => {
    await installSession(context, page);
    const englishFallbacks = [
      'Delivery & Traffic Analysis', 'Direction', 'Inbound Total', 'Queue Health', 'Detail Data', 'Export CSV',
    ];

    for (const locale of ['th', 'ru']) {
      await page.goto(`/${locale}/statistics/delivery-traffic`);
      for (const fallback of englishFallbacks) {
        await expect(page.getByText(fallback, { exact: true })).toHaveCount(0);
      }
    }
  });
});
