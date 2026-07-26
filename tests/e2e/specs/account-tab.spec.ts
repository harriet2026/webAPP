import { test, expect } from '../fixtures/auth.fixture';
import { AccountTabPage } from '../pages/account-tab.page';
import { uniqueSuffix, uniqueSuffixAlnum } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';

// Plan B Task 10: E2E for the 账号 (accounts) tab UI Task 9 built at /zh/users
// — status badge, phone, online, force-offline, status toggle, batch bar,
// role select, and impersonation-driven tenant scope. See
// `.superpowers/sdd/task-b10-brief.md`.
//
// LIVE RUN DEFERRED: the webapp image has not been rebuilt with Task 9's
// changes yet, so this spec has only been validated with
// `npx playwright test tests/e2e/specs/account-tab.spec.ts --list` (compiles
// + enumerates, does not touch a running app). It will be exercised for real
// in the consolidated Plan B pass once Task 9 lands in a running dev server /
// image — see `webapp/AGENTS.md` "改前端时不要重打镜像" for the iterate-then-
// certify workflow.

const API_BASE = 'http://localhost:18080/api/v1';

async function adminToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(r.status()).toBe(200);
  return ((await r.json()) as { token: string }).token;
}

// internal/api/users.go CreateUser requires role_id (authoritative; the
// legacy `role` string is optional and only checked for agreement). GET
// /roles is itself scoped by GetEffectiveTenantID (internal/api/roles.go
// ListRoles): no X-Tenant-ID -> platform-scope roles (seeded 系统管理员 /
// 平台审计员); X-Tenant-ID: <tenantId> -> that tenant's scope (seeded 安全运营 /
// 审计员 + any tenant-owned custom roles). Picks the first match, mirroring
// how the create dialog's roleOptions falls back to whatever the backend
// returns for the caller's current scope.
async function firstRoleId(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  tenantId?: number,
): Promise<number> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (tenantId !== undefined) headers['X-Tenant-ID'] = String(tenantId);
  const r = await request.get(`${API_BASE}/roles`, { headers });
  expect(r.status()).toBe(200);
  const items = ((await r.json()) as { items: { id: number }[] }).items;
  if (!items?.length) throw new Error(`firstRoleId: no roles for tenantId=${tenantId ?? 'platform'}`);
  return items[0].id;
}

