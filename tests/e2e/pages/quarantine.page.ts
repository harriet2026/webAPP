import { Page, Locator } from '@playwright/test';

export class QuarantinePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly searchButton: Locator;
  readonly resetButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.table = page.locator('.rounded-md.border table, table').first();
    this.searchButton = page.locator('main button').filter({ hasText: /^搜索$/ });
    this.resetButton = page.locator('main button').filter({ hasText: /^重置$/ });
  }

  async goto() {
    await this.page.goto('/zh/quarantine');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1500);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
  }

  getSenderInput() {
    return this.page.locator('input[placeholder="发件人"]');
  }

  getSubjectInput() {
    return this.page.locator('input[placeholder="主题"]');
  }

  async fillSender(value: string) {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/quarantine') && resp.status() === 200,
      { timeout: 10000 }
    ).catch(() => null);
    await this.getSenderInput().fill(value);
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  async fillSubject(value: string) {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/quarantine') && resp.status() === 200,
      { timeout: 10000 }
    ).catch(() => null);
    await this.getSubjectInput().fill(value);
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  async selectRuleType(label: string) {
    const triggers = this.page.locator('main [data-slot="select-trigger"]');
    await triggers.first().click();
    await this.page.waitForTimeout(300);
    const option = this.page.locator('[data-slot="select-item"]').filter({ hasText: label });
    await option.waitFor({ state: 'visible', timeout: 10000 });
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/quarantine') && resp.status() === 200,
      { timeout: 10000 }
    ).catch(() => null);
    await option.click();
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  async selectReleased(label: string) {
    const trigger = this.page.locator('main button[data-slot="select-trigger"]');
    await trigger.waitFor({ state: 'visible', timeout: 5000 });
    await trigger.click();
    await this.page.waitForTimeout(300);
    const option = this.page.locator('[data-slot="select-item"]').filter({ hasText: label });
    await option.waitFor({ state: 'visible', timeout: 10000 });
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/quarantine') && resp.status() === 200,
      { timeout: 10000 }
    ).catch(() => null);
    await option.click();
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  async clickSearch() {
    await this.searchButton.click();
    await this.page.waitForTimeout(1000);
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

  async hasEmptyState() {
    const emptyText = this.table.locator('tbody').filter({ hasText: /暂无数据|No data/i });
    return await emptyText.count() > 0;
  }

  async getTotalCount() {
    const totalEl = this.page.locator('div.text-sm.text-muted-foreground').filter({ hasText: /共\s*\d+/ }).first();
    if (await totalEl.count() === 0) return null;
    const text = await totalEl.innerText();
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  async getPaginationPageInfo() {
    const el = this.page.locator('div.text-sm.text-muted-foreground').filter({ hasText: /^\d+\s*\/\s*\d+$/ });
    if (await el.count() === 0) return null;
    return await el.first().innerText();
  }

  async clickNextPage() {
    const container = this.page.locator('div.text-sm.text-muted-foreground').filter({ hasText: /^\d+\s*\/\s*\d+$/ }).first().locator('..');
    const buttons = container.locator('button');
    await buttons.nth(2).click();
    await this.page.waitForTimeout(1000);
  }

  async clickPrevPage() {
    const container = this.page.locator('div.text-sm.text-muted-foreground').filter({ hasText: /^\d+\s*\/\s*\d+$/ }).first().locator('..');
    const buttons = container.locator('button');
    await buttons.nth(1).click();
    await this.page.waitForTimeout(1000);
  }

  async checkRow(index: number) {
    const checkbox = this.table.locator('tbody tr').nth(index).locator('button[role="checkbox"]');
    await checkbox.click();
    await this.page.waitForTimeout(200);
  }

  getBatchReleaseButton() {
    return this.page.locator('main button').filter({ hasText: /批量释放/ });
  }

  async clickBatchRelease() {
    const btn = this.getBatchReleaseButton();
    await btn.click();
    await this.page.locator('[role="dialog"]').waitFor({ state: 'visible' });
  }

  getPreviewButton(row: number): Locator {
    return this.table.locator('tbody tr').nth(row).locator('button').filter({
      has: this.page.locator('svg.lucide-eye'),
    }).first();
  }

  async clickPreview(row: number) {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/preview') && resp.status() === 200,
      { timeout: 10000 },
    );
    await this.getPreviewButton(row).click();
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  getPreviewDialog(): Locator {
    return this.page.locator('[role="dialog"]').filter({ hasText: '邮件预览' });
  }

  getPreviewDialogContent(): Locator {
    return this.getPreviewDialog().locator('iframe').first();
  }

  getPreviewDownloadButton(): Locator {
    return this.getPreviewDialog().locator('button').filter({ hasText: /下载原始邮件/ });
  }

  getShowImagesButton(): Locator {
    return this.getPreviewDialog().locator('button').filter({ hasText: /显示图片/ });
  }

  getRawHeadersTrigger(): Locator {
    return this.getPreviewDialog().locator('button, [role="button"]').filter({ hasText: /原始邮件头/ });
  }

  getPreviewCloseButton(): Locator {
    return this.getPreviewDialog().locator('button').filter({ has: this.page.locator('svg.lucide-x') }).first();
  }

  async closePreviewDialog() {
    await this.getPreviewCloseButton().click();
    await this.getPreviewDialog().waitFor({ state: 'hidden' });
  }
}
