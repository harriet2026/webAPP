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

/**
 * Review finding 1 fix (relay-tab.tsx): saving a relay grant now requires the
 * 发信域名 to resolve to a VERIFIED tenant domain (relay-tab.tsx's
 * domainVerifyErr gate). The dev stack runs OSG_PRODUCT_FORM=cloud (SaaS),
 * where applyVerifyDefaults() leaves a freshly created domain 'pending' (only
 * a non-SaaS form auto-verifies on create) — so the relay e2e tests must
 * explicitly manual-verify the seeded domain via the platform-admin fallback
 * endpoint (internal/api/domain_verify.go VerifyDomainManual) before it can
 * be used as a relay grant's fromDomain.
 */
async function verifyDomainManual(token: string, tenantId: number, domainId: number | null): Promise<void> {
  if (domainId === null) return;
  const r = await fetch(`${API_BASE}/api/v1/tenants/${tenantId}/domains/${domainId}/verify/manual`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
  });
  if (!r.ok) {
    console.warn(`manual verify domain failed: ${r.status} ${await r.text()}`);
  }
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

/**
 * Relay-grant rows no longer show the rule name in the table (html_spec
 * §9-D2 — the 8-column table has no name column), so tests resolve the
 * numeric grant id via the API by matching `note` (== the drawer's 规则名称
 * field, a plain writable column that round-trips reliably — unlike
 * sender_domain, see relay-mapping.ts's top-of-file comment).
 */
async function findMailAdmissionRuleId(token: string, tenantId: number, note: string): Promise<number | null> {
  const r = await fetch(`${API_BASE}/api/v1/mail-admission-rules`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
  });
  if (!r.ok) return null;
  const items = ((await r.json()) as { items?: Array<{ id: number; note: string }> }).items ?? [];
  return items.find((g) => g.note === note)?.id ?? null;
}

/** proxysvr-endpoints is a GLOBAL resource (no tenant scoping, see
 * internal/api/proxysvr.go — CreateProxysvrEndpoint never reads X-Tenant-ID).
 * Proxy endpoints are optional for default-channel SMTP routes; tests create
 * one only when they explicitly exercise a proxysvr group. */
async function createProxysvrEndpoint(token: string, name: string, host: string, lid: string): Promise<number> {
  const r = await fetch(`${API_BASE}/api/v1/proxysvr-endpoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, host, port: 6620, lid }),
  });
  if (!r.ok) throw new Error(`create proxysvr endpoint failed: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { id: number }).id;
}

