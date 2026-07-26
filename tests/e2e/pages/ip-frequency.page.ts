import { Page, Locator } from '@playwright/test';

export class IPFrequencyPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.table = page.locator('.rounded-md.border table, table').first();
  }

  async goto() {
    await this.page.goto('/zh/security/ip-frequency');
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
    return this.page.locator('main button').filter({ hasText: /Create Rule|创建规则|新增规则|新建规则/ }).first();
  }

  getExportButton() {
    return this.page.locator('main button').filter({ hasText: /Export|导出/ }).first();
  }

  getSuspendedIPsButton() {
    return this.page.locator('main button').filter({ hasText: /Suspended IPs|已封禁/ }).first();
  }

  async clickCreateRule() {
    await this.getCreateButton().click();
    await this.page.waitForTimeout(500);
  }

  async fillRuleForm(data: {
    name: string;
    scope_type?: string;
    scope_value?: string;
    action?: string;
    daily_connection_limit?: number;
    suspend_minutes?: number;
  }) {
    await this.page.locator('input[id]').first().or(this.page.locator('form input').first()).fill(data.name);

    if (data.scope_type && data.scope_type !== 'all') {
      const scopeTrigger = this.page.locator('form [data-slot="select-trigger"]').first();
      await scopeTrigger.click();
      await this.page.waitForTimeout(300);
      const optionText = data.scope_type === 'single' ? /Single IP|单个/ : /IP Range|IP 段/;
      const option = this.page.locator('[data-slot="select-item"]').filter({ hasText: optionText });
      await option.click();
      await this.page.waitForTimeout(300);

      if (data.scope_value) {
        const scopeInput = this.page.locator('form input[placeholder*="e.g."]');
        await scopeInput.fill(data.scope_value);
      }
    }
  }

  async submitRuleForm() {
    const submitBtn = this.page.locator('form button[type="submit"]').filter({ hasText: /保存|Save/ });
    await submitBtn.click();
    await this.page.waitForTimeout(1000);
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

  async openSuspendedIPs() {
    await this.getSuspendedIPsButton().click();
    await this.page.waitForTimeout(500);
  }

  async getSuspendedIPTableRows(): Promise<Locator[]> {
    const dialog = this.page.locator('[role="dialog"]');
    const rows = dialog.locator('table tbody tr');
    const count = await rows.count();
    const result: Locator[] = [];
    for (let i = 0; i < count; i++) {
      result.push(rows.nth(i));
    }
    return result;
  }

  async releaseAllSuspended() {
    const dialog = this.page.locator('[role="dialog"]');
    const btn = dialog.locator('button').filter({ hasText: /Release All|全部释放/ });
    await btn.click();
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

  async selectRow(index: number) {
    const row = this.table.locator('tbody tr').nth(index);
    // 行内可能同时存在两个隐藏 input[type=checkbox]：行选择 Checkbox 与
    // base-ui Switch（启用开关）各带一个。优先用可见的 role 语义元素定位，
    // 且都取 first() 避免 strict mode 撞多元素。
    const baseUiCb = row.locator('[role="checkbox"]');
    if (await baseUiCb.count() > 0) {
      await baseUiCb.first().click();
    } else {
      await row.locator('input[type="checkbox"]').first().check();
    }
    await this.page.waitForTimeout(300);
  }

  async getSelectedCountText(): Promise<string | null> {
    const el = this.page.locator('main').locator('text=/\\d+ selected|已选/');
    if (await el.count() > 0) {
      return await el.first().innerText();
    }
    return null;
  }

  async bulkDelete() {
    const btn = this.page.locator('main button').filter({ hasText: /Delete/ }).last();
    await btn.click();
    await this.page.waitForTimeout(500);
  }

  async getRuleNames(): Promise<string[]> {
    const rows = this.table.locator('tbody tr');
    const count = await rows.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameCell = rows.nth(i).locator('td').nth(1);
      if (await nameCell.count() > 0) {
        names.push((await nameCell.innerText()).trim());
      }
    }
    return names;
  }
}
