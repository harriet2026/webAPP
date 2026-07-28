import { Page, Locator, expect } from '@playwright/test';

export class AuthAttemptsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly searchButton: Locator;
  readonly resetButton: Locator;
  readonly filterSection: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.table = page.locator('main table').first();
    this.searchButton = page.getByTestId('auth-filter-search');
    this.resetButton = page.getByTestId('auth-filter-reset');
    this.filterSection = page.locator('main section').filter({
      has: page.getByTestId('auth-filter-keyword'),
    });
  }

  async goto() {
    await this.page.goto('/zh/logs/auth-attempts');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1500);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await expect(this.heading).toContainText('认证日志');
    // 列表加载中只渲染 spinner（无 <table>）；共享 dev 库有百万级残留行时
    // 首查可达数秒，这里等到表格真正出现再让用例读表头/行。
    await this.table.waitFor({ state: 'visible', timeout: 45000 });
  }

  // 「账号 / 来源 IP」已合并为单个 keyword 输入框（对齐 demo，2026-07-19）：
  // username / clientIp 两个历史入口都指向同一个输入框。
  getKeywordInput(): Locator {
    return this.page.getByTestId('auth-filter-keyword');
  }

  getUsernameInput(): Locator {
    return this.getKeywordInput();
  }

  getClientIpInput(): Locator {
    return this.getKeywordInput();
  }

  getDomainInput(): Locator {
    return this.page.getByTestId('auth-filter-domain');
  }

  async fillUsername(value: string) {
    await this.getUsernameInput().fill(value);
    await this.page.waitForTimeout(200);
  }

  async fillClientIp(value: string) {
    await this.getClientIpInput().fill(value);
    await this.page.waitForTimeout(200);
  }

  async fillDomain(value: string) {
    await this.getDomainInput().fill(value);
    await this.page.waitForTimeout(200);
  }

  getResultTrigger(): Locator {
    return this.page.getByTestId('auth-filter-result');
  }

  getProtocolTrigger(): Locator {
    return this.page.getByTestId('auth-filter-protocol');
  }

  getSceneTrigger(): Locator {
    return this.page.getByTestId('auth-filter-scene');
  }

  getFailReasonTrigger(): Locator {
    return this.page.getByTestId('auth-filter-fail-reason');
  }

  private async openSelectAndPick(trigger: Locator, optionText: string) {
    await trigger.click();
    await this.page.waitForTimeout(300);
    const option = this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: optionText })
      .first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    await this.page.waitForTimeout(100);
  }

  async selectResult(label: string) {
    await this.openSelectAndPick(this.getResultTrigger(), label);
  }

  async selectProtocol(label: string) {
    await this.openSelectAndPick(this.getProtocolTrigger(), label);
  }

  async selectScene(label: string) {
    await this.openSelectAndPick(this.getSceneTrigger(), label);
  }

  async selectFailReason(label: string) {
    await this.openSelectAndPick(this.getFailReasonTrigger(), label);
  }

  async selectByLabel(fieldLabel: string, optionText: string) {
    const map: Record<string, Locator> = {
      结果: this.getResultTrigger(),
      协议: this.getProtocolTrigger(),
      场景: this.getSceneTrigger(),
      失败原因: this.getFailReasonTrigger(),
    };
    const trigger = map[fieldLabel];
    if (!trigger) throw new Error(`Unknown filter field label: ${fieldLabel}`);
    await this.openSelectAndPick(trigger, optionText);
  }

  async clickSearch() {
    const responsePromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/auth-attempts') && resp.status() === 200,
        { timeout: 10000 }
      )
      .catch(() => null);
    await this.searchButton.click();
    await responsePromise;
    await this.page.waitForTimeout(800);
  }

  async pressEnterToSearch() {
    const responsePromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/auth-attempts') && resp.status() === 200,
        { timeout: 10000 },
      )
      .catch(() => null);
    await this.getKeywordInput().press('Enter');
    await responsePromise;
    await this.page.waitForTimeout(800);
  }

  async clickReset() {
    const responsePromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/auth-attempts') && resp.status() === 200,
        { timeout: 10000 }
      )
      .catch(() => null);
    await this.resetButton.click();
    await responsePromise;
    await this.page.waitForTimeout(800);
  }

  async getRowCount() {
    return await this.table.locator('tbody tr').count();
  }

  async getDataRowCount() {
    const rows = this.table.locator('tbody tr');
    const count = await rows.count();
    let dataCount = 0;
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText();
      if (
        !text.includes('暂无符合条件的认证记录') &&
        !text.includes('暂无认证日志') &&
        !text.includes('暂无数据') &&
        !text.includes('No data')
      ) {
        dataCount++;
      }
    }
    return dataCount;
  }

  async getTableRows() {
    return this.table.locator('tbody tr');
  }

  async getDataRows(): Promise<Locator[]> {
    const rows = this.table.locator('tbody tr');
    const count = await rows.count();
    const out: Locator[] = [];
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText();
      if (
        !text.includes('暂无符合条件的认证记录') &&
        !text.includes('暂无认证日志') &&
        !text.includes('暂无数据') &&
        !text.includes('No data')
      ) {
        out.push(rows.nth(i));
      }
    }
    return out;
  }

  async getCellText(row: number, col: number) {
    const cell = this.table.locator('tbody tr').nth(row).locator('td').nth(col);
    return (await cell.innerText()).trim();
  }

  // Resolve a column index from its header text. Prefer this over hardcoded
  // column numbers: the auth-attempts table gained columns (租户/协议/场景/
  // 域名/服务器), which shifted 客户端 IP and 结果 to later positions.
  async colIndexByHeader(headerText: string): Promise<number> {
    const headers = (await this.table.locator('th').allTextContents()).map((h) => h.trim());
    const idx = headers.findIndex((h) => h === headerText);
    if (idx < 0) {
      throw new Error(`column header not found: ${headerText} (have: ${headers.join(', ')})`);
    }
    return idx;
  }

  async getCellTextByHeader(row: number, headerText: string) {
    return this.getCellText(row, await this.colIndexByHeader(headerText));
  }

  async hasEmptyState() {
    const empty = this.table
      .locator('tbody')
      .filter({ hasText: /暂无符合条件的认证记录|暂无认证日志|暂无数据|No data/i });
    return (await empty.count()) > 0;
  }

  getActionsButton(row: number): Locator {
    const lastCell = this.table.locator('tbody tr').nth(row).locator('td').last();
    return lastCell.locator('button').first();
  }

  async openDetailForRow(row: number) {
    const btn = this.getActionsButton(row);
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.click();
    await this.page.waitForTimeout(400);
  }

  getDetailDrawer(): Locator {
    return this.page
      .locator('[role="dialog"]')
      .filter({ hasText: /认证概要|协议与服务器|命中配置/ })
      .last();
  }

  getStatsCard(label: string): Locator {
    return this.page
      .locator('[data-testid^="auth-stats-"]')
      .filter({ hasText: label })
      .first();
  }

  async isFailReasonSelectDisabled(): Promise<boolean> {
    const trigger = this.getFailReasonTrigger();
    if ((await trigger.count()) === 0) return true;
    const disabled = await trigger.getAttribute('disabled');
    if (disabled !== null) return true;
    const dataDisabled = await trigger.getAttribute('data-disabled');
    if (dataDisabled !== null) return true;
    const ariaDisabled = await trigger.getAttribute('aria-disabled');
    if (ariaDisabled === 'true') return true;
    return false;
  }

  async getTotalCount() {
    const totalEl = this.page
      .locator('div.text-sm.text-muted-foreground')
      .filter({ hasText: /共\s*\d+/ })
      .first();
    if ((await totalEl.count()) === 0) return null;
    const text = await totalEl.innerText();
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  async getPaginationPageInfo() {
    const el = this.page
      .locator('div.text-sm.text-muted-foreground')
      .filter({ hasText: /^\d+\s*\/\s*\d+$/ });
    if ((await el.count()) === 0) return null;
    return await el.first().innerText();
  }

  async clickNextPage() {
    const container = this.page
      .locator('div.text-sm.text-muted-foreground')
      .filter({ hasText: /^\d+\s*\/\s*\d+$/ })
      .first()
      .locator('..');
    const buttons = container.locator('button');
    await buttons.nth(2).click();
    await this.page.waitForTimeout(1000);
  }

  async clickPrevPage() {
    const container = this.page
      .locator('div.text-sm.text-muted-foreground')
      .filter({ hasText: /^\d+\s*\/\s*\d+$/ })
      .first()
      .locator('..');
    const buttons = container.locator('button');
    await buttons.nth(1).click();
    await this.page.waitForTimeout(1000);
  }

  // Top-of-list total ("共 N 条记录"), always rendered (spec §10.3) — distinct
  // from the pagination footer which hides on a single page.
  getTopTotal(): Locator {
    return this.page.locator('[data-testid="auth-attempts-total"]');
  }

  getPageSizeTrigger(): Locator {
    return this.page.locator('[data-testid="auth-attempts-page-size"]');
  }

  async selectPageSize(size: number) {
    const responsePromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/auth-attempts') && resp.url().includes(`page_size=${size}`) && resp.status() === 200,
        { timeout: 10000 }
      )
      .catch(() => null);
    await this.getPageSizeTrigger().click();
    await this.page.waitForTimeout(300);
    const option = this.page.locator('[data-slot="select-item"]').filter({ hasText: new RegExp('^' + size + '$') }).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  getDrawerFailDiagnosis(): Locator {
    return this.getDetailDrawer().filter({ hasText: /失败诊断/ });
  }
}
