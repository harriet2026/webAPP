import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { resolveTenantRoleID } from '../helpers/roles';

// GT-11959 §7.3 — the assertion the whole permission layer exists for, and which
// had NO end-to-end coverage: every existing spec used the platform-admin fixture,
// so `tenant_admin` was never actually logged in.
//
// It is also the most fragile layer. A tenant admin holds neither `manage_users`
// nor `manage_tenants`, so before this feature they could not open /users at all.
// If the permission, the sidebar entry, or the per-tab gating is wired wrong, the
// backend can be perfect and the feature simply does not exist for tenants.
//
// And the 403 check is not cosmetic: /users' admin-account query used to fire
// unconditionally on mount, BEFORE any permission branch. Merely widening access
// would have had every tenant admin eat a 403 on every visit — and GT-12005/12008
// already taught us what happens when a "not for this viewer" 403 is dressed up as
// a fault (a green "system healthy" banner over a broken dashboard).

const APISERVER = process.env.APISERVER_BASE_URL || 'http://localhost:18080';

const TENANT_ADMIN = {
  username: `pw-tenantadm-${Date.now()}`,
  // Comfortably above the platform baseline minLength (10). The old 14-char
  // value was rejected outright once this suite drew a tenant carrying a 16-char
  // override ("password must be at least 16 characters").
  password: 'TenantAdm@2026-LongEnough',
};

async function adminToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${APISERVER}/api/v1/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).token as string;
}

async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/zh/login?advance');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
}

let tenantId: number;
let userId: number;

