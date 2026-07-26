import { Page, Locator } from '@playwright/test';

export class SecurityOverviewPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly kpiCards: Locator;
  readonly directionSelect: Locator;
  readonly timeRangeButtons: Locator;
  readonly viewByTabs: Locator;
  readonly exportCsvButton: Locator;
  readonly tenantScopeTrigger: Locator;

  // FilterBar uses SegmentedControl (plain <button>s with i18n text labels), not
  // a Radix select — target by accessible button name. zh labels per
  // messages/zh.json securityOverview.filter.{direction,timeRange}.
  private static readonly DIRECTION_LABELS: Record<string, string> = {
    all: '全部', receive: '接收', send: '外发', internal: '域内',
  };
  // GT-11979/11930 added 自定义 as a sixth segment (PRD F1: presets + 自定义起止日期).
  private static readonly TIME_RANGE_RE = /^(今天|近7天|近30天|本月|上月|自定义)$/;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.kpiCards = page.locator('main .grid.gap-4 > div');
    this.directionSelect = page.locator('main').getByRole('button', { name: '全部', exact: true }).first();
    this.timeRangeButtons = page.locator('main').getByRole('button', { name: SecurityOverviewPage.TIME_RANGE_RE });
    this.viewByTabs = page.locator('main [data-slot="tabs-trigger"]');
    this.exportCsvButton = page.locator('main a[download]').filter({ hasText: /CSV|导出|Export/ }).first();
    // F9 tenant scope combobox — only rendered for platform viewer in multi-tenant form.
    this.tenantScopeTrigger = page.locator('main [role="combobox"]').first();
  }

  async goto() {
    await this.page.goto('/zh/statistics/security-overview');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible', timeout: 15000 });
  }

  async getKpiCardCount() {
    return this.kpiCards.count();
  }

  async selectDirection(value: string) {
    const label = SecurityOverviewPage.DIRECTION_LABELS[value] ?? value;
    const button = this.page.locator('main').getByRole('button', { name: label, exact: true }).first();
    await button.waitFor({ state: 'visible', timeout: 5000 });
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/statistics/security-overview') && resp.status() === 200,
      { timeout: 10000 },
    ).catch(() => null);
    await button.click();
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  async clickTimeRange(index: number) {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/statistics/security-overview') && resp.status() === 200,
      { timeout: 10000 },
    ).catch(() => null);
    await this.timeRangeButtons.nth(index).click();
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  // ---- GT-11979 / GT-11930: custom date range ----

  get customRangeButton() {
    return this.page.locator('main').getByRole('button', { name: '自定义', exact: true });
  }

  get customStartInput() {
    return this.page.locator('main').getByLabel('开始日期');
  }

  get customEndInput() {
    return this.page.locator('main').getByLabel('结束日期');
  }

  get customRangeError() {
    return this.page.locator('main [role="alert"]');
  }

  async selectCustomRange() {
    await this.customRangeButton.click();
    await this.customStartInput.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Set both endpoints and wait for the refetch the (valid) range triggers.
   *
   * Waits for the response whose URL actually carries the requested interval —
   * NOT merely "a security-overview response". FilterBar debounces, but the two
   * fields are still filled separately, so a naive waitForResponse could settle
   * on a stale in-flight request and the caller would read the previous range's
   * KPIs.
   */
  async setCustomRange(start: string, end: string) {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/statistics/security-overview') &&
        resp.url().includes(`start_date=${start}`) &&
        resp.url().includes(`end_date=${end}`) &&
        resp.status() === 200,
      { timeout: 15000 },
    );
    await this.customStartInput.fill(start);
    await this.customEndInput.fill(end);
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  async clickViewByTab(index: number) {
    await this.viewByTabs.nth(index).click();
    await this.page.waitForTimeout(500);
  }

  getViewByTabs() {
    return this.viewByTabs;
  }

  async selectTenantScope(name: string) {
    await this.tenantScopeTrigger.click();
    const input = this.page.locator('[data-slot="command-input"], [cmdk-input]').first();
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill(name);
    // Search is debounced (300ms) + server-filtered; wait for the matching item
    // to actually render rather than racing a fixed timeout.
    const item = this.page.locator('[data-slot="command-item"], [cmdk-item]').filter({ hasText: name }).first();
    await item.waitFor({ state: 'visible', timeout: 10000 });
    await item.click();
    await this.page.waitForTimeout(500);
  }
}