test.describe.serial('account tab · columns and lifecycle', () => {
  const testUsername = `e2e_acct_${uniqueSuffix()}`;
  const testPhone = '13800001111';
  const testPassword = 'TestPass123!';
  let userId: number;
  // Extra accounts created directly via API for the batch-bar case (batch
  // selection only needs existing rows; it does not need to re-exercise the
  // create dialog per row).
  const batchIds: number[] = [];
  let token = '';
  let platformRoleId = 0;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    platformRoleId = await firstRoleId(request, token);
  });

  test.afterAll(async ({ request }) => {
    // Best-effort cleanup so repeated runs don't accumulate admin accounts.
    for (const id of [userId, ...batchIds]) {
      if (!id) continue;
      await request.delete(`${API_BASE}/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  });

  test('account tab renders phone / status / online / last-login columns', async ({ authenticatedPage }) => {
    const accountTab = new AccountTabPage(authenticatedPage);
    await accountTab.goto();
    await accountTab.expectLoaded();

    const headers = await accountTab.columnHeaders();
    expect(headers).toContain('手机号');
    expect(headers).toContain('状态');
    expect(headers).toContain('在线');
    expect(headers).toContain('最后登录时间');
  });

  test('create a new admin via the dialog with name/phone/email + role select', async ({ authenticatedPage }) => {
    const accountTab = new AccountTabPage(authenticatedPage);
    await accountTab.goto();
    await accountTab.expectLoaded();

    await accountTab.createUser({
      username: testUsername,
      password: testPassword,
      name: '测试管理员',
      phone: testPhone,
      email: `${testUsername}@test.local`,
      // Seeded system default role (configs/postgres/init.sql), platform
      // scope — avoids the conditional tenant_id field that only appears for
      // tenant-scope roles.
      roleName: '系统管理员',
    });
    await waitForToast(authenticatedPage);

    userId = await accountTab.findUserRowId(testUsername);
    const row = accountTab.findRowByUsername(testUsername);
    await expect(row).toBeVisible();
    await expect(row).toContainText(testPhone);
    await expect(accountTab.statusBadge(userId)).toHaveText(/正常/);
    await expect(accountTab.onlineIndicator(userId)).toBeVisible();
  });

  test('status toggle: disable shows 禁用 badge, re-enable shows 正常', async ({ authenticatedPage }) => {
    test.skip(!userId, 'depends on the create-admin test above');
    const accountTab = new AccountTabPage(authenticatedPage);
    await accountTab.goto();
    await accountTab.expectLoaded();
    await accountTab.search(testUsername);

    await accountTab.disableUser(userId);
    await waitForToast(authenticatedPage);
    await expect(accountTab.statusBadge(userId)).toHaveText(/禁用/);

    await accountTab.enableUser(userId);
    await waitForToast(authenticatedPage);
    await expect(accountTab.statusBadge(userId)).toHaveText(/正常/);
  });

  test('force-offline: confirm dialog then success toast', async ({ authenticatedPage }) => {
    test.skip(!userId, 'depends on the create-admin test above');
    const accountTab = new AccountTabPage(authenticatedPage);
    await accountTab.goto();
    await accountTab.expectLoaded();
    await accountTab.search(testUsername);

    await accountTab.forceOffline(userId);
    const toast = await waitForToast(authenticatedPage);
    await expect(toast).toContainText('强制下线');
  });

  test('batch bar: select multiple rows, batch-disable, both rows show 禁用', async ({ authenticatedPage, request }) => {
    // Seed two more accounts directly via API — the batch bar's job is to act
    // on already-selected rows, not to re-exercise dialog creation. Share ONE
    // suffix across both so a single search() below brings both into view (the
    // table paginates and this stack's users table has many pre-existing rows,
    // so freshly-created high-id rows are not on the default first page).
    const batchSuffix = uniqueSuffix();
    for (let i = 0; i < 2; i++) {
      const username = `e2e_batch_${batchSuffix}_${i}`;
      const r = await request.post(`${API_BASE}/users`, {
        data: {
          username,
          password: 'TestPass123!',
          role_id: platformRoleId,
          must_change_password: false,
        },
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      expect(r.status()).toBe(201);
      const body = (await r.json()) as { id: number } | { user: { id: number } };
      const id = 'user' in body ? body.user.id : body.id;
      batchIds.push(id);
    }

    const accountTab = new AccountTabPage(authenticatedPage);
    await accountTab.goto();
    await accountTab.expectLoaded();
    // Filter both freshly-seeded rows into view before selecting them.
    await accountTab.search(`e2e_batch_${batchSuffix}`);

    await accountTab.selectRows(batchIds);
    await expect(accountTab.batchBar).toBeVisible();

    await accountTab.batchDisable();
    await waitForToast(authenticatedPage);

    for (const id of batchIds) {
      await expect(accountTab.statusBadge(id)).toHaveText(/禁用/);
    }
  });
});

test.describe('account tab · impersonation-driven tenant scope', () => {
  // Task 9 makes the account tab follow impersonation: a system_admin who has
  // selected a tenant via the global TenantSelector (effectiveTenantId, see
  // src/lib/api/client.ts) is treated the same as a tenant_admin — the ENTIRE
  // data source switches to /tenant-users (isTenantView in
  // src/app/[locale]/(dashboard)/users/page.tsx). Reproduced here the same
  // way viewer-switcher.spec.ts does it: write the osg_selected_tenant cookie
  // (+ localStorage mirror) directly and reload, since the top bar's
  // TenantSelector is not mounted on every page.
  let tenantId: number;
  let tenantUserId: number;
  const tenantUsername = `e2e_tenant_acct_${uniqueSuffixAlnum()}`;
  let token = '';

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);

    const tenantResp = await request.post(`${API_BASE}/tenants`, {
      data: { name: `acct_tab_${uniqueSuffixAlnum()}`, code: `acct-${uniqueSuffixAlnum()}` },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(tenantResp.status()).toBe(201);
    const tenantBody = await tenantResp.json();
    tenantId = (tenantBody.tenant ?? tenantBody).id;

    // New tenants land pending; a pending tenant cannot hold the tenant-viewer
    // selection (the selector clears it), so activate before impersonating.
    const activated = await request.put(`${API_BASE}/tenants/${tenantId}/status`, {
      data: { status: 'active' },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect([200, 204]).toContain(activated.status());

    const tenantRoleId = await firstRoleId(request, token, tenantId);
    const userResp = await request.post(`${API_BASE}/users`, {
      data: {
        username: tenantUsername,
        password: 'TestPass123!',
        role_id: tenantRoleId,
        tenant_id: tenantId,
        must_change_password: false,
      },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(userResp.status()).toBe(201);
    const userBody = await userResp.json();
    tenantUserId = (userBody.user ?? userBody).id;
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`${API_BASE}/users/${tenantUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
    await request.delete(`${API_BASE}/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  });

  test.afterEach(async ({ authenticatedPage }) => {
    // Isolation: clear the impersonation cookies/localStorage so they don't
    // leak into later specs in the same worker (mirrors
    // viewer-switcher.spec.ts's clearViewerCookies).
    await authenticatedPage.evaluate(() => {
      document.cookie = 'osg_selected_tenant=; path=/; Max-Age=0';
      document.cookie = 'osg_viewer=; path=/; Max-Age=0';
      localStorage.removeItem('osgateway_selected_tenant');
    });
  });

  test('impersonating a tenant scopes the account tab to that tenant', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/dashboard');
    // GT-12245: the PLATFORM viewer never retains an impersonated tenant — the
    // reconciliation effect clears a bare osg_selected_tenant on mount (this
    // used to pass only by racing the effect). Impersonation therefore means
    // BOTH cookies in one step, exactly like the real switcher writes them.
    await authenticatedPage.evaluate((id) => {
      document.cookie = `osg_selected_tenant=${id}; path=/; SameSite=Strict`;
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
      localStorage.setItem('osgateway_selected_tenant', String(id));
    }, tenantId);
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle');

    const accountTab = new AccountTabPage(authenticatedPage);
    await accountTab.goto();
    await accountTab.expectLoaded();

    // The impersonated tenant's own account is visible via the /tenant-users
    // scoped source.
    await accountTab.search(tenantUsername);
    await expect(accountTab.findRowByUsername(tenantUsername)).toBeVisible();

    // Tenant-scoped create dialog: username is editable on create (only
    // disabled on edit) but the tenant_id number input never renders for the
    // tenant view (see the `!isTenantView &&` guard in page.tsx).
    await accountTab.openCreateDialog();
    await expect(accountTab.dialog.locator('input[name="tenant_id"]')).toHaveCount(0);
    await authenticatedPage.keyboard.press('Escape');
    await accountTab.dialog.waitFor({ state: 'hidden' });
  });
});
