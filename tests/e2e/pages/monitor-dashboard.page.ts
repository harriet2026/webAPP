import { Page, Locator } from '@playwright/test';

// 监控总览页 Page Object（对齐 design/origin/demo/docs/html_spec/monitor-dashboard/）
export class MonitorDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly rangeSelect: Locator;
  readonly refreshSelect: Locator;
  readonly refreshBtn: Locator;
  readonly lastUpdate: Locator;
  readonly mailflowTrend: Locator;
  readonly engineTrend: Locator;
  readonly alertsHealth: Locator;
  readonly alertMarquee: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('[data-testid="monitor-dashboard-page"] h1');
    this.rangeSelect = page.locator('[data-testid="monitor-dashboard-range-select"]');
    this.refreshSelect = page.locator('[data-testid="monitor-dashboard-refresh-select"]');
    this.refreshBtn = page.locator('[data-testid="monitor-dashboard-refresh-btn"]');
    this.lastUpdate = page.locator('[data-testid="monitor-dashboard-last-update"]');
    this.mailflowTrend = page.locator('[data-testid="monitor-dashboard-mailflow-trend"]');
    this.engineTrend = page.locator('[data-testid="monitor-dashboard-engine-trend"]');
    this.alertsHealth = page.locator('[data-testid="monitor-dashboard-alerts-health"]');
    this.alertMarquee = page.locator('[data-testid="monitor-dashboard-alert-marquee"]');
  }

  async goto() {
    await this.page.goto('/zh/monitoring/dashboard');
    await this.heading.waitFor({ state: 'visible', timeout: 30000 });
  }

  kpiCard(key: string) {
    return this.page.locator(`[data-testid="monitor-dashboard-kpi-${key}"]`);
  }

  marqueeItem(id: number) {
    return this.page.locator(`[data-testid="monitor-dashboard-marquee-item-${id}"]`);
  }

  async kpiKeys() {
    return ['today-volume', 'delivery-rate', 'queue-depth', 'alerts', 'nodes', 'todo'];
  }
}
