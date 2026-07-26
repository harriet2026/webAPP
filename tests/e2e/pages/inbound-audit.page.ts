import { Page, Locator } from '@playwright/test';

export class InboundAuditPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.table = page.locator('.rounded-md.border table, table').first();
  }

  async goto() {
    await this.page.goto('/zh/audit/inbound');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1500);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
  }

  async switchToTab(tab: 'pending' | 'approved' | 'rejected' | 'all') {
    const tabMap: Record<string, RegExp> = {
      pending: /Pending|待审核/,
      approved: /Approved|已放行|已通过/,
      rejected: /Rejected|已拒绝/,
      all: /All|全部/,
    };
    const tabBtn = this.page.locator('button[role="tab"]').filter({ hasText: tabMap[tab] });
    await tabBtn.click();
    await this.page.waitForTimeout(500);
  }

  async getActiveTab(): Promise<string> {
    const allTabs = this.page.locator('button[role="tab"]');
    const count = await allTabs.count();
    for (let i = 0; i < count; i++) {
      const tab = allTabs.nth(i);
      const isSelected = await tab.getAttribute('data-selected');
      const ariaSelected = await tab.getAttribute('aria-selected');
      if (isSelected !== null || ariaSelected === 'true') {
        return await tab.innerText();
      }
    }
    return await allTabs.first().innerText();
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

  async hasEmptyState(): Promise<boolean> {
    const body = this.table.locator('tbody');
    const text = await body.innerText().catch(() => '');
    return text.includes('暂无数据') || text.includes('No data') || text.trim() === '';
  }

  async selectRow(index: number) {
    const row = this.table.locator('tbody tr').nth(index);
    const cell = row.locator('td').first();
    await cell.click();
    await this.page.waitForTimeout(300);
  }

  getBatchApproveButton() {
    return this.page.locator('main button').filter({ hasText: /Batch Approve|批量通过/ }).first();
  }

  getBatchRejectButton() {
    return this.page.locator('main button').filter({ hasText: /Batch Reject|批量拒绝/ }).first();
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
}
