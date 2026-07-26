import type { FullConfig } from '@playwright/test';
import { ensureTenantAdmin } from './helpers/roles';

// API base for the apiserver (port 18080 on the host in the dev stack).
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:18080';

async function login(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!r.ok) {
    throw new Error(`global-setup: admin login failed: ${r.status}`);
  }
  const body = await r.json();
  return body.token as string;
}

// Ensures at least one tenant exists before the specs run. Many tenant-scoped
// specs (domains, rules, bounce-DSN, ...) fetch the first tenant and create
// child resources against it; on a freshly-initialized DB no tenant exists yet
// (init.sql only seeds the admin user with tenant_id=NULL). This mirrors the
// tests/integration/conftest.py default-tenant seeding so Playwright is
// self-sufficient regardless of whether the Python E2E suite ran first.
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const token = await login();
  const auth = { Authorization: `Bearer ${token}` };

  // page_size must cover every tenant: the list is not id-ordered, so a default
  // (first-page) response can omit the lowest id once earlier suites have left
  // hundreds of tenants behind.
  const listResp = await fetch(`${API_BASE}/api/v1/tenants?page_size=500`, { headers: auth });
  if (!listResp.ok) {
    throw new Error(`global-setup: list tenants failed: ${listResp.status}`);
  }
  const listBody = await listResp.json();
  const items = (listBody.items || listBody.tenants || []) as Array<{ id: number }>;

  let tenantId: number | undefined;
  if (Array.isArray(items) && items.length > 0) {
    // Pick the lowest id — the same tenant the tenant-scoped specs select.
    tenantId = items.slice().sort((a, b) => a.id - b.id)[0]?.id;
  } else {
    // Spec 2A requires `code` (unique). Use a deterministic value so concurrent
    // setups (or re-runs) converge on a 409 rather than creating duplicates.
    const createResp = await fetch(`${API_BASE}/api/v1/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        name: 'Default System Tenant',
        code: 'default-system',
        description: 'Playwright globalSetup default tenant',
      }),
    });
    // 409 conflict = a tenant (or just the code) raced in between the list and
    // create — also fine.
    if (!createResp.ok && createResp.status !== 409) {
      throw new Error(`global-setup: create default tenant failed: ${createResp.status}`);
    }
    if (createResp.ok) {
      tenantId = ((await createResp.json()) as { id?: number }).id;
    } else {
      // 409 raced: re-list to recover the id.
      const reResp = await fetch(`${API_BASE}/api/v1/tenants?page_size=500`, { headers: auth });
      const reItems = ((await reResp.json()).items || []) as Array<{ id: number }>;
      tenantId = reItems.slice().sort((a, b) => a.id - b.id)[0]?.id;
    }
  }

  // Activate the default tenant. A freshly-created tenant defaults to
  // status='pending'; the multi-tenant tenant-selector clears any selected
  // tenant that is not 'active' (so tenant-scoped pages like disposal-settings
  // fall back to the "all tenants" view with no tenant-scoped tabs). This
  // mirrors tests/integration/conftest.py, which likewise PUTs the default
  // tenant to status='active' before the suite runs.
  if (tenantId != null) {
    const actResp = await fetch(`${API_BASE}/api/v1/tenants/${tenantId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ status: 'active' }),
    });
    if (!actResp.ok) {
      throw new Error(`global-setup: activate default tenant ${tenantId} failed: ${actResp.status}`);
    }

    // Grant the AI Stage-4 agents to the default tenant. Under the dev product
    // form (`cloud` → SaaS + multi-tenant) these features are `grantable`, so a
    // tenant without the flag resolves to `locked` and /agent-center/overview
    // renders the "agent not enabled" placeholder instead of the agent detail —
    // every phishing / spoofing / threat-retro spec would fail on a fresh DB.
    const grantResp = await fetch(`${API_BASE}/api/v1/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        capability_flags: ['phishing-detection', 'spoofing-detection', 'threat-retro'],
      }),
    });
    if (!grantResp.ok) {
      throw new Error(
        `global-setup: grant AI capabilities to tenant ${tenantId} failed: ${grantResp.status}`,
      );
    }

    // Provision a tenant_admin bound to the default tenant. Module-A specs
    // (policy pipeline + per-module editors) log in as this user because the
    // platform admin is blocked from Module A in the multi-tenant dev form.
    await ensureTenantAdmin(API_BASE, token, tenantId);
  }
}
