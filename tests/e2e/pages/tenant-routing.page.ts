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
  readonly drawer: Locator;
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    // The routing tab trigger carries the Settings icon + "域名管理" label.
    this.routingTabTrigger = page.getByRole('tab', { name: '域名管理' });
    this.overviewTable = page.locator('table').first();
    // Nexthop create/edit uses a Sheet → data-slot="sheet-content". Scoped to
    // the Sheet (not a generic [role="dialog"]) so the Next.js dev error-overlay
    // dialog can't collide with it under strict mode.
    this.drawer = page.locator('[data-slot="sheet-content"]');
    this.confirmDialog = page.locator('[role="alertdialog"]');
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

  // ─── Receiving sub-tab: nexthop drawer CRUD ───────────────────────────

  /** The per-domain card in the receiving sub-tab (one <section> per domain). */
  domainCard(domain: string): Locator {
    return this.page.locator('section', { hasText: domain }).first();
  }

  /** Open the "添加下一跳" drawer for a given verified domain. */
  async openAddNexthop(domain: string) {
    await this.domainCard(domain).getByRole('button', { name: '添加下一跳' }).click();
    await this.drawer.waitFor({ state: 'visible' });
  }

  /**
   * Fill the nexthop drawer. The host field is the only one with a stable
   * placeholder ("mx.example.com"); port is the 1st number input, priority
   * the 2nd. The type selector defaults to "domain" and is left unchanged.
   */
  async fillNexthop(data: { host: string; port: string; priority?: string }) {
    const drawer = this.drawer;
    await drawer.getByPlaceholder('mx.example.com').fill(data.host);
    const numberInputs = drawer.locator('input[type="number"]');
    await numberInputs.nth(0).fill(data.port);
    if (data.priority !== undefined) {
      await numberInputs.nth(1).fill(data.priority);
    }
  }

  async submitNexthopDrawer() {
    await this.drawer.getByRole('button', { name: '保存' }).click();
    await this.drawer.waitFor({ state: 'hidden' });
  }

  /** A nexthop table row identified by its host cell text. */
  nexthopRow(host: string): Locator {
    return this.page.locator('table tbody tr').filter({ hasText: host }).first();
  }

  /** Number of nexthop rows currently rendered for a host (0 after delete). */
  nexthopRowCount(host: string): Promise<number> {
    return this.page.locator('table tbody tr').filter({ hasText: host }).count();
  }

  /** Delete a nexthop row via its trash action + the confirm AlertDialog. */
  async deleteNexthop(host: string) {
    const row = this.nexthopRow(host);
    await row.locator('button:has(svg.lucide-trash-2)').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    // AlertDialog footer: [取消, 确认] → action is the last button.
    await this.confirmDialog.locator('button').last().click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }
}
