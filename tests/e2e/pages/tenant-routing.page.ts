import { Page, Locator } from '@playwright/test';

/**
 * Page object for the tenant-routing UI (Task 8 / Spec 2B): the "域名管理"
 * tab on `/zh/tenants`, its routing-overview table, and the per-tenant
 * drilldown (RoutingDetail) with its 4 sub-tabs (receiving/relay/outbound/auth).
 *
 * Labels come from `messages/zh.json` (`tenants.routing.*`); base-ui Tabs keep
 * inactive panels unmounted (keepMounted=false), so once the routing tab is
 * open every locator below is unique on the page.
 */
export class TenantRoutingPage {
  readonly page: Page;
  readonly routingTabTrigger: Locator;
  readonly overviewTable: Locator;

  constructor(page: Page) {
    this.page = page;
    // The routing tab trigger carries the Settings icon + "域名管理" label.
    this.routingTabTrigger = page.getByRole('tab', { name: '域名管理' });
    this.overviewTable = page.locator('table').first();
  }

  async goto() {
    await this.page.goto('/zh/tenants');
  }

  /** Switch to the routing tab; the overview table becomes the active panel. */
  async openRoutingTab() {
    await this.routingTabTrigger.click();
    await this.overviewTable.waitFor({ state: 'visible' });
  }

  /**
   * Filter the overview by tenant name. The search input's placeholder is
   * `tenants.tenantName` ("租户名称"); Enter submits to the routing-overview
   * query so the target tenant is guaranteed on the current page regardless
   * of how the backend orders rows.
   */
  async searchTenant(name: string) {
    const search = this.page.getByPlaceholder('租户名称');
    await search.fill(name);
    await search.press('Enter');
    await this.page.waitForLoadState('networkidle');
  }

  overviewRow(name: string): Locator {
    return this.overviewTable.locator('tbody tr').filter({ hasText: name }).first();
  }

  /** Click the row's "配置路由" action → enters RoutingDetail for that tenant. */
  async openDrilldown(name: string) {
    const row = this.overviewRow(name);
    await row.getByRole('button', { name: '配置路由' }).click();
  }

  /** Select a drilldown sub-tab by its visible label (收信域/转发/出站/发信认证). */
  async openSubtab(label: string) {
    await this.page.getByRole('tab', { name: label }).click();
  }

  /** Return to the overview from RoutingDetail via the "返回" button. */
  async backToOverview() {
    await this.page.getByRole('button', { name: '返回' }).click();
    await this.overviewTable.waitFor({ state: 'visible' });
  }
}
