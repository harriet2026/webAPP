import { test, expect } from '../fixtures/auth.fixture';

// NOTE on roles: this file used to set `test.use({ asRole: 'tenant_admin' })` at
// file scope, because Module A (the policy pipeline) is tenant-scoped and blocks
// the platform admin (GT-12149 / PRD §1.4). But that override also applied to
// the 系统管理 → 用户管理 navigation test, and the 用户管理 sidebar entry is gated
// on the `manage_login_security` permission which a tenant admin's role does not
// carry — so the entry is (correctly) not rendered and the click timed out.
// The override is therefore scoped to just the pipeline test below.

test.describe('Gateway Phase 0 - Infrastructure Smoke Tests', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/dashboard');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.locator('main h1').waitFor({ state: 'visible' });
  });

  test('dashboard loads after Phase 0 infrastructure changes', async ({ authenticatedPage }) => {
    // /dashboard is now the system-status dashboard (feat f90557176); its H1 is
    // "系统状态", not the old "仪表盘" nav label.
    await expect(authenticatedPage.locator('main h1')).toHaveText('系统状态');
  });

  test('health API responds on public port', async ({ authenticatedPage }) => {
    const resp = await authenticatedPage.request.get('http://localhost:18080/health');
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.status).toBe('ok');
  });

  test('email logs page loads correctly', async ({ authenticatedPage }) => {
    // Let the post-login landing settle first: goto-ing while the app is still
    // performing its own bootstrap navigation truncates ours into
    // net::ERR_ABORTED (intermittent, only under full-suite load).
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.goto('/zh/logs/email');
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/logs\/email/);
  });

  test('system settings page accessible', async ({ authenticatedPage }) => {
    // Labels come from messages/zh.json sidebar.system / sidebar.users. The
    // latter was renamed 用户管理 -> 管理员与权限 in 807a63f3f2; the sidebar
    // renders plain buttons (router.push, no href/testid), so text is the only
    // handle here -- keep these in step with that file on a rename.
    // Wait for the post-login landing to settle before driving the sidebar: a
    // router.push issued while the app is still bootstrap-navigating gets
    // superseded, and the test then sits on /zh/dashboard until it times out.
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/dashboard/);

    await authenticatedPage.locator('button').filter({ hasText: /^系统管理$/ }).click();
    const usersItem = authenticatedPage.locator('button').filter({ hasText: /^管理员与权限$/ });
    await expect(usersItem).toBeVisible();
    await usersItem.click();
    await expect(authenticatedPage).toHaveURL(/users/);
  });
});

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive it as a tenant_admin.
test.describe('Gateway Phase 0 - policy pipeline (tenant scope)', () => {
  test.use({ asRole: 'tenant_admin' });

  test('IP filter page loads correctly', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/security\/pipeline/);
  });
});
