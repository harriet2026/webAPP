import { test, expect } from '../fixtures/auth.fixture';
import { TenantRoutingPage } from '../pages/tenant-routing.page';
import { uniqueSuffixAlnum } from '../helpers/test-data';

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

async function createTenant(token: string, name: string, code: string): Promise<number> {
  const r = await fetch(`${API_BASE}/api/v1/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, code }),
  });
  if (!r.ok) throw new Error(`create tenant failed: ${r.status} ${await r.text()}`);
  // Response shape: { domain_errors: [], tenant: { id, ... } }.
  const body = await r.json();
  return body.tenant.id as number;
}

async function createDomain(token: string, tenantId: number, domain: string): Promise<number> {
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
  if (!r.ok) throw new Error(`create domain failed: ${r.status} ${await r.text()}`);
  const body = await r.json();
  return body.id as number;
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

// i18n label for the MailRoutingShell receiving tab (mailRouting.tabs.receiving
// in messages/zh.json). The drill-down now renders MailRoutingShell (unified
// with the standalone /mail-routing page), so the tab labels are the
// mailRouting.* ones, not the legacy tenants.routing.tabs.* labels.
const RECEIVING_TAB = '收信域管理';

/**
 * Spec 2B — Tenant Routing UI (Task 8). Serial; covers the routing overview
 * table (search, progress + access columns) and the drill-down integration
 * smoke (opens the per-tenant detail, which now renders MailRoutingShell).
 *
 * The 4 mail-routing tabs' CRUD inside the drill-down is exercised end-to-end
 * by specs/mail-routing.spec.ts ("Mail Routing UI (multi-tenant drilldown)"),
 * which reuses the same page object. Setup (tenant + a verified domain) runs
 * in beforeAll via the API — dev auto-verifies domains — and is torn down in
 * afterAll. Each run uses a unique tenant name+code so concurrent/re-runs
 * never collide on the unique `code` index.
 */
test.describe.serial('Tenant Routing UI (Spec 2B)', () => {
  const suffix = uniqueSuffixAlnum();
  const tenantName = `e2e_routing_${suffix}`;
  const tenantCode = `e2e${suffix.toLowerCase()}`;
  const domain = `mx-${suffix}.example.com`;

  let tenantId: number | null = null;
  let token: string;

  test.beforeAll(async () => {
    token = await adminToken();
    tenantId = await createTenant(token, tenantName, tenantCode);
    await createDomain(token, tenantId, domain);
  });

  test.afterAll(async () => {
    if (tenantId === null) return;
    try {
      await deleteTenant(token, tenantId);
    } catch (err) {
      console.warn('afterAll: cleanup failed', err);
    }
  });

  test('routing tab is visible, enabled, and shows the overview table', async ({
    authenticatedPage,
  }) => {
    const page = new TenantRoutingPage(authenticatedPage);
    await page.goto();

    await expect(page.routingTabTrigger).toBeVisible();
    await expect(page.routingTabTrigger).toBeEnabled();

    await page.openRoutingTab();
    await expect(page.overviewTable).toBeVisible();
    await expect(page.overviewTable.locator('thead tr')).toBeVisible();
  });

  test('overview lists the tenant with progress + access status', async ({ authenticatedPage }) => {
    const page = new TenantRoutingPage(authenticatedPage);
    await page.goto();
    await page.openRoutingTab();
    await page.searchTenant(tenantName);

    const row = page.overviewRow(tenantName);
    await expect(row).toBeVisible({ timeout: 15000 });
    // code is rendered under the name.
    await expect(row).toContainText(tenantCode);
    // Progress hint "{done}/{total}" (e.g. "0/4") is rendered next to the dots.
    await expect(row).toContainText(/\d+\/4/);
    // Access status column shows one of the access.* badge labels
    // (zh.json tenants.access: pending=待接入 / configured=已接入)。
    // GT-12019 (79548fc808) 把 "待接流" 改名为 "待接入"，本断言当时漏改。
    await expect(row).toContainText(/待接入|已接入/);
  });

  test('drilldown opens into MailRoutingShell (receiving tab visible)', async ({
    authenticatedPage,
  }) => {
    const page = new TenantRoutingPage(authenticatedPage);
    await page.goto();
    await page.openRoutingTab();
    await page.searchTenant(tenantName);

    await page.openDrilldown(tenantName);

    // Tenant context header.
    await expect(authenticatedPage.getByText(tenantName, { exact: true }).first()).toBeVisible();
    await expect(authenticatedPage.getByText(tenantCode)).toBeVisible();

    // The drill-down now renders MailRoutingShell; its first tab (收信域管理) is
    // present. Full per-tab CRUD is covered by specs/mail-routing.spec.ts.
    await expect(authenticatedPage.getByRole('tab', { name: RECEIVING_TAB })).toBeVisible();
  });
});
