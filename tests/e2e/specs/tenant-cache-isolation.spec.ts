import { test, expect, type Page } from '@playwright/test';
import { uniqueSuffix } from '../helpers/test-data';
import { resolveTenantRoleID } from '../helpers/roles';

/**
 * GT-12080 — cross-tenant data leak through the client-side React Query cache.
 *
 * The API is correctly tenant-scoped: tenant B's GET /unified-rules never
 * returns tenant A's rows. The leak is purely client-side — the QueryClient is
 * created once at the root provider and survives logout (logout is a
 * router.push, not a document load), while every rule query key
 * (e.g. ['sender-filter-rules']) is identity-free. So the next admin to log in
 * on the same tab reads the previous admin's cached rows, and with the global
 * staleTime of 60s React Query does not even refetch.
 *
 * This spec drives the reported flow verbatim, so it must navigate INSIDE the
 * SPA after the first load: a page.goto() would tear down the QueryClient and
 * hide the very bug under test.
 */

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:18080';
const INITIAL_PW = 'Passw0rd!123';
const PW = 'Passw0rd!456';

type Seeded = { tenantId: number; username: string };

async function apiJSON(path: string, init: RequestInit = {}): Promise<any> {
  const resp = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${resp.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function loginAPI(username: string, password: string): Promise<string> {
  const body = await apiJSON('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  // A freshly created user must clear the forced password change before a token
  // is issued.
  if (body.need_change_pwd) {
    await apiJSON('/auth/password/forced-change', {
      method: 'POST',
      body: JSON.stringify({ ticket: body.ticket, new_password: PW }),
    });
    return loginAPI(username, PW);
  }
  return body.token as string;
}

async function seedTenantAdmin(adminToken: string, label: string): Promise<Seeded> {
  const auth = { Authorization: `Bearer ${adminToken}` };
  const code = `gt12080-${label}-${uniqueSuffix()}`;

  const { tenant } = await apiJSON('/tenants', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ code, name: code }),
  });
  await apiJSON(`/tenants/${tenant.id}/status`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ status: 'active' }),
  });

  const username = `ta-${label}-${uniqueSuffix()}`;
  await apiJSON('/users', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      username,
      password: INITIAL_PW,
      role: 'tenant_admin',
      role_id: await resolveTenantRoleID(API_BASE, adminToken),
      tenant_id: tenant.id,
    }),
  });
  // Burn the forced password change now so the browser sees a plain login form.
  await loginAPI(username, INITIAL_PW);

  return { tenantId: tenant.id, username };
}

async function loginUI(page: Page, username: string) {
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(PW);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
}

async function logoutUI(page: Page) {
  await page.locator('[data-slot="dropdown-menu-trigger"]').last().click();
  await page.getByRole('menuitem', { name: /退出登录|Logout/ }).click();
  await expect(page).toHaveURL(/login/, { timeout: 15000 });
}

/** Opens the sender-filter drawer on an already-loaded pipeline page. */
async function openSenderFilterDrawer(page: Page) {
  // Address the card by its stable testid. Matching `[class*="cursor-pointer"]`
  // by text also matches wrapper elements that merely CONTAIN the label, so the
  // click could land on a container that opens nothing — the drawer then never
  // appears and the failure points at the drawer instead of the click.
  const card = page.getByTestId('pipeline-policy-card-senderFilter');
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();
  const drawer = page.locator('[data-slot="sheet-content"]').first();
  await expect(drawer).toBeVisible({ timeout: 15000 });
  return drawer;
}

test.describe('GT-12080 cross-tenant cache isolation', () => {
  let tenantA: Seeded;
  let tenantB: Seeded;
  let ruleName: string;

  test.beforeAll(async () => {
    const adminToken = await loginAPI('admin', 'admin123');
    tenantA = await seedTenantAdmin(adminToken, 'a');
    tenantB = await seedTenantAdmin(adminToken, 'b');

    // Tenant A owns one sender-filter blacklist rule. Created with A's own
    // token, so the API stamps tenant_id = A (verified: B's GET never returns
    // it — the leak is the browser cache, not the wire).
    const tokenA = await loginAPI(tenantA.username, PW);
    ruleName = `gt12080-a-blacklist-${uniqueSuffix()}`;
    await apiJSON('/unified-rules', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        name: ruleName,
        rule_class: 'action',
        stage: 'rcpt',
        priority: 100,
        page: 'sender_filter',
        action: 'reject',
        is_active: true,
        condition_tree: {
          type: 'condition',
          field: 'sender',
          operator: 'eq',
          value: `spam-${uniqueSuffix()}@evil.example`,
        },
        metadata: { feature: 'sender_filter' },
      }),
    });
  });

  test("tenant B must not see tenant A's rules after a re-login on the same tab", async ({ page }) => {
    // 1. Tenant A logs in and views its sender-filter rules — this fills the
    //    ['sender-filter-rules'] cache entry with A's rows.
    await page.goto('/zh/login');
    await loginUI(page, tenantA.username);

    await page.goto('/zh/security/pipeline');
    const drawerA = await openSenderFilterDrawer(page);
    await expect(drawerA.getByText(ruleName)).toBeVisible({ timeout: 15000 });

    // 2. A logs out and B logs in — same tab, so the QueryClient (and A's cached
    //    rows) survives. Everything below must stay inside the SPA.
    await page.keyboard.press('Escape');
    await logoutUI(page);
    await loginUI(page, tenantB.username);

    // 3. B navigates to the same page via the sidebar. These are <button>s that
    //    call router.push — a client-side nav, so the QueryClient (still holding
    //    A's rows) stays alive. A page.goto() here would rebuild it and hide the bug.
    const bFetch = page.waitForResponse(
      (r) => r.url().includes('unified-rules?rule_page=sender_filter') && r.status() === 200,
      { timeout: 20000 },
    );

    const pipelineBtn = page.getByRole('button', { name: '策略流水线', exact: true });
    if (!(await pipelineBtn.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: '安全策略', exact: true }).click();
    }
    await pipelineBtn.click();
    await expect(page).toHaveURL(/security\/pipeline/, { timeout: 15000 });

    const drawerB = await openSenderFilterDrawer(page);

    // B must issue its OWN request rather than reading A's cached rows. Before the
    // fix this response never arrives: the ['sender-filter-rules'] entry is still
    // within the 60s staleTime, so React Query serves A's rows without refetching.
    // Awaiting it also stops the assertions below from passing on a loading table.
    const body = (await (await bFetch).json()) as { items?: Array<{ name: string }> };
    const names = (body.items ?? []).map((r) => r.name);

    // Not "B sees nothing": a system_admin with no tenant selected creates rules
    // with tenant_id = NULL, and ListRules hands those global rows to every tenant
    // by design. The invariant is narrower — none of A's TENANT-OWNED rows may
    // reach B, on the wire or on screen.
    expect(names).not.toContain(ruleName);
    await expect(drawerB.getByText(ruleName)).toHaveCount(0);
  });
});
