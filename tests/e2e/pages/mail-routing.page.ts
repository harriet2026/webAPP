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
  /** Generic dialog (auth test connection uses this; auth create/edit now uses `authDrawer`
   * — a Sheet, not a Dialog, since Task 8's html_spec redesign). */
  readonly dialog: Locator;
  /** Shared AlertDialog confirm (delete actions). */
  readonly confirmDialog: Locator;
  /** Receiving domain drawer (new/edit), scoped by testid. */
  readonly receivingDrawer: Locator;
  /** Relay rule drawer (new/edit), scoped by testid (Task 4 single-table redesign). */
  readonly relayDrawer: Locator;
  /** Outbound step-3 rule drawer (new/edit), scoped by testid (Task 7 wizard redesign). */
  readonly outboundRuleDrawer: Locator;
  /** Auth config new/edit Sheet drawer, scoped by testid (Task 8 html_spec redesign). */
  readonly authDrawer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sheet = page.locator('[data-slot="sheet-content"]');
    this.dialog = page.locator('[role="dialog"]');
    this.confirmDialog = page.locator('[role="alertdialog"]');
    this.receivingDrawer = page.locator('[data-testid="mr-recv-drawer"]');
    this.relayDrawer = page.locator('[data-testid="mr-relay-drawer"]');
    this.outboundRuleDrawer = page.locator('[data-testid="mr-ob-rule-drawer"]');
    this.authDrawer = page.locator('[data-testid="mr-auth-drawer"]');
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

  // ─── Receiving: flat domain table (html_spec 对齐重构, Task 3) ───────────
  // One row per domain (`mr-recv-row-<id>`); the drawer (`mr-recv-drawer`)
  // holds domain name / TagInput target addresses / shared port.

  /** The table row for a receiving domain, matched by its domain-name cell text. */
  domainRow(domain: string): Locator {
    return this.page.locator('[data-testid^="mr-recv-row-"]').filter({ hasText: domain }).first();
  }

  /** Number of rows currently rendering the domain (0 after delete). */
  domainRowCount(domain: string): Promise<number> {
    return this.page.locator('[data-testid^="mr-recv-row-"]').filter({ hasText: domain }).count();
  }

  /** Click the row's 探测 button (triggers POST /domains/:id/probe). */
  async probeDomainRow(domain: string) {
    await this.domainRow(domain).getByTestId(/^mr-recv-probe-/).click();
  }

  /** Open the row's 编辑 drawer for an existing domain. */
  async openEditDomain(domain: string) {
    await this.domainRow(domain).getByTestId(/^mr-recv-edit-/).click();
    await this.receivingDrawer.waitFor({ state: 'visible' });
  }

  /**
   * Fill the receiving-domain drawer: domain name input, TagInput target
   * addresses (each committed with Enter), and the shared port.
   */
  async fillReceivingDrawer(data: { domainName?: string; hosts?: string[]; port?: string }) {
    const drawer = this.receivingDrawer;
    if (data.domainName !== undefined) {
      await drawer.getByTestId('mr-recv-domain-input').fill(data.domainName);
    }
    for (const host of data.hosts ?? []) {
      const tagInput = drawer.getByTestId('mr-recv-tag-input');
      await tagInput.fill(host);
      await tagInput.press('Enter');
    }
    if (data.port !== undefined) {
      await drawer.getByTestId('mr-recv-port-input').fill(data.port);
    }
  }

  async saveReceivingDrawer() {
    await this.receivingDrawer.getByTestId('mr-recv-save').click();
    await this.receivingDrawer.waitFor({ state: 'hidden' });
  }

  /** Click the row's 删除 button, then confirm the「强制删除」AlertDialog. */
  async deleteDomainRow(domain: string) {
    await this.domainRow(domain).getByTestId(/^mr-recv-delete-/).click();
    await this.page.getByTestId('mr-recv-delete-dialog').waitFor({ state: 'visible' });
    await this.page.getByTestId('mr-recv-delete-confirm').click();
    await this.page.getByTestId('mr-recv-delete-dialog').waitFor({ state: 'hidden' });
  }

  // ─── Relay: relay-grants single-table Sheet drawer CRUD (html_spec 对齐重构,
  // Task 4) ─────────────────────────────────────────────────────────────────
  // One row per relay grant (`mr-relay-row-<id>`). Rule name (note) is
  // deliberately NOT a table column (html_spec §9-D2), so rows can't be
  // located by name text like the old unified-rules table could — callers
  // resolve the numeric id via the API (note round-trips reliably; unlike
  // client_cidr, sender_domain does NOT for a grant with no matching verified
  // tenant domain — see relay-mapping.ts's top-of-file comment) and pass it in.

  relayRow(id: number): Locator {
    return this.page.getByTestId(`mr-relay-row-${id}`);
  }

  relayRowCount(id: number): Promise<number> {
    return this.page.getByTestId(`mr-relay-row-${id}`).count();
  }

  async openCreateRelay() {
    await this.page.getByTestId('mr-relay-create').click();
    await this.relayDrawer.waitFor({ state: 'visible' });
  }

  async openEditRelay(id: number) {
    await this.relayRow(id).getByTestId(`mr-relay-edit-${id}`).click();
    await this.relayDrawer.waitFor({ state: 'visible' });
  }

  /** Toggle a base-ui Checkbox/Switch (data-checked/data-unchecked) to a target state. */
  private async setToggle(locator: Locator, target: boolean) {
    const checked = await locator.evaluate((el) => el.hasAttribute('data-checked'));
    if (checked !== target) {
      // Dispatch a synthetic click rather than a pointer click: base-ui's
      // Switch/Checkbox root is a small control inside a scrollable Sheet
      // whose siblings can intercept Playwright's pointer hit-test.
      await locator.dispatchEvent('click');
      await this.page.waitForTimeout(50);
    }
  }

  /** Fill the relay drawer (basic info + match conditions). */
  async fillRelayDrawer(data: {
    ruleName?: string;
    sourceIp?: string;
    fromDomain?: string;
    useSpf?: boolean;
    spamFilter?: boolean;
    active?: boolean;
  }) {
    const d = this.relayDrawer;
    if (data.ruleName !== undefined) {
      await d.getByTestId('mr-relay-name-input').fill(data.ruleName);
    }
    if (data.sourceIp !== undefined) {
      await d.getByTestId('mr-relay-source-ip-input').fill(data.sourceIp);
    }
    if (data.fromDomain !== undefined) {
      await d.getByTestId('mr-relay-from-domain-input').fill(data.fromDomain);
    }
    if (data.useSpf !== undefined) {
      await this.setToggle(d.getByTestId('mr-relay-spf-checkbox'), data.useSpf);
    }
    if (data.spamFilter !== undefined) {
      await d.getByTestId('mr-relay-spam-filter-select').click();
      await this.page
        .locator('[data-slot="select-item"]')
        .filter({ hasText: data.spamFilter ? '过滤' : '不过滤' })
        .first()
        .click();
    }
    if (data.active !== undefined) {
      await this.setToggle(d.getByTestId('mr-relay-active-switch'), data.active);
    }
  }

  async saveRelayDrawer() {
    await this.relayDrawer.getByTestId('mr-relay-save').click();
    await this.relayDrawer.waitFor({ state: 'hidden' });
  }

  async cancelRelayDrawer() {
    await this.relayDrawer.getByTestId('mr-relay-cancel').click();
    await this.relayDrawer.waitFor({ state: 'hidden' });
  }

  async deleteRelayRow(id: number) {
    // dispatchEvent('click') — the preceding create/save's success toast
    // (bottom-right, sonner) can sit directly over the 操作列 for a short
    // single-row table. A regular `.click()` (and even `{force:true}`, which
    // still delivers a real pointer event at the button's on-screen
    // coordinates) lands on the toast instead, and Playwright's own
    // hover-based actionability probing pauses/expands the sonner toast
    // (mouseenter suspends its auto-dismiss timer), deadlocking retries
    // forever rather than letting the toast time out. Dispatching a
    // synthetic DOM click bypasses hit-testing entirely — same idiom as
    // this file's setToggle() helper above for the identical class of
    // "unrelated sibling intercepts the pointer" problem.
    await this.relayRow(id).getByTestId(`mr-relay-delete-${id}`).dispatchEvent('click');
    await this.page.getByTestId('mr-relay-delete-dialog').waitFor({ state: 'visible' });
    await this.page.getByTestId('mr-relay-delete-confirm').click();
    await this.page.getByTestId('mr-relay-delete-dialog').waitFor({ state: 'hidden' });
  }

  // ─── Outbound: three-step wizard (StepBar + ProxyStep/ChannelStep/RuleStep,
  // html_spec 对齐重构, Task 7) ────────────────────────────────────────────
  // All three steps now hit the real backend (Task 13: proxysvr-endpoints /
  // proxysvr-groups / unified-rules — the old A9 mock-only BackendPendingPanel
  // placeholder for steps 1/2 is retired). This page object only drives step 3
  // (路由规则) directly, since that is what the spec's CRUD tests exercise:
  // regular unified-rules CRUD via a Sheet drawer (`mr-ob-rule-drawer`),
  // scoped by testid like the relay drawer above.

  /** Switch to step 3 (路由规则设置) of the outbound wizard. */
  async openOutboundRuleStep() {
    await this.page.getByTestId('mr-ob-step-3').click();
    await this.page.getByTestId('mr-ob-rule-root').waitFor({ state: 'visible' });
  }

  async openCreateOutboundRule() {
    await this.page.getByTestId('mr-ob-rule-create').click();
    await this.outboundRuleDrawer.waitFor({ state: 'visible' });
  }

  /**
   * Fill the rule drawer's discrete condition/routing fields. `fromDomain` is
   * filled by default callers so the server doesn't reject a genuinely
   * condition-less tree — real-mode `mail_routing_outbound` (rule_class=route)
   * is NOT on the backend's empty-catch-all-tree allowlist
   * (internal/api/field_registry.go::isAdvancedRulesCatchAllTree /
   * isGroupPolicySentinelTree only cover advanced_rules/group_policy), so an
   * all-empty condition tree 400s on create (see rule-step.tsx's top-of-file
   * comment on this exact limitation, found via browser verification).
   * `targetHost` is likewise effectively required for any non-proxysvr channel
   * (real backend requires next_hop_host when channel=smtp; rule-step.tsx's
   * client-side validation mirrors this).
   */
  async fillOutboundRule(data: {
    name: string;
    fromDomain?: string;
    targetHost?: string;
    targetPort?: string;
  }) {
    const d = this.outboundRuleDrawer;
    await d.getByTestId('mr-ob-rule-name-input').fill(data.name);
    if (data.fromDomain !== undefined) {
      await d.getByTestId('mr-ob-rule-from-domain-input').fill(data.fromDomain);
    }
    if (data.targetHost !== undefined) {
      await d.getByTestId('mr-ob-rule-target-host-input').fill(data.targetHost);
    }
    if (data.targetPort !== undefined) {
      await d.getByTestId('mr-ob-rule-target-port-input').fill(data.targetPort);
    }
  }

  /**
   * Switch the rule drawer's 投递通道 select from "默认通道" to a named
   * proxysvr group (TC-B03 / DEV-8: real mode's channel dropdown lists active
   * proxysvr groups, not the mock-only demo channels). Exercises the
   * channel=proxysvr metadata path (proxysvr_group_id) rather than the SMTP
   * next-hop path — targetHost is not required on this path (see rule-mapping.ts).
   */
  async selectOutboundRuleProxysvrChannel(groupName: string) {
    const d = this.outboundRuleDrawer;
    await d.getByTestId('mr-ob-rule-channel-select').click();
    await this.page.locator('[data-slot="select-item"]').filter({ hasText: groupName }).first().click();
  }

  async saveOutboundRuleDrawer() {
    await this.outboundRuleDrawer.getByTestId('mr-ob-rule-save').click();
    await this.outboundRuleDrawer.waitFor({ state: 'hidden' });
  }

  async cancelOutboundRuleDrawer() {
    await this.outboundRuleDrawer.getByTestId('mr-ob-rule-cancel').click();
    await this.outboundRuleDrawer.waitFor({ state: 'hidden' });
  }

  /** The rule-list row matched by its rule-name cell text (testid-scoped, like domainRow). */
  outboundRuleRow(name: string): Locator {
    return this.page.locator('[data-testid^="mr-ob-rule-row-"]').filter({ hasText: name }).first();
  }

  outboundRuleRowCount(name: string): Promise<number> {
    return this.page.locator('[data-testid^="mr-ob-rule-row-"]').filter({ hasText: name }).count();
  }

  async openEditOutboundRule(name: string) {
    await this.outboundRuleRow(name).locator('[data-testid^="mr-ob-rule-edit-"]').click();
    await this.outboundRuleDrawer.waitFor({ state: 'visible' });
  }

  async deleteOutboundRule(name: string) {
    await this.outboundRuleRow(name).locator('[data-testid^="mr-ob-rule-delete-"]').click();
    await this.page.getByTestId('mr-ob-rule-delete-dialog').waitFor({ state: 'visible' });
    await this.page.getByTestId('mr-ob-rule-delete-confirm').click();
    await this.page.getByTestId('mr-ob-rule-delete-dialog').waitFor({ state: 'hidden' });
  }

  // ─── Auth: mail_auth_config Sheet CRUD + Test Connection Dialog (Task 8
  // html_spec redesign — TLS 三档 + 域名多选 Popover) ────────────────────────

  async openAddAuth() {
    await this.page.getByTestId('mr-auth-create').click();
    await this.authDrawer.waitFor({ state: 'visible' });
  }

  /**
   * Select a domain in the drawer's 适用域名 multi-select Popover. Domain scope
   * is no longer free text (Task 8 redesign) — the option text must exactly
   * match an existing *verified* tenant domain, sourced from
   * `GET /tenants/:id/domains`. Opens the popover, checks the option, then
   * closes it (Escape) so it doesn't cover the rest of the form.
   */
  async selectAuthDomain(domainText: string) {
    await this.authDrawer.getByTestId('mr-auth-domain-trigger').click();
    const popover = this.page.getByTestId('mr-auth-domain-popover');
    await popover.waitFor({ state: 'visible' });
    await popover.getByText(domainText, { exact: true }).click();
    await this.page.keyboard.press('Escape');
    await popover.waitFor({ state: 'hidden' });
  }

  /**
   * Fill the auth drawer. `domain` must be an existing verified tenant domain
   * (selected via the Popover, see `selectAuthDomain`). protocol defaults to
   * LDAP + TLS=prefer (drawer defaults) unless changed via `selectAuthProtocol`
   * / `selectAuthTlsMode`. The server host is a loopback address in most
   * callers so the optional Test Connection fails fast (connection refused)
   * rather than hanging on DNS; authTimeout is lowered so any dial is bounded.
   */
  async fillAuth(data: { serverHost: string; domain: string; authTimeout?: string }) {
    const d = this.authDrawer;
    await this.selectAuthDomain(data.domain);
    await d.getByTestId('mr-auth-host-input').fill(data.serverHost);
    if (data.authTimeout !== undefined) {
      await d.getByTestId('mr-auth-timeout-input').fill(data.authTimeout);
    }
  }

  /** Check a 生效场景 checkbox in the auth drawer (`scene` is one of
   * userspace/smtpsend/mailsync). Uses the same synthetic-click helper as the
   * relay drawer's checkboxes/switch (`setToggle`) — base-ui's control is a
   * small root inside a scrollable Sheet whose siblings can intercept
   * Playwright's pointer hit-test. */
  async checkAuthScene(scene: 'userspace' | 'smtpsend' | 'mailsync') {
    await this.setToggle(this.authDrawer.getByTestId(`mr-auth-scene-${scene}`), true);
  }

  /** Auth row identified by its unique domain-scope cell text. */
  authRow(scope: string): Locator {
    return this.page.locator('[data-testid^="mr-auth-row-"]').filter({ hasText: scope }).first();
  }

  authRowCount(scope: string): Promise<number> {
    return this.page.locator('[data-testid^="mr-auth-row-"]').filter({ hasText: scope }).count();
  }

  async saveAuthDrawer() {
    await this.authDrawer.getByTestId('mr-auth-save').click();
    await this.authDrawer.waitFor({ state: 'hidden' });
  }

  async cancelAuthDrawer() {
    await this.authDrawer.getByTestId('mr-auth-cancel').click();
    await this.authDrawer.waitFor({ state: 'hidden' });
  }

  /** Open the Test Connection dialog for a config row (still a Dialog, not the
   * drawer — brief keeps this form as-is). */
  async openTestConnection(scope: string) {
    await this.authRow(scope).getByTestId(/^mr-auth-test-/).click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /** Click the Test Connection dialog's action button (fires POST /test). */
  async runTest() {
    await this.page.getByTestId('mr-auth-test-run').click();
  }

  /** Close whatever dialog is currently open via its 取消 footer button. */
  async closeDialog() {
    await this.dialog.getByRole('button', { name: '取消' }).first().click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  async deleteAuth(scope: string) {
    await this.authRow(scope).getByTestId(/^mr-auth-delete-/).click();
    await this.page.getByTestId('mr-auth-delete-dialog').waitFor({ state: 'visible' });
    await this.page.getByTestId('mr-auth-delete-confirm').click();
    await this.page.getByTestId('mr-auth-delete-dialog').waitFor({ state: 'hidden' });
  }

  // ─── Auth drawer: protocol/TLS-mode/port introspection (TC-B05) ─────────

  /** The server-port number input inside the auth drawer. */
  authServerPortInput(): Locator {
    return this.authDrawer.getByTestId('mr-auth-port-input');
  }

  /** Current value of the server-port input. */
  async authServerPortValue(): Promise<string> {
    return (await this.authServerPortInput().inputValue()) as string;
  }

  /**
   * Switch the 认证协议 select and wait for handleProtocolChange to recompute
   * the default port. `protoLabel` is the visible zh label (SMTP/LDAP/POP3/IMAP).
   */
  async selectAuthProtocol(protoLabel: string) {
    await this.authDrawer.getByTestId('mr-auth-protocol-select').click();
    await this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: protoLabel })
      .first()
      .click();
    // Give React a tick to recompute the port from PROTOCOL_PORTS.
    await this.page.waitForTimeout(50);
  }

  /**
   * Switch the 传输加密（TLS） select and wait for handleTlsModeChange to
   * recompute the default port. `modeLabel` is the visible zh label
   * (关闭/优先 TLS/强制 TLS).
   */
  async selectAuthTlsMode(modeLabel: string) {
    await this.authDrawer.getByTestId('mr-auth-tls-mode-select').click();
    await this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: modeLabel })
      .first()
      .click();
    await this.page.waitForTimeout(50);
  }
}

/** Visible zh tab labels (mailRouting.tabs.*). */
export const TABS = {
  receiving: '收信域管理',
  // mailRouting.tabs.relay renders 转发设置; this said 中继, which no longer
  // matches any tab and made every TABS.relay lookup resolve to nothing.
  relay: '转发设置',
  outbound: '出站路由',
  auth: '发信认证',
} as const;
