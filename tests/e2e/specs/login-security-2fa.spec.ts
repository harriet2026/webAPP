import type { Page, APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

// Plan D (login-security 2FA) / spec §5 (A-18), Task 7. The 二次认证 card on the
// 登录安全 tab (Task 4, testids from LoginSecurityTab.tsx) has two distinct
// scopes that render two different controls:
//
//  - tenant scope (tenant_admin viewer): a self-toggle (`twofactor-enabled-toggle`)
//    the tenant can turn on for itself, EXCEPT when the platform has forced 2FA
//    for that tenant (`effective.forceTwoFactor`) — then it must render locked ON,
//    disabled, with a visible `twofactor-locked-hint` explaining why. Silently
//    allowing the click (even if the server would reject it) reads as broken UI.
//  - platform scope (system-admin viewer): the global force switch
//    (`twofactor-force-toggle`), never the tenant self-toggle.
//
// Mirrors the login/tab-navigation scaffolding of `login-security-policy.spec.ts`
// and `login-security-tenant-admin.spec.ts` (tenant_admin fixture pattern).

const APISERVER = process.env.APISERVER_BASE_URL || 'http://localhost:18080';

async function adminToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${APISERVER}/api/v1/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).token as string;
}

// CreateUser now requires role_id (internal/api/users.go — role_id is
// authoritative, the legacy `role` string only checked for agreement). A
// tenant-scoped role_id derives role='tenant_admin', which is what this
// tenant-scope block needs. GET /roles scoped by X-Tenant-ID returns that
// tenant's roles (安全运营/审计员 + templates); take the first.
async function firstTenantRoleId(
  request: APIRequestContext,
  token: string,
  tenantId: number,
): Promise<number> {
  const r = await request.get(`${APISERVER}/api/v1/roles`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  const items = (await r.json()).items as { id: number }[];
  if (!items?.length) throw new Error(`firstTenantRoleId: no roles for tenant ${tenantId}`);
  return items[0].id;
}

async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/zh/login?advance');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
}

async function openLoginSecurityTab(page: Page) {
  await page.goto('/zh/users');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('users-tab-login-security').click();
  const tab = page.getByTestId('login-security-tab');
  await expect(tab).toBeVisible();
  return tab;
}

test.describe('二次认证 card — platform scope (Plan D §5 A-18)', () => {
  test('platform admin: the card renders and shows the global force toggle, not the tenant self-toggle', async ({
    authenticatedPage: page,
  }) => {
    const tab = await openLoginSecurityTab(page);

    const card = tab.getByTestId('login-security-2fa');
    await expect(card).toBeVisible();
    // '二次认证' appears in the card title, the toggle label, and the hint
    // copy — assert the title (first match), not all three (strict-mode).
    await expect(card.getByText('二次认证').first()).toBeVisible();

    const forceToggle = card.getByTestId('twofactor-force-toggle');
    await expect(forceToggle).toBeVisible();
    await expect(forceToggle).toBeEnabled();

    // The tenant self-toggle is a tenant-scope-only concept — a platform admin
    // (no X-Tenant-ID / impersonation) must never see it.
    await expect(card.getByTestId('twofactor-enabled-toggle')).toHaveCount(0);
  });
});

