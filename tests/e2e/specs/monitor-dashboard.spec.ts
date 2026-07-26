import { test, expect } from '../fixtures/auth.fixture';
import { MonitorDashboardPage } from '../pages/monitor-dashboard.page';

// 按 design/origin/demo/docs/html_spec/monitor-dashboard/ 生成监控总览用例。
// 三类：UI（界面还原）/ 业务（后端聚合生效）/ API（接口契约）。
// 如实验证原型，不为通过而测试。

const APISERVER = process.env.APISERVER_BASE_URL || 'http://localhost:18080';

test.describe('监控总览（monitor-dashboard）', () => {
  // ---------------- UI 用例：界面还原 ----------------
  test.describe('UI 界面还原', () => {
    test('页面加载：页头 + 6 KPI 卡 + 双趋势图 + 告警健康 + 跑马灯 + 双选择器', async ({ authenticatedPage }) => {
      const page = new MonitorDashboardPage(authenticatedPage);
      await page.goto();
      await expect(page.heading).toHaveText(/监控总览|Monitor Overview/);
      // 6 张 KPI 卡（与 html_spec 一致）
      for (const key of await page.kpiKeys()) {
        await expect(page.kpiCard(key)).toBeVisible();
      }
      await expect(page.mailflowTrend).toBeVisible();
      await expect(page.engineTrend).toBeVisible();
      await expect(page.alertsHealth).toBeVisible();
      await expect(page.alertMarquee).toBeVisible();
      await expect(page.rangeSelect).toBeVisible();
      await expect(page.refreshSelect).toBeVisible();
      await expect(page.refreshBtn).toBeVisible();
      await expect(page.lastUpdate).toBeVisible();
    });

    test('告警健康显示 未确认/处理中/已解决 三态', async ({ authenticatedPage }) => {
      const page = new MonitorDashboardPage(authenticatedPage);
      await page.goto();
      await expect(page.alertsHealth.getByText(/未确认|Unconfirmed/)).toBeVisible();
      await expect(page.alertsHealth.getByText(/处理中|Processing/)).toBeVisible();
      await expect(page.alertsHealth.getByText(/已解决|Resolved/)).toBeVisible();
    });

    test('告警跑马灯使用后端最近告警（最多 4 条）', async ({ authenticatedPage }) => {
      const page = new MonitorDashboardPage(authenticatedPage);
      await page.goto();
      const items = authenticatedPage.locator('[data-testid^="monitor-dashboard-marquee-item-"]');
      expect(await items.count()).toBeLessThanOrEqual(4);
      for (let index = 0; index < await items.count(); index += 1) {
        await expect(items.nth(index)).toHaveAttribute('href', /\/monitoring\/alerts\?id=\d+/);
      }
    });

    test('切换时间范围 → 重新请求对应 range 的后端接口', async ({ authenticatedPage }) => {
      const page = new MonitorDashboardPage(authenticatedPage);
      await page.goto();
      const request = authenticatedPage.waitForResponse((response) =>
        response.url().includes('/api/v1/monitor-dashboard/overview?range=7d'));
      await page.rangeSelect.click();
      await authenticatedPage.getByRole('option', { name: /7天|7d/ }).first().click();
      expect((await request).ok()).toBeTruthy();
    });
  });

  // ---------------- 业务用例：后端聚合生效 ----------------
  test.describe('业务 后端聚合生效', () => {
    test('GET /monitor-dashboard/overview 返回 mail_log 聚合的 KPI/趋势/告警健康', async ({ authenticatedPage }) => {
      const resp = await authenticatedPage.request.get(
        `${APISERVER}/api/v1/monitor-dashboard/overview?range=today`,
      );
      expect(resp.ok()).toBeTruthy();
      const body = await resp.json();
      expect(body.range).toBe('today');
      expect(typeof body.kpi.today_volume).toBe('number');
      expect(typeof body.kpi.delivery_success_rate).toBe('number');
      expect(Array.isArray(body.mailflow_trend)).toBeTruthy();
      expect(Array.isArray(body.engine_trend)).toBeTruthy();
      expect(body.alert_health).toHaveProperty('unconfirmed');
      expect(body.alert_health).toHaveProperty('processing');
      expect(body.alert_health).toHaveProperty('resolved');
    });

    test('切换 range 参数 → 后端按范围聚合（range 字段回显）', async ({ authenticatedPage }) => {
      for (const r of ['24h', '7d', '30d']) {
        const resp = await authenticatedPage.request.get(
          `${APISERVER}/api/v1/monitor-dashboard/overview?range=${r}`,
        );
        expect(resp.ok()).toBeTruthy();
        const body = await resp.json();
        expect(body.range).toBe(r);
      }
    });
  });

  // ---------------- API 用例：接口契约 ----------------
  test.describe('API 接口契约', () => {
    test('响应结构含全部约定字段', async ({ authenticatedPage }) => {
      const resp = await authenticatedPage.request.get(
        `${APISERVER}/api/v1/monitor-dashboard/overview?range=today`,
      );
      expect(resp.ok()).toBeTruthy();
      const body = await resp.json();
      // kpi 全字段
      for (const f of [
        'today_volume', 'volume_change', 'delivery_success_rate', 'delivery_success_change',
        'queue_depth', 'threats', 'nodes_online', 'nodes_total', 'engines_healthy',
        'engines_total', 'todo', 'critical_todo', 'major_todo',
      ]) {
        expect(body.kpi, `kpi.${f}`).toHaveProperty(f);
      }
      expect(body).toHaveProperty('infrastructure');
      expect(body).toHaveProperty('mailflow_health');
      expect(Array.isArray(body.engine_health)).toBeTruthy();
      expect(Array.isArray(body.recent_alerts)).toBeTruthy();
      expect(typeof body.degraded).toBe('boolean');
      // 趋势点字段
      if (body.mailflow_trend.length > 0) {
        expect(body.mailflow_trend[0]).toHaveProperty('time');
        expect(body.mailflow_trend[0]).toHaveProperty('volume');
        expect(body.mailflow_trend[0]).toHaveProperty('latency_p95');
      }
      if (body.engine_trend.length > 0) {
        for (const f of ['antispam', 'antivirus', 'sandbox', 'rbl']) {
          expect(body.engine_trend[0], `engine_trend[0].${f}`).toHaveProperty(f);
        }
      }
    });

    test('非法 range 回退 today（不报错）', async ({ authenticatedPage }) => {
      const resp = await authenticatedPage.request.get(
        `${APISERVER}/api/v1/monitor-dashboard/overview?range=bogus`,
      );
      expect(resp.ok()).toBeTruthy();
      const body = await resp.json();
      expect(body.range).toBe('today');
    });

    test('未认证访问返回 401', async ({ request }) => {
      const resp = await request.get(`${APISERVER}/api/v1/monitor-dashboard/overview?range=today`);
      expect([401, 403]).toContain(resp.status());
    });
  });
});
