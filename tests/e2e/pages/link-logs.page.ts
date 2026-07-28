import { Page, Locator, expect } from '@playwright/test';

export class LinkLogsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.table = page.locator('main table').first();
  }

  async goto() {
    await this.page.goto('/zh/logs/link-clicks');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1200);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await expect(this.heading).toContainText('链接保护');
  }

  getTab(name: string): Locator {
    return this.page.locator('[role="tab"], button').filter({ hasText: name }).first();
  }

  async switchTab(name: string) {
    await this.getTab(name).click();
    await this.page.waitForTimeout(600);
  }

  getTenantScopeSelect(): Locator {
    return this.page.locator('[data-testid="link-logs-tenant-scope"]');
  }

  getTopTotal(): Locator {
    return this.page.locator('[data-testid="link-logs-total"]');
  }

  getSearchButton(): Locator {
    return this.page.getByTestId('link-logs-search');
  }

  async clickSearch() {
    const responsePromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/link-click-logs') && resp.status() === 200,
        { timeout: 10000 },
      )
      .catch(() => null);
    await this.getSearchButton().click();
    await responsePromise;
    await this.page.waitForTimeout(400);
  }

  async getDataRows(): Promise<Locator[]> {
    const rows = this.table.locator('tbody tr');
    const count = await rows.count();
    const out: Locator[] = [];
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText();
      if (!text.includes('暂无数据') && !text.includes('No data')) out.push(rows.nth(i));
    }
    return out;
  }

  async openDetailForRow(row: number) {
    const lastCell = this.table.locator('tbody tr').nth(row).locator('td').last();
    await lastCell.locator('button').first().click();
    await this.page.waitForTimeout(400);
  }

  getDetailModal(): Locator {
    return this.page
      .locator('[role="dialog"]')
      .filter({ hasText: /最终处置|顺序检测|点击详情/ })
      .last();
  }
}
