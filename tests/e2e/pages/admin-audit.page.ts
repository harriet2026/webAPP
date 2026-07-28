import { Page, Locator } from '@playwright/test';

// Chinese labels pulled from webapp/messages/zh.json (adminAudit block).
// The harness runs in the zh locale, so all selectors target Chinese text.
const L = {
  keywordPlaceholder: '关键词',
  modulePlaceholder: '操作模块',
  opTypePlaceholder: '操作类型',
  resultPlaceholder: '操作结果',
  tenantPlaceholder: '所属租户',
  resetText: '重置',
  emptyText: '暂无符合条件的操作记录',
  layerPlatform: '平台级操作',
  layerTenant: '租户级操作',
  colTimestamp: '时间',
  colAdminUser: '管理员',
  colEffectiveTenant: '生效租户',
  colModule: '操作模块',
  colOpType: '操作类型',
  colResourceType: '资源类型',
  colResult: '操作结果',
  colViewDetails: '查看详情',
  statTotal: '总数',
  statSuccess: '成功',
  statFailed: '失败',
  sectionSummary: '操作概要',
  sectionContent: '操作内容',
  sectionChangeDiff: '变更对比',
  sectionFailure: '失败原因',
  viewIconLabel: '查看详情',
};

/**
 * Page object for /zh/logs/admin-audit (rebuilt admin-audit UI).
 *
 * The rebuilt UI uses:
 *  - draft filters applied by 搜索 or Enter; Reset applies an empty draft
 *  - a shadcn Sheet (right drawer) for details, NOT a Dialog
 *  - layer Tabs (平台级操作 / 租户级操作) only when viewMode === 'platform'
 *  - three stat cards (总数 / 成功 / 失败)
 *  - a Table with columns 时间 / 操作者 / [生效租户] / 操作模块 / 操作类型 / 操作对象 / 结果 / 查看
 *
 * Selects are identified by the placeholder text inside their trigger.
 */
