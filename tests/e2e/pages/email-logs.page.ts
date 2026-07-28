import { Page, Locator } from '@playwright/test';

export class EmailLogsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly searchButton: Locator;
  readonly resetButton: Locator;
  readonly exportButton: Locator;
  readonly advancedFilterToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.table = page.locator('.rounded-md.border table, table').first();
    this.searchButton = page.getByTestId('email-logs-filter-search');
    this.resetButton = page.getByTestId('email-logs-filter-reset');
    this.exportButton = page.locator('main button').filter({ hasText: /导出/ });
    this.advancedFilterToggle = page.getByTestId('email-logs-advanced-toggle');
  }

  async goto() {
    await this.page.goto('/zh/logs/email');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1500);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
  }

  getSenderInput() {
    return this.page.locator('input[name="sender"]');
  }

  getRecipientInput() {
    return this.page.locator('input[name="recipient"]');
  }

  getSubjectInput() {
    return this.page.locator('input[name="subject"]');
  }

  async fillSender(value: string) {
    await this.getSenderInput().fill(value);
  }

  async fillRecipient(value: string) {
    await this.getRecipientInput().fill(value);
  }

  async fillSubject(value: string) {
    await this.getSubjectInput().fill(value);
  }

  async selectStartDate(dayAttr: string) {
    const trigger = this.page.locator('button:has(svg.lucide-calendar)').first();
    await trigger.click();
    const dayButton = this.page.locator(`[role="dialog"] button[data-day="${dayAttr}"]`).first();
    await dayButton.waitFor({ state: 'visible', timeout: 5000 });
    await dayButton.click();
    await this.page.waitForTimeout(300);
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(200);
  }

  async selectEndDate(dayAttr: string) {
    const trigger = this.page.locator('button:has(svg.lucide-calendar)').nth(1);
    await trigger.click();
    const dayButton = this.page.locator(`[role="dialog"] button[data-day="${dayAttr}"]`).first();
    await dayButton.waitFor({ state: 'visible', timeout: 5000 });
    await dayButton.click();
    await this.page.waitForTimeout(300);
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(200);
  }

  async selectAction(label: string) {
    const triggers = this.page.locator('main [data-slot="select-trigger"]');
    await triggers.nth(0).click();
    await this.page.waitForTimeout(300);
    const option = this.page.locator('[data-slot="select-item"]').filter({ hasText: label });
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    await this.page.waitForTimeout(300);
  }

  async clickSearch() {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/mail-logs') && resp.status() === 200,
      { timeout: 10000 }
    );
    await this.searchButton.click();
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  async clickReset() {
    await this.resetButton.click();
    await this.page.waitForTimeout(500);
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
      if (!text.includes('暂无数据') && !text.includes('No data')) {
        dataCount++;
      }
    }
    return dataCount;
  }

  async getTableRows() {
    return this.table.locator('tbody tr');
  }

  async getCellText(row: number, col: number) {
    const cell = this.table.locator('tbody tr').nth(row).locator('td').nth(col);
    return await cell.innerText();
  }

  async getTotalCount() {
    const totalEl = this.page.locator('div.text-sm.text-muted-foreground').filter({ hasText: /共\s*\d+/ }).first();
    if (await totalEl.count() === 0) return null;
    const text = await totalEl.innerText();
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  async clickSenderInRow(index: number) {
    const senderCell = this.table.locator('tbody tr').nth(index).locator('td span.underline, td span.cursor-pointer');
    await senderCell.click();
  }

  async openDetailAndWait(index: number = 0) {
    const dialogReady = this.page.waitForResponse(
      (resp) => !!(resp.url().match(/\/mail-logs\/\d+/) && resp.status() === 200),
      { timeout: 10000 }
    );
    await this.clickSenderInRow(index);
    await dialogReady;
    await this.page.locator('[role="dialog"]').waitFor({ state: 'visible' });
  }

  async closeDetail() {
    const dialog = this.page.locator('[role="dialog"]');
    await dialog.locator('button:has(svg.lucide-x)').click();
    await dialog.waitFor({ state: 'hidden' });
  }

  async getPaginationButtonContainer() {
    const pageInfoEl = this.page.getByText(/^\d+\s*\/\s*\d+$/, { exact: true }).first();
    return pageInfoEl.locator('..');
  }

  async clickNextPage() {
    const container = await this.getPaginationButtonContainer();
    const nextBtn = container.locator('button').nth(2);
    await nextBtn.click();
    await this.page.waitForTimeout(1000);
  }

  async clickPrevPage() {
    const container = await this.getPaginationButtonContainer();
    const prevBtn = container.locator('button').nth(1);
    await prevBtn.click();
    await this.page.waitForTimeout(1000);
  }

  async getPaginationPageInfo() {
    const el = this.page.locator('div.text-sm.text-muted-foreground').filter({ hasText: /^\d+\s*\/\s*\d+$/ });
    if (await el.count() === 0) return null;
    return await el.innerText();
  }

  async hasEmptyState() {
    const emptyText = this.table.locator('tbody').filter({ hasText: /暂无数据|No data/i });
    return await emptyText.count() > 0;
  }

  async openAdvancedFilter() {
    await this.advancedFilterToggle.click();
    await this.page.waitForTimeout(500);
  }

  getAdvancedFilterPanel() {
    return this.page.getByTestId('email-logs-search-panel').locator('div.border.rounded-md');
  }

  async addAdvancedConditionGroup() {
    const addGroupBtn = this.page.getByTestId('email-logs-search-panel').locator('button').filter({ hasText: /添加搜索条件组/ });
    await addGroupBtn.click();
    await this.page.waitForTimeout(300);
  }

  async addAdvancedCondition() {
    const addCondBtn = this.page.getByTestId('email-logs-search-panel').locator('button').filter({ hasText: /添加搜索条件/ });
    await addCondBtn.click();
    await this.page.waitForTimeout(300);
  }

  async selectAdvancedField(rowIndex: number, fieldKey: string) {
    if (rowIndex === 0 && fieldKey === 'Client IP') {
      return;
    }

    const fieldSelect = this.page.getByTestId('email-logs-search-panel').locator('.border.rounded-md [data-slot="select-trigger"]').nth(rowIndex * 2 + 1);
    const currentValue = (await fieldSelect.textContent())?.trim() ?? '';
    if (fieldKey === 'Client IP' && /Client IP|客户端 IP|client_ip/i.test(currentValue)) {
      return;
    }

    await fieldSelect.click();
    await this.page.waitForTimeout(300);
    const normalizedFieldKey = fieldKey === 'Client IP' ? 'client_ip' : fieldKey;
    const option = this.page.locator(`[data-slot="select-item"][data-value="${normalizedFieldKey}"]`);
    const fallbackOption = this.page.locator('[data-slot="select-item"]').filter({ hasText: new RegExp(normalizedFieldKey, 'i') });
    const targetOption = (await option.count()) > 0 ? option : fallbackOption;
    await targetOption.waitFor({ state: 'visible', timeout: 5000 });
    await targetOption.click();
    await this.page.waitForTimeout(300);
  }

  async selectAdvancedOperator(rowIndex: number, operator: string) {
    const opSelect = this.page.getByTestId('email-logs-search-panel').locator('.border.rounded-md [data-slot="select-trigger"]').nth(rowIndex * 2 + 2);
    await opSelect.click();
    await this.page.waitForTimeout(300);
    const normalizedOperator = operator === '包含' ? 'contains' : operator;
    const option = this.page.locator(`[data-slot="select-item"][data-value="${normalizedOperator}"]`);
    const fallbackOption = this.page.locator('[data-slot="select-item"]').filter({ hasText: new RegExp(`^${operator}$`, 'i') });
    const targetOption = (await option.count()) > 0 ? option : fallbackOption;
    await targetOption.waitFor({ state: 'visible', timeout: 5000 });
    await targetOption.click();
    await this.page.waitForTimeout(300);
  }

  async fillAdvancedValue(rowIndex: number, value: string) {
    const input = this.page.getByTestId('email-logs-search-panel').locator('.border.rounded-md input[type="text"], .border.rounded-md input[type="number"]').nth(rowIndex);
    await input.fill(value);
    await this.page.waitForTimeout(200);
  }

  async selectAdvancedEnumValue(rowIndex: number, value: string) {
    const valueSelect = this.page.getByTestId('email-logs-search-panel').locator('.border.rounded-md [data-slot="select-trigger"]').nth(rowIndex * 2 + 2);
    await valueSelect.click();
    await this.page.waitForTimeout(300);
    const option = this.page.locator('[data-slot="select-item"]').filter({ hasText: value });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
    await this.page.waitForTimeout(300);
  }

  getAdvancedFilterBadge() {
    return this.advancedFilterToggle.locator('span');
  }

  async clearAdvancedFilters() {
    const clearBtn = this.page.getByTestId('email-logs-search-panel').locator('button').filter({ hasText: /清除全部/ });
    if (await clearBtn.count() > 0) {
      await clearBtn.click();
      await this.page.waitForTimeout(300);
    }
  }
}
