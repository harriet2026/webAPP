import { Page, Locator } from '@playwright/test';

export class RouteRulesPage {
  readonly page: Page;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.locator('[role="dialog"]');
  }

  async goto() {
    await this.page.goto('/zh/rules/route');
    await this.page.locator('main h1').waitFor({ state: 'visible' });
  }

  async openCreateDialog() {
    // header "create rule" button (has plus icon)
    await this.page.locator('main button:has(svg.lucide-plus)').first().click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  async fillName(name: string) {
    await this.dialog.locator('input[name="name"]').fill(name);
  }

  // The default condition (sender contains <value>) rejects an empty value
  // server-side, so populate it.
  async fillConditionValue(value: string) {
    await this.dialog.locator('input[placeholder="值..."]').first().fill(value);
  }

  async selectChannel(channel: 'smtp' | 'proxysvr') {
    await this.dialog.getByTestId('route-channel-select').click();
    await this.page.waitForTimeout(200);
    const label = channel === 'proxysvr' ? '代理服务器分组' : 'SMTP 下一跳';
    await this.page.locator('[data-slot="select-item"]').filter({ hasText: label }).first().click();
  }

  async selectProxysvrGroup(groupName: string) {
    await this.dialog.getByTestId('route-proxysvr-group-select').click();
    await this.page.waitForTimeout(200);
    await this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: groupName })
      .first()
      .click();
  }

  async submit() {
    await this.dialog.locator('button[type="submit"]').click();
    await this.dialog.waitFor({ state: 'hidden', timeout: 10000 });
  }
}
