import { test, expect } from '../fixtures/auth.fixture';
import { UsersPage } from '../pages/users.page';
import { uniqueSuffix } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';

const API_BASE = 'http://localhost:18080/api/v1';

// GT-12307/12309/12313 对齐原型后本 spec 的前置随之更新：
//  - 创建抽屉的姓名/手机号/邮箱/初始密码为必填（12307）；
//  - 平台视角角色下拉只含平台作用域角色，建租户账号走"选择租户后在
//    租户视角创建"或 API（12309），故 GT-12021 的租户名渲染断言改用
//    API 播种租户账号；
//  - 编辑时用户名不可修改（12313），编辑用例改为改姓名并正面锁定
//    用户名输入框 disabled。
test.describe.serial('Users CRUD', () => {
  const platformUsername = `e2e_user_${uniqueSuffix()}`;
  const tenantScopedUsername = `e2e_tuser_${uniqueSuffix()}`;
  const testPassword = 'TestPass123!';
  let tenantId: number;
  let tenantName: string;
  let token = '';

  test('page loads with table', async ({ authenticatedPage }) => {
    const page = new UsersPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();
    await expect(page.table).toBeVisible();
  });

  test('create platform user via dialog (required fields + platform-only roles)', async ({ authenticatedPage }) => {
    token = (await authenticatedPage.evaluate(() => localStorage.getItem('osgateway_token'))) || '';

    const page = new UsersPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    await page.openCreateDialog();
    // GT-12318：不再提供"首登强制改密"开关（平台视角也已移除）——统一显示固定提示，
    // 新账号一律强制首登改密。
    await expect(authenticatedPage.locator('[data-testid="user-must-change-checkbox"]')).toHaveCount(0);
    await expect(authenticatedPage.locator('[data-testid="tenant-must-change-notice"]')).toBeVisible();

    // GT-12309：平台视角角色下拉不得混入租户作用域角色。
    await authenticatedPage.getByTestId('new-admin-role-select').click();
    const options = authenticatedPage.getByRole('option');
    await expect(options.filter({ hasText: '系统管理员' }).first()).toBeVisible();
    await expect(options.filter({ hasText: '安全运营' })).toHaveCount(0);
    await options.filter({ hasText: '系统管理员' }).first().click();

    const dialog = page.dialog;
    await dialog.locator('input[name="username"]').fill(platformUsername);
    await dialog.locator('input[name="password"]').fill(testPassword);
    // GT-12307：姓名/手机号/邮箱现在是创建必填项。
    await dialog.locator('input[name="name"]').fill('E2E 平台账号');
    await dialog.getByTestId('new-admin-phone').fill('13800138000');
    await dialog.locator('input[name="email"]').fill(`${platformUsername}@test.local`);
    await page.submitForm();
    await waitForToast(authenticatedPage);
    await page.expectUserInTable(platformUsername);

    const row = page.findRowByUsername(platformUsername);
    await expect(row).toBeVisible();
    // 默认勾选首登改密 → 行上出现改密徽标。
    await expect(row.locator('[data-testid^="user-must-change-badge-"]')).toBeVisible();
  });

  test('tenant account renders tenant NAME in the 租户 column (GT-12021)', async ({ authenticatedPage }) => {
    // 平台视角直接建租户账号的抽屉路径已按原型收敛（GT-12309），
    // 这里通过 API 播种租户账号，仍在真实表格上断言租户名渲染。
    //
    // GT-12393 (196cdf67ff)：平台视角的 GET /users 只回平台账号（SQL 作用域隔离，
    // 租户账号不再出现在平台列表里）。租户名渲染路径因此只在租户视角可达 ——
    // 激活租户后以双 cookie 冒充进入租户视角再断言。
    tenantName = `tenant_user_${uniqueSuffix()}`;
    const tenantResp = await authenticatedPage.request.post(`${API_BASE}/tenants`, {
      data: { name: tenantName, code: `user-${uniqueSuffix()}` },
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    expect(tenantResp.status()).toBe(201);
    const tenantBody = await tenantResp.json();
    tenantId = (tenantBody.tenant ?? tenantBody).id;

    // pending 租户既选不进租户视角，也会被平台视角的 reconciliation 清掉。
    const activated = await authenticatedPage.request.put(`${API_BASE}/tenants/${tenantId}/status`, {
      data: { status: 'active' },
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    expect([200, 204]).toContain(activated.status());

    const rolesResp = await authenticatedPage.request.get(`${API_BASE}/roles`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(rolesResp.status()).toBe(200);
    const roles = (await rolesResp.json()).items as { id: number; scope: string; isSystemDefault: boolean }[];
    const tenantRole = roles.find((r) => r.scope === 'tenant' && r.isSystemDefault);
    expect(tenantRole).toBeTruthy();

    const createResp = await authenticatedPage.request.post(`${API_BASE}/users`, {
      data: {
        username: tenantScopedUsername,
        password: testPassword,
        role_id: tenantRole!.id,
        tenant_id: tenantId,
      },
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    expect(createResp.status()).toBe(201);

    // 冒充 = 两个 cookie 一步写完（GT-12245：平台视角不保留租户选择）。
    await authenticatedPage.evaluate((id) => {
      document.cookie = `osg_selected_tenant=${id}; path=/; SameSite=Strict`;
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
      localStorage.setItem('osgateway_selected_tenant', String(id));
    }, tenantId);
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);

    try {
      const page = new UsersPage(authenticatedPage);
      await page.goto();
      await page.expectLoaded();
      await page.expectUserInTable(tenantScopedUsername);
      const row = page.findRowByUsername(tenantScopedUsername);
      // GT-12021：租户列渲染租户名而不是裸 id。
      await expect(row).toContainText(tenantName);
    } finally {
      // 还原平台视角，避免污染同 worker 的后续用例。
      await authenticatedPage.evaluate(() => {
        document.cookie = 'osg_selected_tenant=; path=/; Max-Age=0';
        document.cookie = 'osg_viewer=; path=/; Max-Age=0';
        localStorage.removeItem('osgateway_selected_tenant');
      });
    }
  });

  test('用户列表显示姓名/邮箱/最后登录时间列 (GT-11960)', async ({ authenticatedPage }) => {
    const page = new UsersPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    const headers = (
      await page.table.locator('thead th').allTextContents()
    ).map((h) => h.trim());
    expect(headers.some((h) => h.includes('姓名') || h.toLowerCase().includes('name'))).toBe(true);
    expect(headers.some((h) => h.includes('邮箱') || h.toLowerCase().includes('email'))).toBe(true);
    expect(headers.some((h) => h.includes('最后登录') || h.toLowerCase().includes('last login'))).toBe(true);
    // 未翻译的裸键（users.xxx）不允许出现在表头。
    expect(headers.some((h) => h.includes('users.'))).toBe(false);
  });

  test('edit user via dialog (username immutable, GT-12313)', async ({ authenticatedPage }) => {
    const page = new UsersPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    await page.openEditDialog(platformUsername);
    // GT-12313：编辑模式下用户名输入框一律 disabled。
    await expect(page.dialog.locator('input[name="username"]')).toBeDisabled();
    const editedName = 'E2E 平台账号-已改名';
    await page.dialog.locator('input[name="name"]').fill(editedName);
    await page.submitForm();
    await waitForToast(authenticatedPage);

    const row = page.findRowByUsername(platformUsername);
    await expect(row).toBeVisible({ timeout: 5000 });
    await expect(row).toContainText(editedName);
  });

  test('delete user via dialog', async ({ authenticatedPage }) => {
    const page = new UsersPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    await page.deleteUser(platformUsername);
    await waitForToast(authenticatedPage);
    await expect(page.findRowByUsername(platformUsername)).not.toBeVisible({ timeout: 5000 });

    token = (await authenticatedPage.evaluate(() => localStorage.getItem('osgateway_token'))) || '';
    // 清理 API 播种的租户账号与租户。
    const usersResp = await authenticatedPage.request.get(`${API_BASE}/users`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const items = (await usersResp.json()).items as { id: number; username: string }[];
    const seeded = items.find((u) => u.username === tenantScopedUsername);
    if (seeded) {
      await authenticatedPage.request.delete(`${API_BASE}/users/${seeded.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
    }
    await authenticatedPage.request.delete(`${API_BASE}/tenants/${tenantId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  });
});
