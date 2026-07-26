import type { APIRequestContext } from '@playwright/test';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:18080';

/**
 * Resolves the default tenant — the lowest-id tenant, which is the one
 * `global-setup.ts` activates and grants the AI Stage-4 capabilities to.
 *
 * Specs must not grab `items[0]`: the tenant list is not id-ordered, so after a
 * Python E2E run has left hundreds of tenants behind, `items[0]` is an arbitrary
 * leftover that may be `pending` (the tenant-selector drops non-active tenants)
 * and carries no capability grants (AI agents render as locked).
 */
export async function getDefaultTenantId(request: APIRequestContext): Promise<number> {
  const loginResp = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  const { token } = (await loginResp.json()) as { token: string };

  // page_size must cover every tenant, otherwise the lowest id can fall off the
  // first page.
  const resp = await request.get(`${API_BASE}/api/v1/tenants?page_size=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const items = ((await resp.json()) as { items: { id: number }[] }).items;
  return lowestId(items);
}

/**
 * Same as {@link getDefaultTenantId}, for `beforeAll` hooks — Playwright's
 * `request` fixture is test-scoped and cannot be injected there.
 */
export async function getDefaultTenantIdViaFetch(): Promise<number> {
  const loginResp = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = (await loginResp.json()) as { token: string };

  const resp = await fetch(`${API_BASE}/api/v1/tenants?page_size=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const items = ((await resp.json()) as { items: { id: number }[] }).items;
  return lowestId(items);
}

function lowestId(items: { id: number }[] | undefined): number {
  if (!items?.length) {
    throw new Error('getDefaultTenantId: no tenants exist (global-setup should have created one)');
  }
  return items.slice().sort((a, b) => a.id - b.id)[0].id;
}

/**
 * Lowest-id ACTIVE tenant out of a `/tenants` list payload.
 *
 * Never index a tenant list positionally: it is not id-ordered, `page_size` is
 * capped at 100 server-side, and once a Python E2E run has left hundreds of
 * tenants behind `items[0]` is typically a `pending` leftover. A non-active
 * tenant cannot be selected — `selectedTenantId` stays null and
 * resolveSecurityScope normalizes the viewer back to 'platform' — so the spec
 * fails far away from the real cause. Enforced by
 * tests/unit/e2e-tenant-selection.test.ts.
 */
export function pickActiveTenantId(
  items: Array<{ id: number; status?: string }> | null | undefined,
): number | null {
  const usable = (items ?? []).filter((t) => t.status === 'active');
  if (!usable.length) return null;
  return usable.reduce((lo, t) => (t.id < lo.id ? t : lo)).id;
}
