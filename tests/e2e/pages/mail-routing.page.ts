import { Page, Locator } from '@playwright/test';

/**
 * Page object for the standalone mail-routing UI (`/zh/mail-routing`,
 * `MailRoutingShell`). Covers the 4 tabs — Receiving (nexthop CRUD + probe),
 * Relay (relay-rule CRUD + skip_antispam), Outbound (route-rule CRUD),
 * Auth (mail_auth_config CRUD + Test Connection).
 *
 * i18n labels come from `messages/zh.json` `mailRouting.*`. base-ui Tabs keep
 * inactive panels unmounted, so once a tab is open every locator below is
 * unique on the page.
 */
export class MailRoutingPage {
  readonly page: Page;
  /** Receiving nexthop editor uses a Sheet (side panel). */
  readonly sheet: Locator;
  /** Generic dialog (relay / outbound / auth create+edit + auth test). */
  readonly dialog: Locator;
  /** Shared AlertDialog confirm (delete actions). */
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sheet = page.locator('[data-slot="sheet-content"]');
    this.dialog = page.locator('[role="dialog"]');
    this.confirmDialog = page.locator('[role="alertdialog"]');
  }

  async goto() {
    await this.page.goto('/zh/mail-routing');
    // The shell renders once /routing/_meta/scope resolves; the receiving tab
    // trigger is the first tab and is present in every product form.
    await this.page.getByRole('tab', { name: TABS.receiving }).waitFor({ state: 'visible' });
  }

  /**
   * Open MailRoutingShell via the multi-tenant drill-down on /zh/tenants:
   * switch to the 域名管理 tab, search the tenant, click its 配置路由 action.
   * The drill-down renders the same MailRoutingShell as the standalone page,
   * so every locator below works unchanged. Opening the drill-down also sets
   * the global selected tenant (RoutingTab.openDrilldown), so useApiRequest
   * inside the shell injects the matching X-Tenant-ID for system_admin.
   */
  async openViaTenantDrilldown(tenantName: string) {
    // Let whatever the app is doing settle before we navigate: goto-ing while
    // it performs its own bootstrap/viewer navigation truncates ours into
    // net::ERR_ABORTED. It surfaces intermittently and, because this helper
    // runs first in every drill-down test, it fails a different test each run.
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(500);
    await this.page.goto('/zh/tenants');
    const routingTab = this.page.getByRole('tab', { name: '域名管理' });
    await routingTab.click();
    // The tenants page keeps sibling tabpanels (e.g. 租户管理) mounted, so
    // scope table + search to the 域名管理 panel — both panels have a
    // "租户名称" search input, which would otherwise be ambiguous.
    const routingPanel = this.page.getByRole('tabpanel', { name: '域名管理' });
    const overviewTable = routingPanel.locator('table').first();
    await overviewTable.waitFor({ state: 'visible' });

    const search = routingPanel.getByPlaceholder('租户名称');
    await search.fill(tenantName);
    await search.press('Enter');
    await this.page.waitForLoadState('networkidle');

    const row = overviewTable
      .locator('tbody tr')
      .filter({ hasText: tenantName })
      .first();
    await row.getByRole('button', { name: '配置路由' }).click();
    // MailRoutingShell's first tab renders once the tenant context is active.
    await this.page
      .getByRole('tab', { name: TABS.receiving })
      .waitFor({ state: 'visible' });
  }

  /** Switch to a tab by its visible zh label. */
  async openTab(label: string) {
    await this.page.getByRole('tab', { name: label }).click();
  }

  // ─── Receiving: probe + nexthop Sheet CRUD ──────────────────────────────

  /** The per-domain card (one <section> per domain) in the receiving tab. */
  domainCard(domain: string): Locator {
    return this.page.locator('section', { hasText: domain }).first();
  }

  /** Click the per-card 探测 button (triggers POST /domains/:id/probe). */
  async probeDomain(domain: string) {
    await this.domainCard(domain).getByRole('button', { name: /^探测/ }).click();
  }

  /** Open the "添加目标" Sheet for a domain. */
  async openAddNexthop(domain: string) {
    await this.domainCard(domain).getByRole('button', { name: '添加目标' }).click();
    await this.sheet.waitFor({ state: 'visible' });
  }

  /** Open the edit Sheet for an existing nexthop row identified by its host. */
  async openEditNexthop(host: string) {
    await this.nexthopRow(host).locator('button:has(svg.lucide-pencil)').click();
    await this.sheet.waitFor({ state: 'visible' });
  }

  /**
   * Fill the nexthop Sheet. Host field has placeholder "mx.example.com"; the
   * port is the 1st number input, priority the 2nd. Type select defaults to
   * "domain" and is left unchanged.
   */
  async fillNexthop(data: { host: string; port?: string; priority?: string }) {
    const sheet = this.sheet;
    await sheet.getByPlaceholder('mx.example.com').fill(data.host);
    const numberInputs = sheet.locator('input[type="number"]');
    if (data.port !== undefined) {
      await numberInputs.nth(0).fill(data.port);
    }
    if (data.priority !== undefined) {
      await numberInputs.nth(1).fill(data.priority);
    }
  }

  async submitNexthop() {
    await this.sheet.getByRole('button', { name: '保存' }).click();
    await this.sheet.waitFor({ state: 'hidden' });
  }

  /** Submit any Dialog form (relay/outbound/auth) via its footer 保存 button. */
  async submitDialog() {
    await this.dialog.locator('button[type="submit"]').click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  /** A nexthop row identified by its host cell text (any domain card table). */
  nexthopRow(host: string): Locator {
    return this.page.locator('table tbody tr').filter({ hasText: host }).first();
  }

  /** Count of nexthop rows currently rendering the host (0 after delete). */
  nexthopRowCount(host: string): Promise<number> {
    return this.page.locator('table tbody tr').filter({ hasText: host }).count();
  }

  /** Delete a nexthop via its trash action + the confirm AlertDialog. */
  async deleteNexthop(host: string) {
    await this.nexthopRow(host).locator('button:has(svg.lucide-trash-2)').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.locator('button').last().click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  // ─── Relay: relay-rule Dialog CRUD ──────────────────────────────────────

  async openAddRelay() {
    await this.page.getByRole('button', { name: '添加反垃圾例外规则' }).click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /**
   * Fill the relay dialog. Name/priority have stable ids; the condition value
   * input carries the builder's "值..." placeholder (default tree is
   * client_ip + `cidr` operator — fill a valid CIDR so the server doesn't
   * reject the condition). skip_antispam is toggled on when requested.
   */
  async fillRelay(data: {
    name: string;
    priority?: string;
    conditionValue?: string;
    skipAntispam?: boolean;
  }) {
    const d = this.dialog;
    await d.locator('#relay-name').fill(data.name);
    if (data.priority !== undefined) {
      await d.locator('#relay-priority').fill(data.priority);
    }
    if (data.conditionValue !== undefined) {
      await d.locator('input[placeholder="值..."]').first().fill(data.conditionValue);
    }
    if (data.skipAntispam) {
      // Toggle via a dispatched click event rather than a pointer click: the
      // base-ui Switch is an 18px button inside a Dialog whose overlay sibling
      // makes Playwright's pointer hit-test land on the backdrop ("dialog-overlay
      // intercepts pointer events"), and a keyboard Space does not reliably
      // flip base-ui's Switch. A synthetic click dispatched straight on the
      // switch root bypasses the overlay and fires the component's onClick.
      await d.locator('#relay-skip').dispatchEvent('click');
      // Give React a tick to commit the checked state before submit reads it.
      await this.page.waitForTimeout(50);
    }
  }

  relayRow(name: string): Locator {
    return this.page.locator('table tbody tr').filter({ hasText: name }).first();
  }

  relayRowCount(name: string): Promise<number> {
    return this.page.locator('table tbody tr').filter({ hasText: name }).count();
  }

  /** Toggle the row's active status via its Power/PowerOff icon button. */
  async toggleRelayActive(name: string) {
    await this.relayRow(name)
      .locator('button:has(svg.lucide-power-off), button:has(svg.lucide-power)')
      .click();
  }

  async deleteRelay(name: string) {
    await this.relayRow(name).locator('button:has(svg.lucide-trash-2)').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.locator('button').last().click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  // ─── Outbound: route-rule Dialog CRUD ───────────────────────────────────

  async openCreateOutbound() {
    await this.page.getByRole('button', { name: '创建路由规则' }).click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /**
   * Fill the outbound dialog. The name input is react-hook-form-registered
   * (name="name"); the SMTP channel is the default, with hop host carrying
   * the "mail.example.com" placeholder. The condition builder's value input
   * ("值...") is filled so the server doesn't reject the empty default
   * senderdomain condition.
   */
  async fillOutbound(data: {
    name: string;
    nextHopHost: string;
    nextHopPort?: string;
    conditionValue?: string;
  }) {
    const d = this.dialog;
    await d.locator('input[name="name"]').fill(data.name);
    if (data.conditionValue !== undefined) {
      await d.locator('input[placeholder="值..."]').first().fill(data.conditionValue);
    }
    await d.getByPlaceholder('mail.example.com').fill(data.nextHopHost);
    if (data.nextHopPort !== undefined) {
      await d.locator('input[type="number"]').first().fill(data.nextHopPort);
    }
  }

  /**
   * Fill the outbound dialog for the proxysvr channel (TC-B03): switch the
   * channel select from the default SMTP next-hop to "代理服务器分组" and pick the
   * named active group. Exercises the channel=proxysvr metadata path
   * (proxysvr_group_id) rather than the SMTP next-hop path.
   */
  async fillOutboundProxysvr(data: { name: string; proxysvrGroup: string; conditionValue?: string }) {
    const d = this.dialog;
    await d.locator('input[name="name"]').fill(data.name);
    if (data.conditionValue !== undefined) {
      await d.locator('input[placeholder="值..."]').first().fill(data.conditionValue);
    }
    // The channel select shows the SMTP label ("SMTP 下一跳") by default; switch
    // it to "代理服务器分组" (i18n routeRules.channelProxysvr). Radix Select items
    // render in a page-level portal.
    await d.locator('[data-slot="select-trigger"]').filter({ hasText: 'SMTP 下一跳' }).first().click();
    await this.page.locator('[data-slot="select-item"]').filter({ hasText: '代理服务器分组' }).first().click();
    // The group select then appears (placeholder "选择一个活跃的代理服务器分组").
    await d.locator('[data-slot="select-trigger"]').filter({ hasText: '选择一个活跃的代理服务器分组' }).first().click();
    await this.page.locator('[data-slot="select-item"]').filter({ hasText: data.proxysvrGroup }).first().click();
  }

  outboundRow(name: string): Locator {
    return this.page.locator('table tbody tr').filter({ hasText: name }).first();
  }

  outboundRowCount(name: string): Promise<number> {
    return this.page.locator('table tbody tr').filter({ hasText: name }).count();
  }

  async deleteOutbound(name: string) {
    await this.outboundRow(name).locator('button:has(svg.lucide-trash-2)').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.locator('button').last().click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  // ─── Auth: mail_auth_config Dialog CRUD + Test Connection ───────────────

  async openAddAuth() {
    await this.page.getByRole('button', { name: '添加配置' }).click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /**
   * Fill the auth dialog. protocol defaults to smtp (left unchanged) and the
   * default scene smtpsend stays checked. To make the row uniquely
   * identifiable we switch domain scope to "指定域名" and supply a unique
   * domain; the server host is a loopback address so the optional Test
   * Connection fails fast (connection refused) rather than hanging on DNS.
   * authTimeout is lowered so any dial is bounded.
   */
  async fillAuth(data: { serverHost: string; specificDomain: string; authTimeout?: string }) {
    const d = this.dialog;
    // Domain scope = specific (the first select-trigger in the form).
    await d.locator('[data-slot="select-trigger"]').first().click();
    await this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: '指定域名' })
      .first()
      .click();
    await d.getByPlaceholder(/域名/).fill(data.specificDomain);

    await d.getByPlaceholder('mail.example.com').fill(data.serverHost);

    if (data.authTimeout !== undefined) {
      // number inputs in DOM order: priority(0), serverPort(1), authTimeout(2).
      await d.locator('input[type="number"]').nth(2).fill(data.authTimeout);
    }
  }

  /** Auth row identified by its unique domain-scope cell text. */
  authRow(scope: string): Locator {
    return this.page.locator('table tbody tr').filter({ hasText: scope }).first();
  }

  authRowCount(scope: string): Promise<number> {
    return this.page.locator('table tbody tr').filter({ hasText: scope }).count();
  }

  /** Open the Test Connection dialog for a config row (Zap icon). */
  async openTestConnection(scope: string) {
    await this.authRow(scope).locator('button:has(svg.lucide-zap)').click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /** Click the Test Connection dialog's action button (fires POST /test). */
  async runTest() {
    await this.dialog.getByRole('button', { name: '测试连接' }).click();
  }

  /** Close whatever dialog is currently open via its 取消 footer button. */
  async closeDialog() {
    await this.dialog.getByRole('button', { name: '取消' }).first().click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  async deleteAuth(scope: string) {
    await this.authRow(scope).locator('button:has(svg.lucide-trash-2)').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.locator('button').last().click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  // ─── Auth dialog: protocol/port introspection (TC-B05) ──────────────────

  /**
   * The server-port number input. In DOM order the auth dialog's number inputs
   * are: priority(0), serverPort(1), authTimeout(2).
   */
  authServerPortInput(): Locator {
    return this.dialog.locator('input[type="number"]').nth(1);
  }

  /** Current value of the server-port input. */
  async authServerPortValue(): Promise<string> {
    return (await this.authServerPortInput().inputValue()) as string;
  }

  /**
   * Switch the protocol select (the 2nd select-trigger in the dialog, after the
   * domain-scope select) and wait for handleProtocolChange to recompute the
   * default port. `protoLabel` is the visible zh label (SMTP/LDAP/POP3/IMAP).
   */
  async selectAuthProtocol(protoLabel: string) {
    // The protocol select is the 2nd select-trigger (domain scope is the 1st).
    await this.dialog.locator('[data-slot="select-trigger"]').nth(1).click();
    await this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: protoLabel })
      .first()
      .click();
    // Give React a tick to recompute the port from PROTOCOL_PORTS.
    await this.page.waitForTimeout(50);
  }
}

/** Visible zh tab labels (mailRouting.tabs.*). */
export const TABS = {
  receiving: '收件域',
  // mailRouting.tabs.relay renders 转发设置; this said 中继, which no longer
  // matches any tab and made every TABS.relay lookup resolve to nothing.
  relay: '转发设置',
  outbound: '出站路由',
  auth: '发件认证',
} as const;
