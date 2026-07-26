import { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly statCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.statCards = page.locator('[class*="grid"] > div');
  }

  async goto() {
    await this.page.goto('/zh/dashboard');
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await this.statCards.first().waitFor({ state: 'visible' });
  }

  async getStatCardCount() {
    return this.statCards.count();
  }
}
