import { Page, Locator } from '@playwright/test';

// System-status dashboard (`/zh/dashboard`, Plan Task 7/8) Page Object.
//
// Locator strategy notes:
// - The KPI grid is the only `main` grid using `gap-4` (the two grids below
//   it — trend/todo and agents/top5/health — both use `gap-6`), so
//   `main div.grid.gap-4` uniquely targets it without a test-id.
// - Card identity is asserted by translated card-title text (messages/zh.json
//   `systemStatus.*`), matching the house convention used by
//   security-overview.page.ts / product-form-switcher.spec.ts rather than
//   inventing data-testids this component doesn't have.
export const EMAIL_TYPE_LABEL_ZH: Record<string, string> = {
  normal: '正常',
  subscription: '订阅',
  advertising: '广告',
  spam: '垃圾',
  harmful: '有害内容',
  suspicious: '可疑',
  sensitive: '敏感内容',
  spoofing: '身份仿冒',
  phishing: '钓鱼',
  virus: '病毒',
  account_compromised: '账号被盗',
};

export const EMAIL_TYPES = Object.keys(EMAIL_TYPE_LABEL_ZH);

/** Builds a full 0-filled counts record (backend always returns all 11 keys). */
export function zeroedCounts(overrides: Record<string, number> = {}): Record<string, number> {
  return Object.fromEntries(EMAIL_TYPES.map((k) => [k, overrides[k] ?? 0]));
}

/** Builds a deterministic `/statistics/type` response for legend-toggle tests. */
export function mockTypeStatistics(bucketOverrides: Record<string, number>[]) {
  const timeSeries = bucketOverrides.map((overrides, i) => ({
    timestamp: `2026-06-${String(20 + i).padStart(2, '0')}`,
    counts: zeroedCounts(overrides),
  }));
  const totals = zeroedCounts();
  for (const bucket of timeSeries) {
    for (const k of EMAIL_TYPES) totals[k] += bucket.counts[k];
  }
  return { type_counts: totals, time_series: timeSeries };
}

export class SystemStatusPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly kpiGrid: Locator;
  readonly kpiCards: Locator;
  readonly nodeCard: Locator;
  readonly healthCard: Locator;
  readonly agentsCard: Locator;
  readonly trendCard: Locator;
  readonly trendEmptyState: Locator;
  readonly todoCard: Locator;
  readonly viewAllAlertsLink: Locator;
  readonly rangeSelectTrigger: Locator;
  readonly refreshButton: Locator;
  readonly legendBar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.kpiGrid = page.locator('main div.grid.gap-4').first();
    this.kpiCards = this.kpiGrid.locator('> a');
    this.nodeCard = this.kpiCards.filter({ hasText: '系统在线节点' });
    this.healthCard = page.locator('main').getByText('系统与服务健康', { exact: true });
    this.agentsCard = page.locator('main').getByText('智能体运行概况', { exact: true });
    // 威胁态势趋势 card (threat-trend.tsx) — stable data-testid.
    this.trendCard = page.getByTestId('system-status-trend-card');
    this.trendEmptyState = page.getByTestId('system-status-trend-empty');
    this.todoCard = page.getByTestId('system-status-todo-card');
    this.viewAllAlertsLink = page.getByTestId('system-status-todo-view-all');
    this.rangeSelectTrigger = page.getByTestId('system-status-range-trigger');
    this.refreshButton = page.getByTestId('system-status-refresh');
    // Threat-trend legend row (data-testid `system-status-trend-legend`).
    this.legendBar = page.getByTestId('system-status-trend-legend');
  }

  async goto() {
    await this.page.goto('/zh/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** Legend pill button for a threat series (threat-trend.tsx, keyed by series key). */
  legendButton(type: string) {
    return this.page.getByTestId(`system-status-trend-legend-${type}`);
  }

  /** Opens the range `<Select>` and picks the option by its visible zh label. */
  async selectRange(label: string) {
    await this.rangeSelectTrigger.click();
    const listbox = this.page.locator('[role="listbox"]').first();
    await listbox.waitFor({ state: 'visible', timeout: 5000 });
    await this.page.locator('[role="option"]').filter({ hasText: label }).first().click();
  }
}
