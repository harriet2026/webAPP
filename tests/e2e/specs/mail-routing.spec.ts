import { test, expect } from '../fixtures/auth.fixture';
import { MailRoutingPage, TABS } from '../pages/mail-routing.page';
import { uniqueSuffixAlnum } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';
import { resolveTenantRoleID } from '../helpers/roles';
import { pickActiveTenantId } from '../helpers/tenant';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:18080';

// ─── API helpers (module-scope fetch, usable from beforeAll/afterAll) ─────────

async function adminToken(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!r.ok) throw new Error(`admin login failed: ${r.status}`);
  return (await r.json()).token as string;
}

async function firstTenantId(token: string): Promise<number | null> {
  const r = await fetch(`${API_BASE}/api/v1/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const body = await r.json();
  return pickActiveTenantId(body.items);
}

async function createTenant(token: string, name: string, code: string): Promise<number> {
  const r = await fetch(`${API_BASE}/api/v1/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, code }),
  });
  if (!r.ok) throw new Error(`create tenant failed: ${r.status} ${await r.text()}`);
  const body = await r.json();
  return body.tenant.id as number;
}

async function deleteTenant(token: string, tenantId: number) {
  const r = await fetch(`${API_BASE}/api/v1/tenants/${tenantId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 204 deleted; 404 already gone (e.g. a prior run's cleanup raced).
  if (!r.ok && r.status !== 404) {
    console.warn(`cleanup: delete tenant ${tenantId} -> ${r.status}`);
  }
}

async function isMultiTenantForm(token: string): Promise<boolean> {
  // The standalone /zh/mail-routing page renders MailRoutingShell only in
  // single-tenant product forms; in multi-tenant it short-circuits to an
  // AccessDeniedPanel (mail-routing is reached via the per-tenant drilldown).
  try {
    const r = await fetch(`${API_BASE}/api/v1/bootstrap`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const body = await r.json();
    return Boolean(body?.capabilities?.multiTenant);
  } catch {
    return false;
  }
}

async function createDomain(token: string, tenantId: number, domain: string): Promise<number | null> {
  const r = await fetch(`${API_BASE}/api/v1/tenants/${tenantId}/domains`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      // Hardened route (F1 Task 2): system_admin must send X-Tenant-ID
      // matching the path tenantId, otherwise the backend returns 400.
      'X-Tenant-ID': String(tenantId),
    },
    body: JSON.stringify({ domain }),
  });
  if (!r.ok) {
    console.warn(`create domain failed: ${r.status} ${await r.text()}`);
    return null;
  }
  return ((await r.json()) as { id: number }).id;
}

async function deleteDomain(token: string, tenantId: number, domainId: number | null) {
  if (domainId === null) return;
  const r = await fetch(`${API_BASE}/api/v1/tenants/${tenantId}/domains/${domainId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': String(tenantId),
    },
  });
  if (!r.ok && r.status !== 404) {
    console.warn(`cleanup: delete domain ${domainId} -> ${r.status}`);
  }
}

async function createProxysvrGroup(token: string, name: string): Promise<number> {
  // A group needs only a name to be active (is_active defaults true); members
  // are optional and ListActiveProxysvrGroups filters on is_active alone.
  const r = await fetch(`${API_BASE}/api/v1/proxysvr-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, members: [] }),
  });
  if (!r.ok) throw new Error(`create proxysvr group failed: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { id: number }).id;
}

