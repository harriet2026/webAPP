import { test, expect } from '../fixtures/auth.fixture';

const STATS = { total: 156, unconfirmed: 12, processing: 8, resolved: 136, critical: 2, major: 5 };
const ALERTS = {
  items: [
    { id: 1, rule_id: 1, rule_name: 'data dir', metric_key: 'data_dir_usage', module: 'system', node: 'node-1', source: '系统资源', fingerprint: 'f1', severity: 'p0', status: 'unconfirmed', message: '数据目录使用率 96%', metric_value: 96, threshold: 90, count: 1, first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), confirmed_by: null, confirmed_at: null, resolved_by: null, resolved_at: null, resolved_reason: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 2, rule_id: 2, rule_name: 'deferred', metric_key: 'queue_deferred', module: 'mailflow_queue', node: 'node-2', source: '邮件流', fingerprint: 'f2', severity: 'p1', status: 'processing', message: 'deferred队列堆积 62,341', metric_value: 62341, threshold: 50000, count: 3, first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), confirmed_by: 'admin', confirmed_at: null, resolved_by: null, resolved_at: null, resolved_reason: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ],
  total: 2, page: 1, page_size: 50,
};
const DETAIL = {
  ...ALERTS.items[0],
  id: 99,
  message: '详情深链告警',
  fingerprint: 'deep-link-99',
};

async function mock(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/monitor/alerts/stats', (r) => r.fulfill({ json: STATS }));
  await page.route('**/api/v1/monitor/alerts/99', (r) => r.fulfill({ json: DETAIL }));
  await page.route(/\/api\/v1\/monitor\/alerts(\?.*)?$/, (r) => r.fulfill({ json: ALERTS }));
}

test.describe('Alert Center — realtime', () => {
  test.beforeEach(async ({ authenticatedPage }) => { await mock(authenticatedPage); });

  test('TC001 default tab is realtime with 3 tabs + 6 stat cards', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.waitForLoadState('networkidle');
    for (const tab of ['实时告警', '告警规则', '通知设置']) {
      await expect(authenticatedPage.getByRole('tab', { name: tab })).toBeVisible({ timeout: 5000 });
    }
    await expect(authenticatedPage.getByTestId('stat-unconfirmed')).toContainText('12');
    await expect(authenticatedPage.getByTestId('stat-critical')).toContainText('2');
  });

  test('TC002-004 severity/status filter + search present', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage.getByPlaceholder(/搜索/)).toBeVisible();
    const combos = authenticatedPage.locator('[role="combobox"]');
    expect(await combos.count()).toBeGreaterThanOrEqual(2);
  });

  test('TC005-006 select rows shows batch bar with confirm/resolve', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.getByTestId('alert-row-1').getByRole('checkbox').check();
    const bar = authenticatedPage.getByTestId('batch-bar');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: /批量确认/ })).toBeVisible();
    await expect(bar.getByRole('button', { name: /批量解决/ })).toBeVisible();
  });

  test('TC007-008 row menu has confirm / start-process / resolve', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.getByTestId('alert-row-1').getByRole('button').last().click();
    for (const item of ['确认', '开始处理', '解决']) {
      await expect(authenticatedPage.getByRole('menuitem', { name: new RegExp(item) })).toBeVisible();
    }
  });

  test('TC009 unconfirmed row is severity-tinted', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.waitForLoadState('networkidle');
    const row = authenticatedPage.getByTestId('alert-row-1');
    await expect(row).toHaveAttribute('data-status', 'unconfirmed');
    const cls = await row.getAttribute('class');
    expect(cls).toContain('bg-red-50');
  });

  test('TC010 detail deep link loads an alert outside the current list page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts?id=99');
    await expect(authenticatedPage.getByTestId('alert-detail-drawer')).toBeVisible();
    await expect(authenticatedPage.getByTestId('alert-detail-drawer')).toContainText('详情深链告警');
    await expect(authenticatedPage.getByTestId('alert-detail-status')).toContainText('未确认');
  });
});