async function deleteProxysvrEndpoint(token: string, id: number | null) {
  if (id === null) return;
  const r = await fetch(`${API_BASE}/api/v1/proxysvr-endpoints/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404) {
    console.warn(`cleanup: delete proxysvr endpoint ${id} -> ${r.status}`);
  }
}

async function createProxysvrGroup(
  token: string,
  name: string,
  members: Array<{ endpoint_id: number; ord: number }> = [],
): Promise<number> {
  // A group needs only a name to be active (is_active defaults true); members
  // are optional and ListActiveProxysvrGroups filters on is_active alone.
  const r = await fetch(`${API_BASE}/api/v1/proxysvr-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, members }),
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

  // mail-admission-rules (Task 4 single-table redesign — no longer unified-rules), by note.
  try {
    const r = await fetch(`${API_BASE}/api/v1/mail-admission-rules`, { headers });
    if (r.ok) {
      const items = ((await r.json()) as { items?: Array<{ id: number; note: string }> }).items ?? [];
      for (const g of items) {
        if (g.note.includes(suffix)) {
          await fetch(`${API_BASE}/api/v1/mail-admission-rules/${g.id}`, { method: 'DELETE', headers });
        }
      }
    }
  } catch (e) {
    console.warn('sweep mail-admission-rules failed', e);
  }

  // unified-rules: outbound (route/data) page, by name.
  const ruleQueries = [{ rule_class: 'route', stage: 'data', page: 'mail_routing_outbound' }];
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
  // A dedicated domain for the relay tests below — deliberately NOT `domain`,
  // which the `receiving:` test in this same serial block edits and then
  // deletes mid-suite. Sharing it would make the relay tests' verified-domain
  // gate (review finding 1) depend on file-order luck relative to that
  // unrelated test.
  const relayDomain = `mx-relay-${suffix}.example.com`;
  // Task 8: the auth drawer's 适用域名 field is a multi-select Popover sourced
  // from the tenant's verified domains (no more free-text domain input), so
  // the auth tests need their own dedicated, manually-verified domain —
  // separate from `domain`/`relayDomain` for the same file-order-independence
  // reason as relayDomain's comment above.
  const authDomain = `mx-auth-${suffix}.example.com`;

  let token = '';
  let tenantId: number | null = null;
  let domainId: number | null = null;
  let relayDomainId: number | null = null;
  let authDomainId: number | null = null;
  let multiTenant = false;

  test.beforeAll(async () => {
    token = await adminToken();
    tenantId = await firstTenantId(token);
    if (tenantId === null) return;
    multiTenant = await isMultiTenantForm(token);
    // Only seed a receiving domain when the standalone page is reachable.
    if (!multiTenant) {
      domainId = await createDomain(token, tenantId, domain);
      // relay: create/spam-filter/SPF tests below need a verified
      // fromDomain (review finding 1's domain-verification gate) that
      // outlives the `receiving:` test's delete of `domain`.
      relayDomainId = await createDomain(token, tenantId, relayDomain);
      await verifyDomainManual(token, tenantId, relayDomainId);
      // auth: the domain-picker Popover only lists verified domains.
      authDomainId = await createDomain(token, tenantId, authDomain);
      await verifyDomainManual(token, tenantId, authDomainId);
    }
  });

  test.afterAll(async () => {
    if (tenantId === null) return;
    try {
      await sweepStragglers(token, tenantId, suffix);
      await deleteDomain(token, tenantId, domainId);
      await deleteDomain(token, tenantId, relayDomainId);
      await deleteDomain(token, tenantId, authDomainId);
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

  test('receiving: probe + target-address create/edit/delete', async ({ authenticatedPage }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.receiving);

    const row = mp.domainRow(domain);
    await expect(row).toBeVisible({ timeout: 15000 });

    // Probe (no target addresses yet → the API returns immediately; toast 探测完成).
    await mp.probeDomainRow(domain);
    await waitForToast(authenticatedPage);

    // Edit: add a target address + shared port via the drawer's TagInput
    // (html_spec table form — nexthops are no longer edited standalone,
    // DEV-4: type/priority/per-hop active are derived, not exposed).
    const host = `nh-${suffix}.example.com`;
    await mp.openEditDomain(domain);
    await mp.fillReceivingDrawer({ hosts: [host], port: '2525' });
    await mp.saveReceivingDrawer();
    await waitForToast(authenticatedPage);
    await expect(row).toContainText(host);
    await expect(row).toContainText('2525');

    // Edit again: replace the target address (remove the old tag, add a new one).
    const host2 = `nh2-${suffix}.example.com`;
    await mp.openEditDomain(domain);
    await mp.receivingDrawer.getByRole('button', { name: `移除 ${host}` }).click();
    await mp.fillReceivingDrawer({ hosts: [host2] });
    await mp.saveReceivingDrawer();
    await waitForToast(authenticatedPage);
    await expect(row).toContainText(host2);
    await expect(row).not.toContainText(host);

    // Delete the whole domain (「强制删除」) and confirm it is gone.
    await mp.deleteDomainRow(domain);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.domainRowCount(domain), { timeout: 15000 }).toBe(0);
  });

  test('relay: create (CIDR + spam filter), disable via drawer, delete', async ({ authenticatedPage }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.relay);

    // 断言围绕真实可用面：CIDR、垃圾邮件过滤、启停、删除都是 mail-admission-rules API 的
    // 原生字段，全部经真实后端往返（task-4-brief 行为契约）。
    //
    // fromDomain 必须填一个已验证的租户域名（review finding 1 修复后的强约束）：
    // `domain`（beforeAll 用 createDomain 建的收信域）在 OSG_PRODUCT_FORM=cloud
    // 下默认是 pending，beforeAll 已额外调用 verifyDomainManual 显式转为
    // verified，可以直接复用。
    //
    // 域名一旦命中已验证租户域名，relay-tab.tsx 推导 privileged=false（不再是
    // 修复前那种「域名不匹配→隐式 privileged=true」的路径），CIDR 因而要真正过
    // 后端的可信中继池 + 最小前缀校验（min_prefix_len_v4 默认 24，见
    // internal/api/relay_policy_settings.go），/8 太宽会被 400 拒绝——改用池内
    // 的 /24。
    const name = `relay-${suffix}`;
    await mp.openCreateRelay();
    await mp.fillRelayDrawer({ ruleName: name, sourceIp: '10.0.1.0/24', fromDomain: relayDomain, spamFilter: true });
    await mp.saveRelayDrawer();
    await waitForToast(authenticatedPage);

    const id = await findMailAdmissionRuleId(token, tenantId!, name);
    expect(id, `relay grant ${name} not found`).not.toBeNull();
    const row = mp.relayRow(id!);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText('10.0.1.0/24');
    await expect(row).toContainText('过滤');

    // html_spec §2.4 层级 0: the table's 操作列 has 模拟测试/编辑/删除 only — no
    // separate enable/disable row button (unlike the retired unified-rules
    // form). 启停 goes through the drawer's Switch, matching demo exactly.
    await mp.openEditRelay(id!);
    await mp.fillRelayDrawer({ active: false });
    await mp.saveRelayDrawer();
    await waitForToast(authenticatedPage);
    await expect(row).toContainText('禁用');

    // Delete.
    await mp.deleteRelayRow(id!);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.relayRowCount(id!), { timeout: 15000 }).toBe(0);
  });

  test('relay: SPF checkbox requires a sender domain before saving (client-side gate)', async ({
    authenticatedPage,
  }) => {
    // Moved from the retired relay-grant-spf-toggle.spec.ts (SPF/grants-card
    // suite, deleted in Task 4 — the grants-card's advanced SPF/privileged UI
    // no longer exists, A7). This asserts the single-table drawer's required-
    // field linkage only: real-mode persistence of 发信域名 (a free-text field
    // with no domain picker) is a known limitation, see relay-mapping.ts.
    //
    // Review finding 1 fix: a pristine draft (empty 发信域名, SPF unchecked)
    // already shows the "must be a verified tenant domain" inline error before
    // SPF is even touched (tenantDomainId===null blocks save regardless of the
    // SPF path — see relay-tab.tsx). This test now types the already-verified
    // `domain` fixture (not an arbitrary string like the old 'partner.com')
    // so the assertion that the error clears actually proves the domain-
    // verification gate, not just the (weaker) non-empty check.
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.relay);

    await mp.openCreateRelay();
    await expect(mp.relayDrawer.getByTestId('mr-relay-from-domain-error')).toBeVisible();
    await mp.fillRelayDrawer({ ruleName: `relay-spf-${suffix}` });
    await mp.relayDrawer.getByTestId('mr-relay-spf-checkbox').click();
    await expect(mp.relayDrawer.getByTestId('mr-relay-from-domain-error')).toHaveText(
      '启用 SPF 认证时发信域名必填'
    );

    // Saving while the required-hint is showing must not close the drawer
    // (client-side validation gate — mirrors handleSave's hasError check).
    await mp.relayDrawer.getByTestId('mr-relay-save').click();
    await expect(mp.relayDrawer).toBeVisible();

    await mp.relayDrawer.getByTestId('mr-relay-from-domain-input').fill(relayDomain);
    await expect(mp.relayDrawer.getByTestId('mr-relay-from-domain-error')).toHaveCount(0);

    await mp.cancelRelayDrawer();
  });

  test('outbound: wizard step bar + step-3 create SMTP route, delete', async ({ authenticatedPage }) => {
    // Task 7 introduced the 3-step wizard (代理 IP / 投递通道 / 路由规则设置);
    // Task 13 wired steps 1-2 to the real proxysvr-endpoints/proxysvr-groups
    // API (retiring the old A9 mock-only BackendPendingPanel placeholder), so
    // this test now asserts step 1 renders real ProxyStep content and drives
    // the functional step 3.
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.outbound);

    // Step-bar shell present; step 1 (代理 IP) is the default and is now the
    // real ProxyStep (mr-ob-proxy-root, backed by GET /proxysvr-endpoints).
    // Proxy/custom-channel setup is optional, so the default-channel route
    // section is directly reachable even when no endpoint has been configured.
    await expect(authenticatedPage.getByTestId('mr-ob-step-bar')).toBeVisible();
    await expect(authenticatedPage.getByTestId('mr-ob-proxy-root')).toBeVisible();
    await expect(authenticatedPage.getByTestId('mr-ob-step-2')).toBeEnabled();
    await expect(authenticatedPage.getByTestId('mr-ob-step-3')).toBeEnabled();

    await mp.openOutboundRuleStep();
    await expect(authenticatedPage.getByTestId('mr-ob-rule-root')).toBeVisible();

    const name = `out-${suffix}`;
    const hop = `smtp-${suffix}.example.com`;
    await mp.openCreateOutboundRule();
    await mp.fillOutboundRule({
      name,
      // channel≠proxysvr 时目的地址是真实后端硬约束（next_hop_host 必填），且发信
      // 域名条件避免真正的"零条件"树被 400（见 fillOutboundRule 文档注释）。
      fromDomain: `${suffix}.example.com`,
      targetHost: hop,
      targetPort: '25',
    });
    await mp.saveOutboundRuleDrawer();
    await waitForToast(authenticatedPage);

    const row = mp.outboundRuleRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });
    // The list has no 目的地址 column (html_spec 9-column layout) — round-trip
    // the next-hop host via the edit drawer's 目的地址 input instead.
    await mp.openEditOutboundRule(name);
    await expect(mp.outboundRuleDrawer.getByTestId('mr-ob-rule-target-host-input')).toHaveValue(hop);
    await mp.cancelOutboundRuleDrawer();

    await mp.deleteOutboundRule(name);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.outboundRuleRowCount(name), { timeout: 15000 }).toBe(0);
  });

  test('auth: create config, test connection, delete', async ({ authenticatedPage }) => {
    // The Test Connection dial may take up to auth_timeout; bound it + the test.
    test.setTimeout(90000);

    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.auth);

    await mp.openAddAuth();
    // SMTP avoids the LDAP-only required Bind DN field (Task 8 DEV-2 protocol
    // param block) — keep this test focused on the domain/host/timeout/scene
    // round-trip, not protocol-specific params (covered by the unit tests).
    await mp.selectAuthProtocol('SMTP');
    await mp.fillAuth({
      // Loopback so Test Connection fails fast (connection refused) rather than
      // hanging on DNS; either success/failure satisfies the result assertion.
      serverHost: '127.0.0.1',
      domain: authDomain,
      authTimeout: '3',
    });
    // 生效场景 has no default any more (Task 8: new-config starts with 0 scenes
    // and a red "请至少选择一个生效场景" error) — must explicitly check one.
    await mp.checkAuthScene('smtpsend');
    await mp.saveAuthDrawer();
    await waitForToast(authenticatedPage);

    const row = mp.authRow(authDomain);
    await expect(row).toBeVisible({ timeout: 15000 });

    // Test Connection → a result (成功 or 失败) must render.
    await mp.openTestConnection(authDomain);
    await mp.runTest();
    await expect(mp.dialog.getByText(/连接成功|连接失败/)).toBeVisible({ timeout: 20000 });
    await mp.closeDialog();

    // Delete.
    await mp.deleteAuth(authDomain);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.authRowCount(authDomain), { timeout: 15000 }).toBe(0);
  });

  test('auth: protocol + TLS-mode switch auto-fills the default port (TC-B05)', async ({ authenticatedPage }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.auth);

    await mp.openAddAuth();
    // New-config defaults: LDAP + 优先 TLS (prefer) → port 636 (auth-tls-mode.ts
    // defaultPort, layer-8a 实测).
    await expect(mp.authServerPortInput()).toHaveValue('636', { timeout: 5000 });

    // Switching the protocol must recompute the port for the CURRENT TLS mode
    // (prefer → each protocol's ssl port).
    for (const [proto, port] of [
      ['SMTP', '465'],
      ['POP3', '995'],
      ['IMAP', '993'],
      ['LDAP', '636'],
    ] as const) {
      await mp.selectAuthProtocol(proto);
      await expect(mp.authServerPortInput()).toHaveValue(port);
    }

    // Switching the TLS mode (三档) must recompute the port for the CURRENT
    // protocol (LDAP here): off → standard port; prefer/force → ssl port.
    await mp.selectAuthTlsMode('关闭');
    await expect(mp.authServerPortInput()).toHaveValue('389');
    await mp.selectAuthTlsMode('强制 TLS');
    await expect(mp.authServerPortInput()).toHaveValue('636');
    await mp.selectAuthTlsMode('优先 TLS');
    await expect(mp.authServerPortInput()).toHaveValue('636');

    // Cancel — no row is created.
    await mp.cancelAuthDrawer();
  });

  test('auth: invalid port/timeout and empty scenes block save (TC-B06 field validation)', async ({
    authenticatedPage,
  }) => {
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.auth);

    await mp.openAddAuth();
    // SMTP avoids the LDAP-only Bind DN required field so the assertions below
    // stay scoped to exactly the three fields TC-B06 targets.
    await mp.selectAuthProtocol('SMTP');
    await mp.selectAuthDomain(authDomain);
    await mp.authDrawer.getByTestId('mr-auth-host-input').fill('127.0.0.1');
    // Illegal port (outside 1-65535) and illegal timeout (outside 1-300);
    // 生效场景 is left unchecked (its own required error). All three must
    // block save with their exact demo-copy red errors.
    await mp.authServerPortInput().fill('99999');
    await mp.authDrawer.getByTestId('mr-auth-timeout-input').fill('500');

    // Click 保存 directly: validation must keep the drawer OPEN and surface the
    // three errors, so the drawer stays visible and no row is created.
    await mp.authDrawer.getByTestId('mr-auth-save').click();
    await expect(mp.authDrawer).toBeVisible();
    await expect(mp.authDrawer.getByTestId('mr-auth-port-error')).toHaveText('端口范围 1-65535');
    await expect(mp.authDrawer.getByTestId('mr-auth-timeout-error')).toHaveText('超时范围 1-300 秒');
    await expect(mp.authDrawer.getByTestId('mr-auth-scenes-error')).toHaveText('请至少选择一个生效场景');
    await expect.poll(async () => mp.authRowCount(authDomain), { timeout: 5000 }).toBe(0);

    await mp.cancelAuthDrawer();
  });

  test('relay: spam filter (!skip_antispam) round-trips through the real mail-admission-rules API', async ({
    authenticatedPage,
  }) => {
    // Task 4 single-table redesign: relay data now lives on mail-admission-rules
    // (client_cidr/use_spf/skip_antispam/is_active/note), not unified-rules
    // metadata. relay-mapping.ts's spamFilter = !skip_antispam.
    const mp = await openRouting(authenticatedPage);
    await mp.openTab(TABS.relay);

    // fromDomain 必须命中已验证租户域名（review finding 1）；命中后 privileged=
    // false，CIDR 因而要落在可信中继池内且满足最小前缀（见上一个用例同款注释）。
    const name = `relay-skip-${suffix}`;
    await mp.openCreateRelay();
    await mp.fillRelayDrawer({ ruleName: name, sourceIp: '10.0.1.0/24', fromDomain: relayDomain, spamFilter: true });
    await mp.saveRelayDrawer();
    await waitForToast(authenticatedPage);

    const id = await findMailAdmissionRuleId(token, tenantId!, name);
    expect(id, `relay grant ${name} not found`).not.toBeNull();
    const row = mp.relayRow(id!);
    await expect(row).toBeVisible({ timeout: 15000 });

    // The table cell renders 过滤/不过滤 (relay-mapping.ts grantToRow). Asserting
    // 过滤 proves the toggle reached the API and was persisted on the grant
    // (not just local form state).
    await expect(row).toContainText('过滤', { timeout: 5000 });

    // Cross-check via the API: skip_antispam === false (spamFilter=true -> !skip_antispam).
    const listed = await authenticatedPage.request.get(`${API_BASE}/api/v1/mail-admission-rules`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
    });
    expect(listed.ok()).toBeTruthy();
    const items = (await listed.json()).items ?? [];
    const created = items.find((g: { id: number }) => g.id === id);
    expect(created, `relay grant ${name} not found in list`).toBeTruthy();
    expect(created.skip_antispam).toBe(false);
    expect(created.client_cidr).toBe('10.0.1.0/24');

    // Cleanup.
    await mp.deleteRelayRow(id!);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.relayRowCount(id!), { timeout: 15000 }).toBe(0);
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
  // Dedicated domain for the relay test — NOT `domain`, which the
  // `receiving:` test below edits and then deletes mid-suite (same reasoning
  // as the standalone describe above).
  const relayDomain = `mx-relay-${suffix}.example.com`;
  // Task 8: the auth drawer's 适用域名 field is a multi-select Popover sourced
  // from the tenant's verified domains — dedicated domain, same reasoning as
  // relayDomain's comment above.
  const authDomain = `mx-auth-${suffix}.example.com`;

  let token = '';
  let tenantId: number | null = null;
  let domainId: number | null = null;
  let relayDomainId: number | null = null;
  let authDomainId: number | null = null;
  let proxysvrEndpointId: number | null = null;
  let proxysvrGroupId: number | null = null;
  const proxysvrGroupName = `pxg-${suffix}`;
  let multiTenant = false;

  test.beforeAll(async () => {
    token = await adminToken();
    multiTenant = await isMultiTenantForm(token);
    if (!multiTenant) return;
    tenantId = await createTenant(token, tenantName, tenantCode);
    domainId = await createDomain(token, tenantId, domain);
    // relay: create/delete via drilldown needs a verified fromDomain (review
    // finding 1's domain-verification gate) that outlives the `receiving:`
    // test's delete of `domain`.
    relayDomainId = await createDomain(token, tenantId, relayDomain);
    await verifyDomainManual(token, tenantId, relayDomainId);
    // auth: the domain-picker Popover only lists verified domains.
    authDomainId = await createDomain(token, tenantId, authDomain);
    await verifyDomainManual(token, tenantId, authDomainId);
    // outbound: proxysvr-endpoints is global (see createProxysvrEndpoint's doc
    // comment above). Fold the endpoint into the group as its one member so the TC-B03
    // channel=proxysvr test exercises a realistic (non-empty) channel too.
    proxysvrEndpointId = await createProxysvrEndpoint(token, `pxe-${suffix}`, '10.9.0.2', `lid-${suffix}`);
    proxysvrGroupId = await createProxysvrGroup(token, proxysvrGroupName, [{ endpoint_id: proxysvrEndpointId, ord: 0 }]);
  });

  test.afterAll(async () => {
    if (tenantId === null) return;
    try {
      // Sweep route rules first so the proxysvr group is no longer referenced
      // (the delete guard would otherwise 409), then drop the group + tenant.
      await sweepStragglers(token, tenantId, suffix);
      await deleteProxysvrGroup(token, proxysvrGroupId);
      await deleteProxysvrEndpoint(token, proxysvrEndpointId);
      await deleteDomain(token, tenantId, domainId);
      await deleteDomain(token, tenantId, relayDomainId);
      await deleteDomain(token, tenantId, authDomainId);
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

  test('receiving: target-address create + domain delete via drilldown', async ({ authenticatedPage }) => {
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.receiving);

    const row = mp.domainRow(domain);
    await expect(row).toBeVisible({ timeout: 15000 });

    const host = `nh-${suffix}.example.com`;
    await mp.openEditDomain(domain);
    await mp.fillReceivingDrawer({ hosts: [host], port: '2525' });
    await mp.saveReceivingDrawer();
    await waitForToast(authenticatedPage);

    await expect(row).toContainText(host);
    await expect(row).toContainText('2525');

    // Delete the whole domain (「强制删除」) and confirm it is gone.
    await mp.deleteDomainRow(domain);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.domainRowCount(domain), { timeout: 15000 }).toBe(0);
  });

  test('relay: create/delete via drilldown', async ({ authenticatedPage }) => {
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.relay);

    // fromDomain 命中已验证租户域名 → privileged=false → CIDR 要落在可信中继池
    // 内且满足最小前缀（review finding 1，见标准套件同名用例的详细注释）。
    const name = `relay-${suffix}`;
    await mp.openCreateRelay();
    await mp.fillRelayDrawer({ ruleName: name, sourceIp: '10.0.1.0/24', fromDomain: relayDomain });
    await mp.saveRelayDrawer();
    await waitForToast(authenticatedPage);

    const id = await findMailAdmissionRuleId(token, tenantId!, name);
    expect(id, `relay grant ${name} not found`).not.toBeNull();
    const row = mp.relayRow(id!);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText('10.0.1.0/24');

    await mp.deleteRelayRow(id!);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.relayRowCount(id!), { timeout: 15000 }).toBe(0);
  });

  test('outbound: wizard step-3 create/delete route rule via drilldown', async ({ authenticatedPage }) => {
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.outbound);
    await mp.openOutboundRuleStep();

    const name = `out-${suffix}`;
    const hop = `smtp-${suffix}.example.com`;
    await mp.openCreateOutboundRule();
    await mp.fillOutboundRule({
      name,
      fromDomain: `${suffix}.example.com`,
      targetHost: hop,
      targetPort: '25',
    });
    await mp.saveOutboundRuleDrawer();
    await waitForToast(authenticatedPage);

    const row = mp.outboundRuleRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });
    await mp.openEditOutboundRule(name);
    await expect(mp.outboundRuleDrawer.getByTestId('mr-ob-rule-target-host-input')).toHaveValue(hop);
    await mp.cancelOutboundRuleDrawer();

    await mp.deleteOutboundRule(name);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.outboundRuleRowCount(name), { timeout: 15000 }).toBe(0);
  });

  test('outbound: create route via proxysvr channel (TC-B03, DEV-8 real-mode channel dropdown)', async ({
    authenticatedPage,
  }) => {
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.outbound);
    await mp.openOutboundRuleStep();

    const name = `outpx-${suffix}`;
    await mp.openCreateOutboundRule();
    await mp.fillOutboundRule({ name, fromDomain: `${suffix}.example.com` });
    // Switch the delivery channel to a proxysvr group (the TC-B03 path: route
    // rule selects a proxysvr group rather than an SMTP next-hop). Real mode's
    // 投递通道 select lists active proxysvr groups by name (DEV-8) — targetHost
    // is not required on this path (channel=proxysvr, see rule-mapping.ts).
    await mp.selectOutboundRuleProxysvrChannel(proxysvrGroupName);
    await mp.saveOutboundRuleDrawer();
    await waitForToast(authenticatedPage);

    const row = mp.outboundRuleRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });
    // 投递通道 column renders the proxysvr group's name directly for channel=proxysvr.
    await expect(row).toContainText(proxysvrGroupName);

    await mp.deleteOutboundRule(name);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.outboundRuleRowCount(name), { timeout: 15000 }).toBe(0);
  });

  test('auth: create/delete mail-auth config via drilldown', async ({ authenticatedPage }) => {
    test.setTimeout(90000);
    const mp = await openDrilldown(authenticatedPage);
    await mp.openTab(TABS.auth);

    await mp.openAddAuth();
    await mp.selectAuthProtocol('SMTP');
    await mp.fillAuth({
      serverHost: '127.0.0.1',
      domain: authDomain,
      authTimeout: '3',
    });
    await mp.checkAuthScene('smtpsend');
    await mp.saveAuthDrawer();
    await waitForToast(authenticatedPage);

    const row = mp.authRow(authDomain);
    await expect(row).toBeVisible({ timeout: 15000 });

    await mp.deleteAuth(authDomain);
    await waitForToast(authenticatedPage);
    await expect.poll(async () => mp.authRowCount(authDomain), { timeout: 15000 }).toBe(0);
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
