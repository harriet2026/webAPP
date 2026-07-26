import { test, expect } from '../fixtures/auth.fixture';
import { TenantsPage } from '../pages/tenants.page';

/**
 * GT-12019 — 租户中心 > 租户管理 的"接入状态"列永远显示"待接入".
 *
 * The badge itself was always correct (`configured` -> green 已接入). The bug
 * was on the wire: GET /tenants returned the tenant exactly as storage scanned
 * it, and storage derives access_status from the tenants.routing_progress
 * column — a denormalized cache that no code path has ever written, so it is
 * permanently the all-false schema default. Every tenant therefore reported
 * access_status="pending" no matter how completely it was provisioned.
 *
 * This spec provisions a tenant to all four routing dimensions through the
 * public API, then asserts the browser renders 已接入 for that row.
 */
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:18080';

async function adminToken(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!r.ok) throw new Error(`admin login failed: ${r.status}`);
  return (await r.json()).token;
}

async function api(token: string, path: string, init?: RequestInit) {
  return fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

test.describe('GT-12019 tenant access status', () => {
  const suffix = Date.now().toString(36);
  const code = `gt12019${suffix}`;
  const name = `gt12019_access_${suffix}`;
  let tenantId: number | null = null;
  // A deliberately un-provisioned tenant. It anchors the negative side of the
  // assertion: without it a regression that rendered EVERY row as 已接入 would
  // still pass the positive test.
  const bareCode = `gt12019bare${suffix}`;
  let bareTenantId: number | null = null;

  test.beforeAll(async () => {
    const token = await adminToken();

    // 1. tenant + domain (receiving needs an active, VERIFIED domain).
    const created = await api(token, '/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name,
        code,
        domains: [
          {
            domain: `${code}.test.local`,
            next_hop_type: 'domain',
            next_hop_host: 'smtpsink',
            next_hop_port: 25,
          },
        ],
      }),
    });
    expect(created.status, 'create tenant').toBe(201);
    const body = await created.json();
    tenantId = body.tenant.id as number;

    const domainsResp = await api(token, `/tenants/${tenantId}/domains`, {
      headers: { 'X-Tenant-ID': String(tenantId) },
    });
    const domainId = (await domainsResp.json()).items[0].id as number;

    // The dev stack runs a SaaS-ish form where new domains start `pending`;
    // manual verify is the platform-admin fallback (spec 2.5).
    const verified = await api(
      token,
      `/tenants/${tenantId}/domains/${domainId}/verify/manual`,
      {
        method: 'POST',
        // X-Tenant-ID is mandatory: the handler resolves the managed tenant
        // from it and 400s ("tenant_id required") without it.
        headers: { 'X-Tenant-ID': String(tenantId) },
        body: JSON.stringify({}),
      },
    );
    expect(verified.status, 'manual verify domain').toBe(200);

    // 2. relay: egress binding whose name is in the cluster egress pool.
    const poolResp = await api(token, '/routing/_meta/egress-ips');
    const egressName = (await poolResp.json()).items[0] as string;
    expect(egressName, 'dev egress pool must be non-empty').toBeTruthy();
    const bind = await api(token, `/tenants/${tenantId}/egress-bindings`, {
      method: 'POST',
      body: JSON.stringify({ tenant_domain_id: domainId, egress_name: egressName }),
    });
    expect(bind.status, 'create egress binding').toBe(201);

    // 3. outbound + auth: an active SMTP credential satisfies both.
    const cred = await api(token, '/smtp-credentials', {
      method: 'POST',
      headers: { 'X-Tenant-ID': String(tenantId) },
      body: JSON.stringify({
        username: `${code}@${code}.test.local`,
        password: 'Gt12019Pass!',
        tenant_id: tenantId,
        auth_backend: 'local',
      }),
    });
    expect([200, 201]).toContain(cred.status);

    const bare = await api(token, '/tenants', {
      method: 'POST',
      body: JSON.stringify({ name: `gt12019_bare_${suffix}`, code: bareCode }),
    });
    expect(bare.status, 'create bare tenant').toBe(201);
    bareTenantId = (await bare.json()).tenant.id as number;

    // Guard: the API must now consider the tenant fully configured. If this
    // fails the UI assertion below would be meaningless.
    const listResp = await api(token, `/tenants?search=${code}`);
    const row = (await listResp.json()).items.find(
      (t: { code: string }) => t.code === code,
    );
    expect(row, 'tenant present in list API').toBeTruthy();
    expect(row.access_status, 'API access_status').toBe('configured');
  });

  test.afterAll(async () => {
    try {
      const token = await adminToken();
      for (const id of [tenantId, bareTenantId]) {
        if (id !== null) await api(token, `/tenants/${id}`, { method: 'DELETE' });
      }
    } catch {
      // best-effort cleanup
    }
  });

  test('fully provisioned tenant renders 已接入, not 待接入', async ({
    authenticatedPage,
  }) => {
    const page = new TenantsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    // The search box only commits on Enter (or the search button click) —
    // filling alone leaves the list unfiltered.
    await page.searchInput.fill(code);
    await page.searchInput.press('Enter');
    const row = authenticatedPage.locator('table tbody tr', { hasText: code });
    await expect(row).toHaveCount(1, { timeout: 15000 });

    await expect(row).toContainText('已接入');
    await expect(row).not.toContainText('待接入');
  });

  test('un-provisioned tenant still renders 待接入', async ({ authenticatedPage }) => {
    const page = new TenantsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    await page.searchInput.fill(bareCode);
    await page.searchInput.press('Enter');

    const row = authenticatedPage.locator('table tbody tr', { hasText: bareCode });
    await expect(row).toHaveCount(1, { timeout: 15000 });

    await expect(row).toContainText('待接入');
    await expect(row).not.toContainText('已接入');
  });
});