async function deleteProxysvrGroup(token: string, id: number | null) {
  if (id === null) return;
  // Must run AFTER any referencing route rule is deleted, else the delete guard
  // returns 409 (a referenced group cannot be removed — TC-B07).
  const r = await fetch(`${API_BASE}/api/v1/proxysvr-groups/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404) {
    console.warn(`cleanup: delete proxysvr group ${id} -> ${r.status}`);
  }
}

/**
 * Best-effort sweep of any rows a flaky/partial run may have leaked, keyed by
 * the unique per-run suffix. Tenant-scoped endpoints need X-Tenant-ID.
 */
async function sweepStragglers(token: string, tenantId: number, suffix: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-ID': String(tenantId),
  };

  // mail-auth-configs: match by domain_scope.domains containing the suffix.
  try {
    const r = await fetch(`${API_BASE}/api/v1/mail-auth-configs?page=1&page_size=200`, { headers });
    if (r.ok) {
      const items = ((await r.json()) as { items?: Array<{ id: number; domain_scope?: { domains?: string[] } }> }).items ?? [];
      for (const c of items) {
        const doms = c.domain_scope?.domains ?? [];
        if (doms.some((d) => d.includes(suffix))) {
          await fetch(`${API_BASE}/api/v1/mail-auth-configs/${c.id}`, { method: 'DELETE', headers });
        }
      }
    }
  } catch (e) {
    console.warn('sweep mail-auth-configs failed', e);
  }

  // unified-rules: relay (action/rcpt) + outbound (route/data) pages, by name.
  const ruleQueries = [
    { rule_class: 'action', stage: 'rcpt', page: 'mail_routing_relay' },
    { rule_class: 'route', stage: 'data', page: 'mail_routing_outbound' },
  ];
  for (const q of ruleQueries) {
    try {
      const qs = new URLSearchParams(q).toString();
      const r = await fetch(`${API_BASE}/api/v1/unified-rules?${qs}`, { headers });
      if (!r.ok) continue;
      const items = ((await r.json()) as { items?: Array<{ id: number; name: string }> }).items ?? [];
      for (const rule of items) {
        if (rule.name.includes(suffix)) {
          await fetch(`${API_BASE}/api/v1/unified-rules/${rule.id}`, { method: 'DELETE', headers });
        }
      }
    } catch (e) {
      console.warn(`sweep ${q.page} failed`, e);
    }
  }
}

// ─── Spec ────────────────────────────────────────────────────────────────────

/**
 * Mail Routing UI — Playwright E2E covering all 4 MailRoutingShell tabs
 * (Receiving nexthop CRUD + probe, Relay rule CRUD + skip_antispam, Outbound
 * route-rule CRUD, Auth config CRUD + Test Connection) on the standalone
 * /zh/mail-routing page.
 *
 * Tenant selection: the standalone page is single-tenant; the webapp's
 * useApiRequest sends X-Tenant-ID from `osgateway_selected_tenant` in
 * localStorage, which the auth context reads on mount. We set it BEFORE the
 * full page.goto so the context hydrates with the right tenant.
 *
 * Skip guard: the standalone page short-circuits to AccessDeniedPanel under a
 * multi-tenant product form (mail-routing is reached via the per-tenant
 * drilldown there). The dev docker-compose runs OSG_PRODUCT_FORM=cloud, so the
 * suite skips cleanly in dev and runs in any single-tenant form.
 */
test.describe.serial('Mail Routing UI', () => {
  const suffix = uniqueSuffixAlnum();
  const domain = `mx-${suffix}.example.com`;

  let token = '';
  let tenantId: number | null = null;
  let domainId: number | null = null;
  let multiTenant = false;

  test.beforeAll(async () => {
    token = await adminToken();
    tenantId = await firstTenantId(token);
    if (tenantId === null) return;
    multiTenant = await isMultiTenantForm(token);
    // Only seed a receiving domain when the standalone page is reachable.
    if (!multiTenant) {
      domainId = await createDomain(token, tenantId, domain);
    }
  });

  test.afterAll(async () => {
    if (tenantId === null) return;
    try {
      await sweepStragglers(token, tenantId, suffix);
      await deleteDomain(token, tenantId, domainId);
    } catch (e) {
      console.warn('afterAll: cleanup failed', e);
    }
  });

  // Each test gets a fresh logged-in page; hydrate the tenant + open the page.
  test.beforeEach(async () => {
    test.skip(
      tenantId === null,
      'no tenant exists — global-setup should have seeded one',
    );
    test.skip(
      multiTenant,
      'standalone /zh/mail-routing requires a single-tenant product form; current form is multi-tenant (the page renders AccessDeniedPanel). Run under e.g. legacy-single/ai-single, or cover these tabs via the tenant drilldown.',
    );
  });

  async function openRouting(page: import('@playwright/test').Page): Promise<MailRoutingPage> {
    await page.evaluate((tid) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
    }, tenantId!);
    const mp = new MailRoutingPage(page);
    await mp.goto();
    return mp;
  }

  test('receiving: probe + nexthop create/edit/delete', async ({ authenticatedPage }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.receiving);

    const card = mp.domainCard(domain);
    await expect(card).toBeVisible({ timeout: 15000 });

    // Probe (no nexthops yet → the API returns immediately; toast 探测完成).
    await mp.probeDomain(domain);
    await waitForToast(authenticatedPage);

    // Create a nexthop.
    const host = `nh-${suffix}.example.com`;
    await mp.openAddNexthop(domain);
    await mp.fillNexthop({ host, port: '2525', priority: '10' });
    await mp.submitNexthop();
    await waitForToast(authenticatedPage);
    await expect(mp.nexthopRow(host)).toBeVisible({ timeout: 15000 });
    const createdRow = mp.nexthopRow(host);
    await expect(createdRow).toContainText(host);
    await expect(createdRow).toContainText('2525');
    await expect(createdRow).toContainText('10');

    // Edit: change the host.
    const host2 = `nh2-${suffix}.example.com`;
    await mp.openEditNexthop(host);
    await mp.fillNexthop({ host: host2 });
    await mp.submitNexthop();
    await waitForToast(authenticatedPage);
    await expect(mp.nexthopRow(host2)).toBeVisible({ timeout: 15000 });

    // Delete and confirm it is gone.
    await mp.deleteNexthop(host2);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.nexthopRowCount(host2), { timeout: 15000 }).toBe(0);
  });

  test('relay: create, toggle active, delete', async ({ authenticatedPage }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.relay);

    const name = `relay-${suffix}`;
    await mp.openAddRelay();
    await mp.fillRelay({
      name,
      priority: '200',
      // Fill the default client_ip condition value (operator is `cidr`, the
      // canonical ip-field operator) so the server doesn't reject an empty
      // condition.
      conditionValue: '10.0.0.0/8',
    });
    await mp.submitDialog();
    await waitForToast(authenticatedPage);

    const row = mp.relayRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(name);
    // skip_antispam is not asserted: the base-ui Switch inside the scrollable
    // Dialog isn't reliably toggable by Playwright (overlay intercepts the
    // pointer click on the 18px switch; inputs work only because fill() uses
    // JS focus). The create/toggle/delete flow is the coverage goal.

    // Toggle the row's active status (row icon button — outside the dialog).
    await mp.toggleRelayActive(name);
    await waitForToast(authenticatedPage);

    // Delete.
    await mp.deleteRelay(name);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.relayRowCount(name), { timeout: 15000 }).toBe(0);
  });

  test('outbound: create SMTP route, delete', async ({ authenticatedPage }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.outbound);

    const name = `out-${suffix}`;
    const hop = `smtp-${suffix}.example.com`;
    await mp.openCreateOutbound();
    await mp.fillOutbound({
      name,
      nextHopHost: hop,
      nextHopPort: '25',
      // Fill the default senderdomain condition so the server doesn't reject it.
      conditionValue: `${suffix}.example.com`,
    });
    await mp.submitDialog();
    await waitForToast(authenticatedPage);

    const row = mp.outboundRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(hop);

    await mp.deleteOutbound(name);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.outboundRowCount(name), { timeout: 15000 }).toBe(0);
  });

  test('auth: create config, test connection, delete', async ({ authenticatedPage }) => {
    // The Test Connection dial may take up to auth_timeout; bound it + the test.
    test.setTimeout(90000);

    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.auth);

    const scopeDomain = `${suffix}.example.com`;
    await mp.openAddAuth();
    await mp.fillAuth({
      // Loopback so Test Connection fails fast (connection refused) rather than
      // hanging on DNS; either success/failure satisfies the result assertion.
      serverHost: '127.0.0.1',
      specificDomain: scopeDomain,
      authTimeout: '3',
    });
    await mp.submitDialog();
    await waitForToast(authenticatedPage);

    const row = mp.authRow(scopeDomain);
    await expect(row).toBeVisible({ timeout: 15000 });

    // Test Connection → a result (成功 or 失败) must render.
    await mp.openTestConnection(scopeDomain);
    await mp.runTest();
    await expect(mp.dialog.getByText(/连接成功|连接失败/)).toBeVisible({ timeout: 20000 });
    await mp.closeDialog();

    // Delete.
    await mp.deleteAuth(scopeDomain);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.authRowCount(scopeDomain), { timeout: 15000 }).toBe(0);
  });

  test('auth: protocol switch auto-fills the default port (TC-B05)', async ({ authenticatedPage }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.auth);

    await mp.openAddAuth();
    // smtp is the default protocol → port must be 25 (PROTOCOL_PORTS.smtp.plain).
    await expect(mp.authServerPortInput()).toHaveValue('25', { timeout: 5000 });

    // Switching the protocol must recompute the port from PROTOCOL_PORTS.
    // plain-protocol defaults (ssl_enabled stays off on the create form).
    for (const [proto, port] of [
      ['LDAP', '389'],
      ['POP3', '110'],
      ['IMAP', '143'],
      ['SMTP', '25'],
    ] as const) {
      await mp.selectAuthProtocol(proto);
      await expect(mp.authServerPortInput()).toHaveValue(port);
    }

    // Cancel — no row is created.
    await mp.closeDialog();
    await mp.dialog.waitFor({ state: 'hidden' });
  });

  test('auth: invalid input blocks save (TC-B06 field validation)', async ({ authenticatedPage }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.auth);

    const scopeDomain = `invalid-${suffix}.example.com`;
    await mp.openAddAuth();
    // Leave the server host blank → client-side validation must reject the save.
    await mp.fillAuth({ serverHost: '', specificDomain: scopeDomain, authTimeout: '3' });

    // Submit directly (NOT submitDialog(), which waits for the dialog to close):
    // validation must keep the dialog OPEN and surface an error, so the dialog
    // stays visible and no row is created.
    await mp.dialog.locator('button[type="submit"]').click();
    await expect(mp.dialog).toBeVisible();
    await expect.poll(async () => mp.authRowCount(scopeDomain), { timeout: 5000 }).toBe(0);

    await mp.closeDialog();
  });

  test('relay: skip_antispam toggle persists in metadata (Tier-4 #16)', async ({ authenticatedPage }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.relay);

    const name = `relay-skip-${suffix}`;
    await mp.openAddRelay();
    await mp.fillRelay({
      name,
      priority: '300',
      conditionValue: '10.0.0.0/8',
      skipAntispam: true,
    });
    await mp.submitDialog();
    await waitForToast(authenticatedPage);

    const row = mp.relayRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });

    // The table cell renders 是/否 from metadata.skip_antispam (relay-tab
    // readSkipAntispam). Asserting 是 proves the toggle reached the API and
    // was persisted on the rule (not just local form state).
    await expect(row).toContainText('是', { timeout: 5000 });

    // Cross-check via the API: metadata.skip_antispam === true.
    const listed = await authenticatedPage.request.get(
      `${API_BASE}/api/v1/unified-rules?rule_page=mail_routing_relay&page=1&page_size=50`,
      { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) } },
    );
    expect(listed.ok()).toBeTruthy();
    const items = (await listed.json()).items ?? [];
    const created = items.find((r: { name: string }) => r.name === name);
    expect(created, `relay rule ${name} not found in list`).toBeTruthy();
    const meta = created.metadata ? (typeof created.metadata === 'string' ? JSON.parse(created.metadata) : created.metadata) : {};
    expect(meta.skip_antispam).toBe(true);

    // Cleanup.
    await mp.deleteRelay(name);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.relayRowCount(name), { timeout: 15000 }).toBe(0);
  });
});

// ─── Multi-tenant drill-down ────────────────────────────────────────────────

/**
 * Mail Routing UI — multi-tenant drill-down coverage. In the cloud
 * (multi-tenant) product form the standalone /zh/mail-routing page renders an
 * AccessDeniedPanel, so the 4 mail-routing tabs are reachable ONLY via the
 * per-tenant drill-down on /zh/tenants → 域名管理 → 配置路由. That drill-down now
 * renders the same MailRoutingShell (unified UI), and opening it sets the
 * global selected tenant so useApiRequest injects X-Tenant-ID for system_admin.
 *
 * This describe mirrors the standalone suite but drives the shell through the
 * drill-down. It runs only under a multi-tenant form (skips otherwise — there
 * the standalone suite above covers the same CRUD).
 */
test.describe.serial('Mail Routing UI (multi-tenant drilldown)', () => {
  const suffix = uniqueSuffixAlnum();
  const tenantName = `e2e_mroute_${suffix}`;
  const tenantCode = `emr${suffix.toLowerCase()}`;
  const domain = `mx-${suffix}.example.com`;

  let token = '';
  let tenantId: number | null = null;
  let domainId: number | null = null;
  let proxysvrGroupId: number | null = null;
  const proxysvrGroupName = `pxg-${suffix}`;
  let multiTenant = false;

  test.beforeAll(async () => {
    token = await adminToken();
    multiTenant = await isMultiTenantForm(token);
    if (!multiTenant) return;
    tenantId = await createTenant(token, tenantName, tenantCode);
    domainId = await createDomain(token, tenantId, domain);
    proxysvrGroupId = await createProxysvrGroup(token, proxysvrGroupName);
  });

  test.afterAll(async () => {
    if (tenantId === null) return;
    try {
      // Sweep route rules first so the proxysvr group is no longer referenced
      // (the delete guard would otherwise 409), then drop the group + tenant.
      await sweepStragglers(token, tenantId, suffix);
      await deleteProxysvrGroup(token, proxysvrGroupId);
      await deleteDomain(token, tenantId, domainId);
      await deleteTenant(token, tenantId);
    } catch (e) {
      console.warn('afterAll: cleanup failed', e);
    }
  });

  test.beforeEach(async () => {
    test.skip(
      !multiTenant,
      'drill-down requires a multi-tenant product form; current form is single-tenant (covered by the standalone suite above)',
    );
  });

  async function openDrilldown(page: import('@playwright/test').Page): Promise<MailRoutingPage> {
    // NOTE: deliberately entered from the PLATFORM viewer -- the default state a
    // system_admin lands in after login (no osg_viewer cookie =>
    // readViewerCookie() returns 'platform'). That is the real drill-down entry
    // path, and it is currently BROKEN:
    //
    //   routing-tab.tsx openDrilldown() sets the global selected tenant so
    //   useApiRequest sends X-Tenant-ID == path :id (required since F1 Task 2),
    //   but GT-12245's reconciliation in product-form-context.tsx immediately
    //   clears any tenant selection while viewer === 'platform'. The two cancel
    //   out: X-Tenant-ID goes out undefined and every tenant-scoped mail-routing
    //   call 400s ("tenant_id required"), which the UI renders as the misleading
    //   empty state 「暂无收信域配置。」 rather than an error.
    //
    // Do NOT "fix" this by entering as viewer=tenant: that hides the defect.
    // These tests are expected to fail until the product bug is resolved.
    const mp = new MailRoutingPage(page);
    await mp.openViaTenantDrilldown(tenantName);
    return mp;
  }

  test('drilldown renders MailRoutingShell with the 4 mail-routing tabs', async ({
    authenticatedPage,
  }) => {
    await openDrilldown(authenticatedPage);

    // Tenant context header from RoutingDetail.
    await expect(authenticatedPage.getByText(tenantName, { exact: true }).first()).toBeVisible();
    await expect(authenticatedPage.getByText(tenantCode)).toBeVisible();

    // All 4 MailRoutingShell tabs are present (mailRouting.tabs.* labels).
    for (const label of Object.values(TABS)) {
      await expect(authenticatedPage.getByRole('tab', { name: label })).toBeVisible();
    }
  });

  test('receiving: nexthop create/delete via drilldown', async ({ authenticatedPage }) => {
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.receiving);

    const card = mp.domainCard(domain);
    await expect(card).toBeVisible({ timeout: 15000 });

    const host = `nh-${suffix}.example.com`;
    await mp.openAddNexthop(domain);
    await mp.fillNexthop({ host, port: '2525', priority: '10' });
    await mp.submitNexthop();
    await waitForToast(authenticatedPage);

    await expect(mp.nexthopRow(host)).toBeVisible({ timeout: 15000 });
    const row = mp.nexthopRow(host);
    await expect(row).toContainText(host);
    await expect(row).toContainText('2525');

    await mp.deleteNexthop(host);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.nexthopRowCount(host), { timeout: 15000 }).toBe(0);
  });

  test('relay: create/delete via drilldown', async ({ authenticatedPage }) => {
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.relay);

    const name = `relay-${suffix}`;
    await mp.openAddRelay();
    await mp.fillRelay({
      name,
      priority: '200',
      conditionValue: '10.0.0.0/8',
    });
    await mp.submitDialog();
    await waitForToast(authenticatedPage);

    const row = mp.relayRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(name);
    // skip_antispam is not asserted: the base-ui Switch inside the scrollable
    // Dialog isn't reliably toggable by Playwright (overlay intercepts the
    // pointer click on the 18px switch; inputs work only because fill() uses
    // JS focus). The create/delete flow is the drill-down coverage goal.

    await mp.deleteRelay(name);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.relayRowCount(name), { timeout: 15000 }).toBe(0);
  });

  test('outbound: create/delete route rule via drilldown', async ({ authenticatedPage }) => {
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.outbound);

    const name = `out-${suffix}`;
    const hop = `smtp-${suffix}.example.com`;
    await mp.openCreateOutbound();
    await mp.fillOutbound({
      name,
      nextHopHost: hop,
      nextHopPort: '25',
      conditionValue: `${suffix}.example.com`,
    });
    await mp.submitDialog();
    await waitForToast(authenticatedPage);

    const row = mp.outboundRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(hop);

    await mp.deleteOutbound(name);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.outboundRowCount(name), { timeout: 15000 }).toBe(0);
  });

  test('outbound: create route via proxysvr channel (TC-B03)', async ({ authenticatedPage }) => {
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.outbound);

    const name = `outpx-${suffix}`;
    await mp.openCreateOutbound();
    // Switch the delivery channel to a proxysvr group (the TC-B03 path: route
    // rule selects a proxysvr group rather than an SMTP next-hop).
    await mp.fillOutboundProxysvr({
      name,
      proxysvrGroup: proxysvrGroupName,
      conditionValue: `${suffix}.example.com`,
    });
    await mp.submitDialog();
    await waitForToast(authenticatedPage);

    const row = mp.outboundRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });
    // The next-hop cell renders "代理服务器分组: <groupName>" for the proxysvr channel.
    await expect(row).toContainText(proxysvrGroupName);

    await mp.deleteOutbound(name);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.outboundRowCount(name), { timeout: 15000 }).toBe(0);
  });

  test('auth: create/delete mail-auth config via drilldown', async ({ authenticatedPage }) => {
    test.setTimeout(90000);
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.auth);

    const scopeDomain = `${suffix}.example.com`;
    await mp.openAddAuth();
    await mp.fillAuth({
      serverHost: '127.0.0.1',
      specificDomain: scopeDomain,
      authTimeout: '3',
    });
    await mp.submitDialog();
    await waitForToast(authenticatedPage);

    const row = mp.authRow(scopeDomain);
    await expect(row).toBeVisible({ timeout: 15000 });

    await mp.deleteAuth(scopeDomain);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.authRowCount(scopeDomain), { timeout: 15000 }).toBe(0);
  });
});

// ─── tenant_admin access denial (TC-O04/O06/O08) ─────────────────────────────

/**
 * Mail routing is system_admin-only in every product form (spec §3.2). A
 * tenant_admin reaching the standalone /zh/mail-routing entry must NOT see the
 * MailRoutingShell — the page renders an access-denied panel (review C4). This
 * runs only under a single-tenant form (the standalone page exists there); in a
 * multi-tenant form there is no standalone entry to deny.
 */
test.describe.serial('Mail Routing UI — tenant_admin denied', () => {
  const suffix = uniqueSuffixAlnum();
  const tenantName = `mroute_ta_${suffix}`;
  const tenantCode = `mta${suffix.toLowerCase()}`;
  const username = `mroute_ta_${suffix}`;
  const password = 'TenantPass123!';

  let token = '';
  let tenantId: number | null = null;
  let userId: number | null = null;
  let multiTenant = false;

  test.beforeAll(async () => {
    token = await adminToken();
    multiTenant = await isMultiTenantForm(token);
    if (multiTenant) return;
    tenantId = await createTenant(token, tenantName, tenantCode);
    const r = await fetch(`${API_BASE}/api/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username, password, role: 'tenant_admin', role_id: await resolveTenantRoleID(API_BASE, token), tenant_id: tenantId, must_change_password: false }),
    });
    if (!r.ok) throw new Error(`create tenant_admin user failed: ${r.status} ${await r.text()}`);
    userId = ((await r.json()) as { id: number }).id;
  });

  test.afterAll(async () => {
    if (userId !== null) {
      await fetch(`${API_BASE}/api/v1/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (tenantId !== null) {
      await deleteTenant(token, tenantId);
    }
  });

  test('tenant_admin: standalone → access denied (no MailRoutingShell)', async ({ page }) => {
    test.skip(multiTenant, 'standalone denial is a single-tenant-form concern');

    // Log in as the tenant_admin (NOT the default admin).
    await page.goto('/zh/login');
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Direct navigation to the mail-routing entry must NOT render the shell.
    await page.goto('/zh/mail-routing');

    // The shell's tabs (mailRouting.tabs.*) must never appear for tenant_admin.
    for (const label of Object.values(TABS)) {
      await expect(page.getByRole('tab', { name: label })).toHaveCount(0);
    }
    // AccessDeniedPanel renders a "403" title (the C4 guard). Asserting it
    // (plus the absent tabs above) proves the standalone entry is denied.
    await expect(page.getByText('403').first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── tenant_admin access denial — multi-tenant form (TC-O04/O06/O08) ─────────

/**
 * Mail routing is system_admin-only in EVERY product form (spec §3.2 "任何形态下").
 * The describe above covers the single-tenant standalone entry; this one covers
 * the multi-tenant (cloud) form, where the standalone /zh/mail-routing page must
 * still deny a tenant_admin — the page renders the access-denied guard and/or
 * redirects to the tenant center, so the MailRoutingShell is never reachable.
 * Runs only under a multi-tenant form (skips otherwise).
 */
test.describe.serial('Mail Routing UI — tenant_admin denied (multi-tenant)', () => {
  const suffix = uniqueSuffixAlnum();
  const tenantName = `mroute_tam_${suffix}`;
  const tenantCode = `mtam${suffix.toLowerCase()}`;
  const username = `mroute_tam_${suffix}`;
  const password = 'TenantPass123!';

  let token = '';
  let tenantId: number | null = null;
  let userId: number | null = null;
  let multiTenant = false;

  test.beforeAll(async () => {
    token = await adminToken();
    multiTenant = await isMultiTenantForm(token);
    if (!multiTenant) return;
    tenantId = await createTenant(token, tenantName, tenantCode);
    const r = await fetch(`${API_BASE}/api/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username, password, role: 'tenant_admin', role_id: await resolveTenantRoleID(API_BASE, token), tenant_id: tenantId, must_change_password: false }),
    });
    if (!r.ok) throw new Error(`create tenant_admin user failed: ${r.status} ${await r.text()}`);
    userId = ((await r.json()) as { id: number }).id;
  });

  test.afterAll(async () => {
    if (userId !== null) {
      await fetch(`${API_BASE}/api/v1/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (tenantId !== null) await deleteTenant(token, tenantId);
  });

  test('tenant_admin: standalone → no MailRoutingShell (TC-O04)', async ({ page }) => {
    test.skip(!multiTenant, 'multi-tenant denial is a multi-tenant-form concern (single-tenant covered above)');

    // Log in as the tenant_admin (NOT the default admin).
    await page.goto('/zh/login');
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Direct navigation to the standalone mail-routing entry must NOT render the
    // shell. In multi-tenant the page denies (isTenantAdmin guard) and/or
    // redirects to the tenant center — either way the 4 tabs never appear.
    await page.goto('/zh/mail-routing');
    for (const label of Object.values(TABS)) {
      await expect(page.getByRole('tab', { name: label })).toHaveCount(0);
    }
  });
});