// Serial: every test in this block reads or writes the SAME tenant's 2FA state
// (self-toggle then platform-forced lock), so they must not interleave across
// parallel workers — a concurrent write from one test would flip the state the
// other test is asserting on.
test.describe.serial('二次认证 card — tenant scope (Plan D §5 A-18)', () => {
  const TENANT_ADMIN = {
    username: `pw-2fa-tenantadm-${Date.now()}`,
    password: 'TwoFaAdm@2026',
  };
  let tenantId: number;
  let userId: number;

  test.beforeAll(async ({ request }) => {
    const token = await adminToken(request);
    const auth = { Authorization: `Bearer ${token}` };

    // Pick an ACTIVE tenant, not items[0]: the tenant list sorts pending
    // tenants first, and a pending tenant may carry a leftover platform 2FA
    // force + restrict the tenant admin's console access — neither is what
    // this card test is about.
    const tl = await request.get(`${APISERVER}/api/v1/tenants?page_size=100`, { headers: auth });
    const tenants = (await tl.json()).items as { id: number; status?: string }[];
    tenantId = (tenants.find((t) => t.status === 'active') ?? tenants[0]).id;

    const roleId = await firstTenantRoleId(request, token, tenantId);
    const created = await request.post(`${APISERVER}/api/v1/users`, {
      headers: auth,
      data: {
        username: TENANT_ADMIN.username,
        role: 'tenant_admin',
        role_id: roleId,
        tenant_id: tenantId,
        password: TENANT_ADMIN.password,
        must_change_password: false,
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    userId = (await created.json()).id as number;
  });

  // Every test's loginAs must start from a clean 2FA slate. In multi-tenant
  // form effectiveTwoFactorRequired() (internal/api/twofactor.go) is true when
  // the tenant has EITHER twoFactorEnabled OR forceTwoFactor, so a leftover
  // enabled flag — from the self-toggle test below, or an interrupted prior
  // run — pushes the fresh login into the first-login enrollment screen
  // (首次登录需设置二次认证) and it never reaches /dashboard. Reset per test,
  // not once, since the self-toggle test intentionally leaves it enabled.
  test.beforeEach(async ({ request }) => {
    const token = await adminToken(request);
    const auth = { Authorization: `Bearer ${token}` };
    // Two steps, in this order: lift forceTwoFactor first (a platform-only op,
    // always allowed), THEN clear the tenant self-toggle. Sending
    // twoFactorEnabled:false while the tenant is still force-locked is rejected
    // ("平台已强制启用二次认证，租户不可关闭"), so a single combined PUT would
    // silently fail to reset a force-locked tenant.
    await request.put(`${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`, {
      headers: auth,
      data: { forceTwoFactor: false },
    });
    await request.put(`${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`, {
      headers: auth,
      data: { twoFactorEnabled: false },
    });
  });

  test.afterAll(async ({ request }) => {
    const token = await adminToken(request);
    const auth = { Authorization: `Bearer ${token}` };
    // Reset the tenant's 2FA state so later specs (and reruns) see a clean slate.
    await request.put(`${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`, {
      headers: auth,
      data: { twoFactorEnabled: false, forceTwoFactor: false },
    });
    if (userId) await request.delete(`${APISERVER}/api/v1/users/${userId}`, { headers: auth });
  });

  test('renders the card for a tenant admin', async ({ page }) => {
    await loginAs(page, TENANT_ADMIN.username, TENANT_ADMIN.password);
    const tab = await openLoginSecurityTab(page);
    await expect(tab.getByTestId('login-security-2fa')).toBeVisible();
  });

  test('tenant self-toggle: toggling it saves, and the ON state survives a reload', async ({
    page,
  }) => {
    await loginAs(page, TENANT_ADMIN.username, TENANT_ADMIN.password);
    let tab = await openLoginSecurityTab(page);

    const toggle = tab.getByTestId('twofactor-enabled-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();

    const saved = page.waitForResponse(
      (r) => r.url().includes('/security/login-policy') && r.request().method() === 'PUT',
    );
    await toggle.click();
    await page.getByTestId('login-security-save').click();
    const resp = await saved;
    expect(resp.status(), await resp.text()).toBe(200);

    // Reload to prove the ON state was actually persisted server-side, not just
    // held in local component state.
    await page.reload();
    await page.waitForLoadState('networkidle');
    tab = await openLoginSecurityTab(page);
    await expect(tab.getByTestId('twofactor-enabled-toggle')).toBeChecked();
  });

  test('tenant toggle is locked ON + disabled, with the locked hint, once the platform force-enables 2FA for this tenant', async ({
    page,
    request,
  }) => {
    // Log in BEFORE the platform forces 2FA below. The gate that requires a 2FA
    // challenge only runs at login time (postPasswordGate) — it is never
    // re-evaluated for an already-issued session — so a session started before
    // the force takes effect can still reach the tab afterwards. Forcing 2FA for
    // this tenant and then trying to log in fresh would instead hang the test on
    // a 2FA challenge screen this spec has no way to complete.
    await loginAs(page, TENANT_ADMIN.username, TENANT_ADMIN.password);

    const token = await adminToken(request);
    const auth = { Authorization: `Bearer ${token}` };
    const forced = await request.put(
      `${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`,
      { headers: auth, data: { forceTwoFactor: true } },
    );
    expect(forced.ok(), await forced.text()).toBeTruthy();

    try {
      const tab = await openLoginSecurityTab(page);

      const toggle = tab.getByTestId('twofactor-enabled-toggle');
      await expect(toggle).toBeChecked();
      await expect(toggle).toBeDisabled();
      await expect(tab.getByTestId('twofactor-locked-hint')).toBeVisible();
      await expect(tab.getByTestId('twofactor-locked-hint')).toContainText('平台已强制启用二次认证');

      // The platform-scope-only force toggle must not leak into the tenant view.
      await expect(tab.getByTestId('twofactor-force-toggle')).toHaveCount(0);
    } finally {
      await request.put(`${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`, {
        headers: auth,
        data: { forceTwoFactor: false },
      });
    }
  });
});

// Multi-role / platform-vs-tenant impersonation in a single browser context is not
// something the harness supports (see login-security-tenant-admin.spec.ts, which
// also uses two separate `loginAs` sessions rather than switching roles in place).
// Left as a skip with the intended steps rather than a duplicate of the platform-
// scope test above using the shared `authenticatedPage` fixture.
test.skip(
  'platform admin sets forceTwoFactor for a specific tenant via the UI (not just the API) and the tenant view reflects it',
  async () => {
    // Intended steps once the harness supports switching the active tenant
    // impersonation for a platform admin within one page/session:
    // 1. As platform admin, open /zh/users → 登录安全 tab → impersonate the
    //    target tenant (tenant selector) so the 2FA card renders tenant scope.
    // 2. Toggle `twofactor-enabled-toggle` on behalf of that tenant and save.
    // 3. Switch back to platform scope, or log in as that tenant's tenant_admin,
    //    and assert the value is reflected in `effective.twoFactorEnabled`.
  },
);
