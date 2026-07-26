import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';
import { resolveTenantRoleID } from '../helpers/roles';

interface RuleListItem {
  id: number;
  name: string;
}

test.describe('Group policy page (/security/groups)', () => {
  // GT-12245/GT-12257 后：平台视角（无租户）直访 /security/groups 渲染 403
  // 拦截页（group-management-tenant-scope.spec.ts 正面锁定该行为），且平台
  // 视角会清除残留的租户选择——system_admin 流程必须同时写 osg_viewer=tenant
  // 与租户选择（见 webapp/AGENTS.md「租户级页面」）再进入。
  test.beforeEach(async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const tenantId = api.getTenantId();
    expect(tenantId, 'a tenant must exist (see global-setup)').not.toBeNull();
    const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost';
    await authenticatedPage.context().addCookies([
      { name: 'osg_viewer', value: 'tenant', url: base, sameSite: 'Lax' },
      { name: 'osg_selected_tenant', value: String(tenantId), url: base, sameSite: 'Lax' },
    ]);
    await authenticatedPage.evaluate((tid) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
    }, tenantId);
    // Flipping the viewer makes the app navigate on its own; goto-ing straight
    // away truncates that into net::ERR_ABORTED (intermittent, and it fails the
    // beforeEach so the whole test looks broken).
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);
    await authenticatedPage.goto('/zh/security/groups');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('page loads with group-policy card', async ({ authenticatedPage }) => {
    // `群组策略` is the PageHeader title, which survives even if the policy card
    // is deleted outright — asserting only on it let GT-11942's alleged defect
    // pass unnoticed. `群组策略规则` is the card's own title.
    await expect(authenticatedPage.getByRole('heading', { name: /群组策略/ }).first()).toBeVisible();
    await expect(authenticatedPage.getByTestId('group-policy-card').getByText('群组策略规则')).toBeVisible();
    // 群组管理卡片一（html_spec 对齐后为 CardTitle，不再是页级 heading）
    await expect(authenticatedPage.getByTestId('groups-card').getByText('群组管理').first()).toBeVisible();
  });

  test('new-policy and preview-path buttons visible', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByRole('button', { name: /新建群组策略/ })).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: /有效执行路径预览/ })).toBeVisible();
  });

  test('create + list + delete a group policy via drawer', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-gp-${uniqueSuffix()}`;

    // 租户选择已由本 describe 的 beforeEach 完成（osg_viewer=tenant + 选中
    // 最低 id 租户）；这里复用同一租户，把源群组作用到同租户以便服务端
    // target 校验解析。
    const tenantId = api.getTenantId()!;

    const ipGroupResp = await api.post('/unified-rules', {
      name: `${unique}-ip`,
      rule_class: 'tag',
      stage: 'onconnect',
      condition_tree: { type: 'condition', field: 'client_ip', operator: 'within', value: '5.5.5.5' },
      tags: [`grp:${unique}-ip`],
      priority: 100,
      is_active: true,
      page: 'groups',
      metadata: { group_type: 'ip' },
      tenant_id: tenantId,
    });
    expect(ipGroupResp.ok()).toBeTruthy();
    const ipGroup = await ipGroupResp.json();

    await authenticatedPage.getByRole('button', { name: /新建群组策略/ }).click();
    await authenticatedPage.getByTestId('group-policy-drawer-name').fill(unique);

    // 三栏抽屉：左栏「发信IP组」单选 Select（html_spec 对齐后每类单选）
    await authenticatedPage.getByTestId('group-policy-target-ip').click();
    await authenticatedPage.getByRole('option', { name: `${unique}-ip` }).click();

    await authenticatedPage.getByTestId('group-policy-drawer-priority').fill('150');

    // Only wired stages (content/advancedRules/mailMarking) accept a "disable"
    // verdict; reserved stages reject it with 400 (server
    // validateGroupPolicyStagePolicies / wiredGroupPolicyStageKeys). senderFilter
    // is wired too but folded into the read-only 全局统一管控 card per the demo
    // canvas, so exercise 内容规则 (content) instead: click its canvas card to
    // open the right-hand config panel, then pick 禁用.
    await authenticatedPage.getByTestId('group-policy-card-content').click();
    await authenticatedPage.getByTestId('group-policy-status-content-disable').check();

    await authenticatedPage.getByTestId('group-policy-drawer-save').click();

    // exact: true so the policy cell (unique) is not confused with the source
    // IP group cell (`${unique}-ip`), which also renders on this page.
    await expect(authenticatedPage.getByRole('cell', { name: unique, exact: true })).toBeVisible({ timeout: 10000 });

    // Query the round-trip in the SAME tenant scope the drawer saved into.
    // This used to null the tenant on the assumption that the console saves
    // group policies platform-wide, but guardGroupPolicyTenant (group_policy.go)
    // now requires the rule's tenant to equal the active tenant -- a policy
    // authored from a tenant context IS tenant-scoped, so an all-tenants query
    // no longer returns it and the round-trip assertion read `undefined`.
    // (The UI row assertion above already passed, i.e. the save itself worked.)
    const listResp = await api.get(`/unified-rules?rule_class=tag&page=group_policy`);
    const listData = await listResp.json();
    const created = ((listData.items || []) as RuleListItem[]).find(r => r.name === unique);
    expect(created, `group policy ${unique} should round-trip via API`).toBeTruthy();

    if (created) {
      await api.delete(`/unified-rules/${created.id}`);
    }
    await api.delete(`/unified-rules/${ipGroup.id}`);
  });
});

// GT-11942: QC reported the whole "群组策略规则" section as absent when logged
// in as a tenant admin — the section title, its two action buttons, and the
// policy table. It is present (the section mounted in abca02d7, a day before
// the ticket was filed); the report came from a stale test image. The suite
// above only ever exercised the system admin, so nothing pinned the tenant
// admin's view. This does.
test.describe('group policy - tenant_admin visibility (GT-11942)', () => {
  const API_BASE = 'http://localhost:18080/api/v1';
  let tenantId: number;
  let tenantUserId: number;
  let adminToken: string;
  const tenantUsername = `e2e-gp-tenant-${uniqueSuffix()}`;
  const tenantPassword = 'TenantPass123!';

  test.beforeAll(async ({ request }) => {
    const loginResp = await request.post(`${API_BASE}/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    });
    adminToken = (await loginResp.json()).token;

    const tenantResp = await request.post(`${API_BASE}/tenants`, {
      data: { name: `gp-tenant-${uniqueSuffix()}`, code: `gp-${uniqueSuffix()}` },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(tenantResp.ok()).toBeTruthy();
    const tenant = await tenantResp.json();
    tenantId = (tenant.tenant ?? tenant).id;

    const userResp = await request.post(`${API_BASE}/users`, {
      data: {
        username: tenantUsername,
        password: tenantPassword,
        role: 'tenant_admin',
        role_id: await resolveTenantRoleID(API_BASE, adminToken),
        tenant_id: tenantId,
        must_change_password: false,
      },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(userResp.ok()).toBeTruthy();
    tenantUserId = (await userResp.json()).id;
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`${API_BASE}/users/${tenantUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await request.delete(`${API_BASE}/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill(tenantUsername);
    await page.locator('input[name="password"]').fill(tenantPassword);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    await page.goto('/zh/security/groups');
    await page.waitForLoadState('networkidle');
  });

  test('tenant_admin sees the group-policy section, not a 403', async ({ page }) => {
    await expect(page.getByText('403')).toHaveCount(0);
    await expect(page.getByText('群组策略规则').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /新建群组策略/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /有效执行路径预览/ })).toBeVisible();
  });

  test('tenant_admin sees the policy table columns', async ({ page }) => {
    for (const column of [/适用对象/, /策略配置/, /优先级/]) {
      await expect(page.getByRole('columnheader', { name: column })).toBeVisible();
    }
  });

  test('the group-management section renders above the policy section', async ({ page }) => {
    // html_spec filter-rules-group-policy（demo 实测）：卡片一为群组管理、
    // 卡片二为群组策略规则。此断言曾按早期 PRD 钉成「策略在上」，2026-07-18
    // 对齐 demo 后反转（design/implement/spec/2026-07-18-group-policy-html-spec-alignment.md D4-①）。
    const groups = await page.getByTestId('groups-card').boundingBox();
    const policy = await page.getByTestId('group-policy-card').boundingBox();
    expect(policy).not.toBeNull();
    expect(groups).not.toBeNull();
    expect(groups!.y).toBeLessThan(policy!.y);
  });
});
