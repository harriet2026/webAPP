import { Page, Locator } from '@playwright/test';

export class ProxysvrPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.dialog = page.locator('[role="dialog"]');
  }

  async goto() {
    await this.page.goto('/zh/system/proxysvr');
    await this.heading.waitFor({ state: 'visible' });
  }

  async openEndpointsTab() {
    await this.page.getByTestId('proxysvr-tab-endpoints').click();
  }

  async openGroupsTab() {
    await this.page.getByTestId('proxysvr-tab-groups').click();
  }

  async createEndpoint(data: {
    name: string;
    host: string;
    port: number;
    lid: string;
    license?: string;
  }) {
    await this.page.getByTestId('proxysvr-endpoint-create').click();
    await this.dialog.waitFor({ state: 'visible' });
    await this.dialog.locator('input[name="name"]').fill(data.name);
    await this.dialog.locator('input[name="host"]').fill(data.host);
    await this.dialog.locator('input[name="port"]').fill(String(data.port));
    await this.dialog.locator('input[name="lid"]').fill(data.lid);
    if (data.license) {
      await this.dialog.locator('input[name="license"]').fill(data.license);
    }
    await this.dialog.locator('button[type="submit"]').click();
    await this.dialog.waitFor({ state: 'hidden', timeout: 10000 });
  }

  async createGroup(data: { name: string; memberEndpointName: string }) {
    await this.openGroupsTab();
    await this.page.getByTestId('proxysvr-group-create').click();
    await this.dialog.waitFor({ state: 'visible' });
    await this.dialog.locator('input[name="group_name"]').fill(data.name);
    // add a member via the endpoint select
    await this.page.getByTestId('proxysvr-member-select').click();
    await this.page.waitForTimeout(300);
    await this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: data.memberEndpointName })
      .first()
      .click();
    // member appears in the ordered list
    await this.dialog
      .getByTestId('proxysvr-member-list')
      .locator('li')
      .first()
      .waitFor({ state: 'visible' });
    await this.dialog.locator('button[type="submit"]').click();
    await this.dialog.waitFor({ state: 'hidden', timeout: 10000 });
  }
}
