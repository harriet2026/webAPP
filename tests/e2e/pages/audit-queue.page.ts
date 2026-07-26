import { Page, Locator } from '@playwright/test';

export class AuditQueuePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly pendingTab: Locator;
  readonly approvedTab: Locator;
  readonly rejectedTab: Locator;
  readonly selectAllCheckbox: Locator;
  readonly batchApproveButton: Locator;
  readonly batchRejectButton: Locator;
  readonly dialog: Locator;
  readonly dialogTitle: Locator;
  readonly dialogTextarea: Locator;
  readonly dialogConfirmButton: Locator;
  readonly dialogCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.table = page.locator('main table').first();
    this.pendingTab = page.locator('[data-slot="tabs-trigger"]').filter({ hasText: '待审核' });
    this.approvedTab = page.locator('[data-slot="tabs-trigger"]').filter({ hasText: '已批准' });
    this.rejectedTab = page.locator('[data-slot="tabs-trigger"]').filter({ hasText: '已拒绝' });
    this.selectAllCheckbox = page.locator('main table thead').getByRole('checkbox').first();
    this.batchApproveButton = page.locator('main button').filter({ hasText: /批量批准/ });
    this.batchRejectButton = page.locator('main button').filter({ hasText: /批量拒绝/ });
    this.dialog = page.locator('[role="dialog"]');
    this.dialogTitle = this.dialog.locator('[class*="dialog-title"], h2');
    this.dialogTextarea = this.dialog.locator('textarea');
    this.dialogConfirmButton = this.dialog.locator('button').filter({ hasText: '确认' });
    this.dialogCancelButton = this.dialog.locator('button').filter({ hasText: '取消' });
  }

  async goto() {
    await this.page.goto('/zh/audit-queue');
    await this.page.waitForLoadState('networkidle');
    await this.waitForDataLoaded();
  }

  private async waitForDataLoaded() {
    try {
      await this.page.locator('main table tbody tr').first().waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      // table might be empty
    }
    await this.page.waitForTimeout(500);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
  }

  async switchToPending() {
    await this.pendingTab.click();
    await this.waitForTableLoad();
  }

  async switchToApproved() {
    await this.approvedTab.click();
    await this.waitForTableLoad();
    await this.page.waitForTimeout(1000);
  }

  async switchToRejected() {
    await this.rejectedTab.click();
    await this.waitForTableLoad();
    await this.page.waitForTimeout(1000);
  }

  private async waitForTableLoad() {
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

  getRowCheckbox(index: number): Locator {
    return this.page.locator('main table tbody tr').nth(index).locator('td').first().getByRole('checkbox');
  }

  async selectRow(index: number) {
    const checkbox = this.getRowCheckbox(index);
    await checkbox.waitFor({ state: 'visible', timeout: 10000 });
    await checkbox.click({ force: true });
    await this.page.waitForTimeout(300);
  }

  async selectAll() {
    await this.selectAllCheckbox.waitFor({ state: 'visible', timeout: 10000 });
    await this.selectAllCheckbox.click({ force: true });
    await this.page.waitForTimeout(300);
  }

  async getActiveTabValue(): Promise<string> {
    const activeTab = this.page.locator('[data-slot="tabs-trigger"][data-active]');
    if (await activeTab.count() > 0) {
      return await activeTab.innerText();
    }
    return '';
  }

  async hasEmptyState(): Promise<boolean> {
    const emptyText = this.table.locator('tbody').filter({ hasText: /暂无数据|No data/i });
    return await emptyText.count() > 0;
  }

  async getBatchApproveCount(): Promise<number | null> {
    if (await this.batchApproveButton.count() === 0) return null;
    const text = await this.batchApproveButton.innerText();
    const match = text.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : null;
  }

  async getBatchRejectCount(): Promise<number | null> {
    if (await this.batchRejectButton.count() === 0) return null;
    const text = await this.batchRejectButton.innerText();
    const match = text.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : null;
  }

  getRowApproveButton(index: number): Locator {
    return this.table.locator('tbody tr').nth(index).locator('button').filter({ has: this.page.locator('svg.lucide-check') }).first();
  }

  getRowRejectButton(index: number): Locator {
    return this.table.locator('tbody tr').nth(index).locator('button').filter({ has: this.page.locator('svg.lucide-x') }).first();
  }

  async openApproveDialog(rowIndex: number) {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/outbound-audit') && resp.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null);
    await this.getRowApproveButton(rowIndex).click();
    await this.dialog.waitFor({ state: 'visible' });
    return responsePromise;
  }

  async openRejectDialog(rowIndex: number) {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/outbound-audit') && resp.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null);
    await this.getRowRejectButton(rowIndex).click();
    await this.dialog.waitFor({ state: 'visible' });
    return responsePromise;
  }

  async fillNotes(text: string) {
    await this.dialogTextarea.fill(text);
  }

  async confirmDialog() {
    await this.dialogConfirmButton.click();
  }

  async cancelDialog() {
    await this.dialogCancelButton.click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  async openBatchApproveDialog() {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/outbound-audit') && resp.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null);
    await this.batchApproveButton.click();
    await this.dialog.waitFor({ state: 'visible' });
    return responsePromise;
  }

  async openBatchRejectDialog() {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/outbound-audit') && resp.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null);
    await this.batchRejectButton.click();
    await this.dialog.waitFor({ state: 'visible' });
    return responsePromise;
  }

  getTableHeaders(): Locator {
    return this.table.locator('thead th');
  }

  getCellText(row: number, col: number): Promise<string> {
    return this.table.locator('tbody tr').nth(row).locator('td').nth(col).innerText();
  }

  getStatusBadge(row: number): Locator {
    return this.table.locator('tbody tr').nth(row).locator('td').nth(6).locator('span');
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

  getPreviewDownloadButton(): Locator {
    return this.getPreviewDialog().locator('button').filter({ hasText: /下载原始邮件/ });
  }

  async closePreviewDialog() {
    const closeBtn = this.getPreviewDialog().locator('button').filter({
      has: this.page.locator('svg.lucide-x'),
    }).first();
    await closeBtn.click();
    await this.getPreviewDialog().waitFor({ state: 'hidden' });
  }
}
