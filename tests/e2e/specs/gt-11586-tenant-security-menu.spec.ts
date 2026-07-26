// GT-11586 regression e2e: tenant_admin must see the 安全策略 (security policy)
// parent menu and its children 策略流水线 (strategy-pipeline) /
// 分组策略 (group-policy).
//
// Bug: webapp/src/lib/constants.ts previously tagged both security children
// with permission:'manage_ip_frequency', which auth-context.tsx's
// permissionMatrix only grants to system_admin. tenant_admin therefore had
// both children filtered out, and sidebar-nav.tsx's
// "filteredChildren?.length === 0 → hide parent" rule removed the parent
// header entirely. Per spec (product-form-framework-design §13 rows 408-410
// and demo user-permission/types.ts TENANT_ONLY_MODULE_KEYS) the security
// menu is a tenant-only business module and MUST be visible to tenant_admin.
//
// Pre-conditions:
//   - The shared dev environment seeds the admin/admin123 system_admin.
//   - This spec creates an ephemeral tenant + tenant_admin user via the API,
//     then logs in as that user.

import { test as base, expect, request } from '@playwright/test';
import { resolveTenantRoleID } from '../helpers/roles';

type ApiCreds = { username: string; password: string };

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:18080';

async function adminLogin(): Promise<string> {
  const ctx = await request.newContext();
  const r = await ctx.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(r.ok(), `admin login ${r.status()}`).toBeTruthy();
  const body = await r.json();
  await ctx.dispose();
  return body.token as string;
}

async function provisionTenantAdmin(): Promise<ApiCreds> {
  const token = await adminLogin();
  const ctx = await request.newContext();
  const ts = Date.now();
  const tenantName = `gt11586-e2e-${ts}`;
  // Provision an active tenant. (Admin login already authorizes the create.)
  const tr = await ctx.post(`${API_BASE}/api/v1/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: tenantName, code: tenantName, description: 'GT-11586 e2e', status: 'active' },
  });
  expect(tr.ok(), `tenant create ${tr.status()}`).toBeTruthy();
  const tenantId = (await tr.json()).tenant.id as number;
  // Provision a tenant_admin user.
  const username = `gt11586-ta-${ts}`;
  const password = `Verify-${ts}!Aa`;
  const ur = await ctx.post(`${API_BASE}/api/v1/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { username, password, role: 'tenant_admin', role_id: await resolveTenantRoleID(API_BASE, token), tenant_id: tenantId },
  });
  expect(ur.ok(), `user create ${ur.status()}`).toBeTruthy();
  // First login -> need_change_pwd + ticket.
  const lr1 = await ctx.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username, password },
  });
  const lb1 = await lr1.json();
  const ticket = lb1.ticket as string;
  expect(ticket, 'must-change ticket').toBeTruthy();
  // forced-change to a stable password.
  const finalPw = `Final-${ts}!Aa`;
  const fr = await ctx.post(`${API_BASE}/api/v1/auth/password/forced-change`, {
    data: { ticket, new_password: finalPw },
  });
  expect(fr.ok(), `forced-change ${fr.status()}`).toBeTruthy();
  await ctx.dispose();
  return { username, password: finalPw };
}

const credsPromise = provisionTenantAdmin();

// GT-11586: a tenant_admin must see the 安全策略 menu.
//
// This regressed when the RBAC matrix rollout made sidebar visibility derive
// from the caller's own role: init.sql seeds the system default roles WITHOUT
// any role_permissions rows, so a tenant admin on tenant_ops resolved an empty
// matrix, which read strictly means deny-all — the sidebar collapsed to a
// single group. Fixed by giving the menu-visibility layer the same coarse
// tenant-admin fallback users/page.tsx already applied to its tabs (see
// auth-context.tsx `coarseTenantAdminFallback`): an EMPTY matrix means
// unconfigured, not denied; once any row exists the matrix is authoritative.
base.describe('GT-11586: tenant_admin sees 安全策略 menu', () => {
  base('security parent header is visible to tenant_admin', async ({ page }) => {
    const creds = await credsPromise;
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill(creds.username);
    await page.locator('input[name="password"]').fill(creds.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // The parent 安全策略 header must render.
    await expect(page.getByRole('button', { name: /安全策略/ })).toBeVisible();
  });

  base('strategy-pipeline child is reachable under 安全策略 for tenant_admin', async ({ page }) => {
    const creds = await credsPromise;
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill(creds.username);
    await page.locator('input[name="password"]').fill(creds.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Expand the parent group and assert the child label is rendered.
    await page.getByRole('button', { name: /安全策略/ }).click();
    await expect(page.getByRole('button', { name: /策略流水线/ })).toBeVisible();
  });
});
