import { Page, Locator } from '@playwright/test';

export class IPFilterPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.table = page.locator('.rounded-md.border table, table').first();
  }

  async goto() {
    await this.page.goto('/zh/security/ip-filter');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1500);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
  }

  getSearchInput() {
    return this.page.locator('main input[placeholder]').first();
  }

  getCreateButton() {
    return this.page.locator('main button').filter({ hasText: /Create Rule|新建规则|创建规则|新增规则/ }).first();
  }

  getExportButton() {
    return this.page.locator('main button').filter({ hasText: /Export|导出/ }).first();
  }

  getImportButton() {
    return this.page.locator('main button').filter({ hasText: /Import|导入/ }).first();
  }

  async clickCreateRule() {
    await this.getCreateButton().click();
    await this.page.waitForTimeout(500);
  }

  async searchRules(query: string) {
    const input = this.getSearchInput();
    await input.fill(query);
    await this.page.waitForTimeout(500);
  }

  async getDataRowCount(): Promise<number> {
    const rows = this.table.locator('tbody tr');
    const count = await rows.count();
    let dataCount = 0;
    for (let i = 0; i < count; i++) {
      const tds = rows.nth(i).locator('td');
      const tdCount = await tds.count();
      if (tdCount > 1) {
        dataCount++;
      }
    }
    return dataCount;
  }

  async getCellText(row: number, col: number): Promise<string> {
    const cell = this.table.locator('tbody tr').nth(row).locator('td').nth(col);
    return await cell.innerText();
  }

  // Resolve a column index by its header text — prefer this over hardcoded
  // column numbers so the spec survives columns being added/reordered.
  async colIndexByHeader(headerText: string): Promise<number> {
    const headers = (await this.table.locator('thead th').allTextContents()).map((h) => h.trim());
    const idx = headers.findIndex((h) => h === headerText);
    if (idx < 0) {
      throw new Error(`column header not found: ${headerText} (have: ${headers.join(', ')})`);
    }
    return idx;
  }

  async getCellTextByHeader(row: number, headerText: string): Promise<string> {
    return this.getCellText(row, await this.colIndexByHeader(headerText));
  }

  async getTableColumnHeaders(): Promise<string[]> {
    const headers = this.table.locator('thead th');
    const count = await headers.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      texts.push(await headers.nth(i).innerText());
    }
    return texts;
  }

  async hasEmptyState(): Promise<boolean> {
    const body = this.table.locator('tbody');
    const text = await body.innerText().catch(() => '');
    return text.includes('暂无数据') || text.includes('No data') || text.trim() === '';
  }

  async selectRow(index: number) {
    const checkbox = this.table.locator('tbody tr').nth(index).locator('input[type="checkbox"]').first();
    await checkbox.check();
    await this.page.waitForTimeout(300);
  }

  async getSelectedCountText(): Promise<string | null> {
    const el = this.page.locator('main').locator('text=/\\d+ selected|已选/');
    if (await el.count() > 0) {
      return await el.first().innerText();
    }
    return null;
  }

  getBlacklistTab() {
    return this.page.locator('[data-state="active"]').filter({ hasText: /Blacklist|黑名单/ });
  }

  getWhitelistTab() {
    return this.page.locator('button[role="tab"]').filter({ hasText: /Whitelist|白名单/ });
  }

  async switchToWhitelist() {
    await this.getWhitelistTab().click();
    await this.page.waitForTimeout(500);
  }

  async switchToBlacklist() {
    const tab = this.page.locator('button[role="tab"]').filter({ hasText: /Blacklist|黑名单/ });
    await tab.click();
    await this.page.waitForTimeout(500);
  }

  async closeDialog() {
    const dialog = this.page.locator('[role="dialog"]');
    const closeBtn = dialog.locator('button').filter({ hasText: /取消|Cancel/ }).first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(300);
  }
}