export class AdminAuditPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.table = page.locator('main table').first();
  }

  async goto() {
    await this.page.goto('/zh/logs/admin-audit');
    await this.page.waitForLoadState('networkidle');
    await this.expectLoaded();
    // Give react-query a moment to settle.
    await this.page.waitForTimeout(800);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
  }

  // ── Filters ──────────────────────────────────────────────────────────────

  keywordInput(): Locator {
    return this.page.locator('main input[placeholder="关键词"]');
  }

  /**
   * A select trigger chosen by the placeholder text shown when no value is
   * selected, OR by the currently-displayed value. We match on the trigger
   * button whose inner text contains the placeholder label.
   */
  private selectByPlaceholder(label: string): Locator {
    return this.page
      .locator('main [data-slot="select-trigger"]')
      .filter({ hasText: label })
      .first();
  }

  // Filters expose stable data-testids (admin-audit alignment 2026-07-25). The
  // former selectByPlaceholder() matched the trigger by its label text, which
  // broke once GT-12439 moved the label into a sibling <label> and set the
  // trigger placeholder to 全部. Locate by testid instead.
  moduleSelect(): Locator {
    return this.page.locator('[data-testid="admin-audit-filter-module"]');
  }

  opTypeSelect(): Locator {
    return this.page.locator('[data-testid="admin-audit-filter-optype"]');
  }

  resultSelect(): Locator {
    return this.page.locator('[data-testid="admin-audit-filter-result"]');
  }

  tenantSelect(): Locator {
    return this.page.locator('[data-testid="admin-audit-filter-tenant"]');
  }

  resetButton(): Locator {
    return this.page.locator('main button').filter({ hasText: L.resetText }).first();
  }

  searchButton(): Locator {
    return this.page.getByTestId('admin-audit-filter-search');
  }

  /**
   * Open a select and pick the option matching `optionText`.
   * The selection only edits the filter draft; callers explicitly search.
   */
  async selectOption(trigger: Locator, optionText: string) {
    await trigger.click();
    const option = this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: optionText })
      .first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    await this.page.waitForTimeout(100);
  }

  async fillKeyword(value: string) {
    const input = this.keywordInput();
    await input.fill(value);
  }

  async clickSearch() {
    const responsePromise = this.waitForListResponse().catch(() => {});
    await this.searchButton().click();
    await responsePromise;
    await this.page.waitForTimeout(400);
  }

  async pressEnterToSearch() {
    const responsePromise = this.waitForListResponse().catch(() => {});
    await this.keywordInput().press('Enter');
    await responsePromise;
    await this.page.waitForTimeout(400);
  }

  async clickReset() {
    const responsePromise = this.waitForListResponse().catch(() => {});
    await this.resetButton().click();
    await responsePromise;
    await this.page.waitForTimeout(400);
  }

  // ── Layer tabs (only present when viewMode === 'platform') ───────────────

  layerTabs(): Locator {
    return this.page.locator('main [data-slot="tabs-trigger"]');
  }

  layerTab(label: string): Locator {
    return this.page.locator('main [data-slot="tabs-trigger"]').filter({ hasText: label });
  }

  async activeLayerTab(): Promise<string | null> {
    const tabs = this.layerTabs();
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      const t = tabs.nth(i);
      const active = await t.getAttribute('data-active');
      if (active !== null) {
        return (await t.innerText()) || null;
      }
    }
    return null;
  }

  async clickLayerTab(label: string) {
    const responsePromise = this.waitForListResponse().catch(() => {});
    await this.layerTab(label).click();
    await responsePromise;
    await this.page.waitForTimeout(400);
  }

  // ── Stats cards ──────────────────────────────────────────────────────────

  statsCards(): Locator {
    // Each stat card is a div containing the label then the value.
    return this.page.locator('main div.rounded-xl.border.p-4');
  }

  /**
   * Read the numeric value of the stat card whose label matches `label`.
   * Returns null if not found / not numeric.
   */
  async statValue(label: string): Promise<number | null> {
    const card = this.page
      .locator('main div.rounded-xl.border.p-4')
      .filter({ hasText: label })
      .first();
    if ((await card.count()) === 0) return null;
    const valueEl = card.locator('div.text-2xl').first();
    if ((await valueEl.count()) === 0) return null;
    const text = (await valueEl.innerText()) ?? '';
    const m = text.match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  // ── Table ────────────────────────────────────────────────────────────────

  tableRows(): Locator {
    // Data rows only (exclude the empty-state row which spans all columns).
    return this.table.locator('tbody tr').filter({
      has: this.page.locator('td button svg.lucide-eye'),
    });
  }

  async rowCount(): Promise<number> {
    return await this.tableRows().count();
  }

  rowByText(text: string): Locator {
    return this.tableRows().filter({ hasText: text }).first();
  }

  async cellText(row: Locator, colIndex: number): Promise<string> {
    return (await row.locator('td').nth(colIndex).innerText()) ?? '';
  }

  async columnHeaders(): Promise<string[]> {
    return await this.table.locator('thead th').allTextContents();
  }

  async columnIndex(headerText: string): Promise<number> {
    const headers = await this.columnHeaders();
    return headers.findIndex((h) => h.includes(headerText));
  }

  viewButtonInRow(row: Locator): Locator {
    return row.locator('td button:has(svg.lucide-eye)').first();
  }

  async openDetailForRowByText(text: string) {
    const row = this.rowByText(text);
    await row.waitFor({ state: 'visible', timeout: 15000 });
    await this.viewButtonInRow(row).click();
    await this.detailSheet().waitFor({ state: 'visible', timeout: 10000 });
  }

  // ── Empty state ──────────────────────────────────────────────────────────

  emptyState(): Locator {
    return this.table.locator('tbody tr td').filter({ hasText: L.emptyText });
  }

  async hasEmptyState(): Promise<boolean> {
    return (await this.emptyState().count()) > 0;
  }

  // ── Detail drawer (shadcn Sheet) ─────────────────────────────────────────

  detailSheet(): Locator {
    // base-ui Sheet renders [data-slot="sheet-content"] (see components/ui/sheet.tsx).
    return this.page.locator('[data-slot="sheet-content"]').last();
  }

  detailSection(title: string): Locator {
    return this.detailSheet().locator('section').filter({ has: this.page.locator('h3', { hasText: title }) });
  }

  async closeDetail() {
    // The Sheet close button is the ghost icon button in the top-right.
    const closeBtn = this.detailSheet().locator('button:has(svg.lucide-x)').first();
    if ((await closeBtn.count()) > 0) {
      await closeBtn.click();
      await this.detailSheet().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
  }

  // ── Pagination ───────────────────────────────────────────────────────────

  pageSizeSelect(): Locator {
    // The page-size select is the small (h-8) trigger in the table footer area.
    return this.page.locator('main [data-slot="select-trigger"].h-8').first();
  }

  async changePageSize(value: string) {
    const responsePromise = this.waitForListResponse().catch(() => {});
    await this.pageSizeSelect().click();
    const opt = this.page.locator('[data-slot="select-item"]').filter({ hasText: value }).first();
    await opt.waitFor({ state: 'visible', timeout: 10000 });
    await opt.click();
    await responsePromise;
    await this.page.waitForTimeout(400);
  }

  /**
   * The ServerPagination "第 N / M 页" text and the four nav buttons
   * (first / prev / next / last). Returns null if pagination is not rendered
   * (totalPages <= 1).
   */
  paginationContainer(): Locator {
    return this.page.locator('main .flex.items-center.justify-between.rounded-\\[20px\\]').first();
  }

  async paginationText(): Promise<string | null> {
    const el = this.paginationContainer().locator('div.text-sm.text-muted-foreground').last();
    if ((await el.count()) === 0) return null;
    return (await el.innerText()) ?? null;
  }

  firstPageButton(): Locator {
    return this.paginationContainer().locator('button').first();
  }

  lastPageButton(): Locator {
    return this.paginationContainer().locator('button').last();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Resolve when the next admin-audit LIST response (not /stats) lands. Used
   * to avoid flaky races between a filter change and the table re-render.
   * /admin-audit?... (with query) is the list; /admin-audit/stats is stats.
   */
  waitForListResponse(opts: { timeout?: number } = {}) {
    return this.page
      .waitForResponse(
        (resp) =>
          resp.url().includes('/admin-audit') &&
          !resp.url().includes('/admin-audit/stats') &&
          resp.status() === 200,
        { timeout: opts.timeout ?? 15000 },
      )
      .catch(() => null);
  }

  /** Assert the table has settled (no spinner, at least one row or empty state). */
  async waitForTableSettled() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(300);
  }
}