test.beforeAll(async ({ request }) => {
  const token = await adminToken(request);
  const auth = { Authorization: `Bearer ${token}` };

  // Own the tenant rather than borrowing /tenants?page_size=1's first row: that
  // listing is NOT ordered by id, so it returned whichever tenant happened to be
  // on page 1 — here a leftover 2fa-e2e tenant whose 16-char password override
  // rejected this suite's user. This spec also writes a login-policy onto the
  // tenant in afterAll, which must not land on someone else's.
  const tenantSuffix = Date.now();
  const tenantResp = await request.post(`${APISERVER}/api/v1/tenants`, {
    headers: auth,
    data: { name: `pw-lsta-tenant-${tenantSuffix}`, code: `pw-lsta-${tenantSuffix}` },
  });
  expect(tenantResp.ok(), await tenantResp.text()).toBeTruthy();
  const tenantBody = await tenantResp.json();
  tenantId = (tenantBody.tenant ?? tenantBody).id as number;

  const created = await request.post(`${APISERVER}/api/v1/users`, {
    headers: auth,
    data: {
      username: TENANT_ADMIN.username,
      role: 'tenant_admin',
      role_id: await resolveTenantRoleID(APISERVER, token),
      tenant_id: tenantId,
      password: TENANT_ADMIN.password,
      must_change_password: false,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  userId = (await created.json()).id as number;
});

test.afterAll(async ({ request }) => {
  const token = await adminToken(request);
  const auth = { Authorization: `Bearer ${token}` };
  await request.put(`${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`, {
    headers: auth,
    data: {},
  });
  if (userId) await request.delete(`${APISERVER}/api/v1/users/${userId}`, { headers: auth });
  if (tenantId) await request.delete(`${APISERVER}/api/v1/tenants/${tenantId}`, { headers: auth });
});

test.describe('tenant_admin on /users (GT-11959 §7.3)', () => {
  test('reaches /users, sees its tenant-scoped tabs, and gets no 403', async ({ page }) => {
    const forbidden: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 403) forbidden.push(`${r.request().method()} ${r.url()}`);
    });

    await loginAs(page, TENANT_ADMIN.username, TENANT_ADMIN.password);

    // Only police /users. Login lands on the dashboard, whose agent-stats /
    // inbound-audit sources are capability-gated and DELIBERATELY fault-isolated
    // (optionalSource(..., null, 'agent-stats') — GT-12005/GT-12008): a tenant
    // without the AI grants gets a 403 there, the card degrades to null and no
    // banner is shown. Collecting from before login made this test police that
    // unrelated dashboard traffic instead of the page it is about.
    //
    // Wait for that dashboard traffic to SETTLE before clearing. Clearing right
    // after loginAs() only empties the array — the dashboard's capability-gated
    // queries are still in flight, so their 403 responses land during the /users
    // navigation below and get misattributed to /users.
    await page.waitForLoadState('networkidle');
    forbidden.length = 0;

    // The sidebar entry must be there — it is gated on manage_login_security, which
    // a tenant admin holds; it used to be gated on manage_users, which it does not.
    await page.goto('/zh/users');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('users-tab-login-security')).toBeVisible();
    // The 管理员账号 tab IS shown to a tenant admin now: fe2f60da8a (2026-07-18,
    // "account tab UI") made users/page.tsx gate it on
    // `canManageUsers || isTenantAdmin`, so a tenant admin manages their OWN
    // tenant's admins. This used to assert the tab was absent, per GT-11959's
    // original "only 登录安全" model, which that change superseded.
    //
    // The load-bearing assertion is the 403 check below: the tab being visible is
    // only correct if its queries are tenant-scoped. If it rendered while still
    // firing platform-only admin queries, they would 403 and fail this test.
    await expect(page.getByTestId('users-tab-accounts')).toBeVisible();

    // 管理员账号 is now the default-selected tab, so 登录安全's panel is not
    // mounted until it is chosen (it used to be the only tab, hence rendered
    // immediately). Selecting it also makes its queries run inside the 403 window
    // asserted below, which is the point of this test.
    await page.getByTestId('users-tab-login-security').click();
    await expect(page.getByTestId('login-security-tab')).toBeVisible();

    // The banner is tenant-scope only: it tells them they may tighten, never weaken.
    await expect(page.getByText(/平台已下发登录安全基线/)).toBeVisible();

    expect(
      forbidden,
      'a tenant admin opening /users must not hit a single 403. A 403 here means an ' +
        'admin-only query fired before the permission branch — noise at best, a bogus ' +
        'error banner at worst.',
    ).toEqual([]);
  });

  test('the brute-force controls are READ-ONLY for a tenant admin', async ({ page }) => {
    await loginAs(page, TENANT_ADMIN.username, TENANT_ADMIN.password);
    await page.goto('/zh/users');
    await page.getByTestId('users-tab-login-security').click();

    const tab = page.getByTestId('login-security-tab');
    await expect(tab).toBeVisible();

    // §2.5: these three are platform-global — they run pre-auth and are keyed by
    // username, so a per-tenant value would answer differently for a real user than
    // for a non-existent one. Shown, but not editable.
    await expect(tab.getByTestId('global-max-attempts')).toBeVisible();
    await expect(tab.getByLabel('连续密码错误次数')).toHaveCount(0);
    await expect(tab.getByLabel('锁定时长')).toHaveCount(0);
    await expect(tab.getByText('由平台统一设置，租户不可修改').first()).toBeVisible();

    // ...while the layered ones ARE editable.
    await expect(tab.getByLabel('最小密码长度')).toBeVisible();
    await expect(tab.getByLabel('同一账号最大在线数')).toBeVisible();
  });

  test('a tenant admin can save a tightening of its own tenant', async ({ page, request }) => {
    await loginAs(page, TENANT_ADMIN.username, TENANT_ADMIN.password);
    await page.goto('/zh/users');
    await page.getByTestId('users-tab-login-security').click();
    await expect(page.getByTestId('login-security-tab')).toBeVisible();

    // Tighten the session timeout (shorter = stricter).
    const select = page.getByLabel('会话超时时间');
    await select.click();
    await page.getByRole('option', { name: '1800 秒' }).click();

    const saved = page.waitForResponse(
      (r) => r.url().includes('/security/login-policy') && r.request().method() === 'PUT',
    );
    await page.getByTestId('login-security-save').click();
    const resp = await saved;
    expect(resp.status(), await resp.text()).toBe(200);

    // ...and it landed on the TENANT's row, not the platform baseline.
    const token = await adminToken(request);
    const g = await request.get(
      `${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await g.json();
    expect(body.override.sessionTimeoutSecs).toBe(1800);
    expect(body.effective.sessionTimeoutSecs).toBe(1800);
    // The platform baseline is untouched.
    expect(body.baseline.sessionTimeoutSecs).not.toBe(1800);
  });
});
