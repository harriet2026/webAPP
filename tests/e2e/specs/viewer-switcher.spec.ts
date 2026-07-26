import { test, expect } from '../fixtures/auth.fixture';
import { uniqueSuffixAlnum } from '../helpers/test-data';
import { resolveTenantRoleID } from '../helpers/roles';

// Viewer switcher e2e: verifies the "登录视角" (Login View) section inside the
// product-form dropdown — the second section added for platform admins to flip
// between platform and tenant viewers, and the tenant-selection dialog flow
// when no tenant is selected yet.
//
// Pre-conditions (shared with product-form-switcher.spec.ts):
//   - OSGATEWAY_PRODUCT_FORM_SWITCHER=true (switcher visible)
//   - OSG_PRODUCT_FORM=cloud               (initial form = cloud)
//   - default user is admin/admin123 (system_admin)
//
// 状态隔离策略：viewer 切换会写 osg_viewer / osg_selected_tenant cookie，
// 可能污染后续 spec。但不能 clearCookies() —— 那会把登录态也清掉。改为
// 只清除这两个特定 cookie，保留 osgateway_auth / osgateway_token 登录态。

const VIEWER_LABELS = {
  platform: '平台管理员',
  tenant: '租户管理员',
} as const;

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:18080';

// ─── API helpers ─────────────────────────────────────────────────────────────

async function adminToken(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!r.ok) throw new Error(`admin login failed: ${r.status}`);
  return (await r.json()).token as string;
}

async function firstTenantId(token: string): Promise<number | null> {
  const r = await fetch(`${API_BASE}/api/v1/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const body = await r.json();
  // 必须是 active 租户：pending 租户选不上，selectedTenantId 恒为 null，
  // 于是「已有选中租户」这个前提根本立不住。列表不按 id 排序，跑过 Python E2E
  // 之后 items[0] 往往就是个 pending 的残留租户。
  const usable = (body.items ?? []).filter((t: { status?: string }) => t.status === 'active');
  if (!usable.length) return null;
  return usable.reduce((lo: { id: number }, t: { id: number }) => (t.id < lo.id ? t : lo)).id;
}

// 清除 viewer 相关 cookie，保留登录态（osgateway_token 是 HttpOnly，这里
// 的 document.cookie 操作不会碰到它）。
async function clearViewerCookies(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.cookie = 'osg_viewer=; path=/; Max-Age=0';
    document.cookie = 'osg_selected_tenant=; path=/; Max-Age=0';
    localStorage.removeItem('osgateway_selected_tenant');
  });
}

// 通过 evaluate 写 osg_selected_tenant cookie + localStorage（模拟
// TenantSelector 选租户），然后 reload 让 AuthContext 恢复 selectedTenantId。
async function setSelectedTenantCookie(page: import('@playwright/test').Page, tenantId: number) {
  await page.evaluate((id) => {
    document.cookie = `osg_selected_tenant=${id}; path=/; SameSite=Strict`;
    localStorage.setItem('osgateway_selected_tenant', String(id));
    // GT-12245 起，「平台视角 + 已选中租户」这个组合**不可达**：
    // product-form-context 的 reconciliation 会在 hydration 时把选择清掉
    // （平台视角绝不保留被冒充的租户）。所以要造出「已有选中租户」的前置状态，
    // 必须连视角一起写 —— 这也正是真实路径的样子（租户选择对话框是
    // setSelectedTenant → setViewer 一起做的，见 product-form-switcher.tsx）。
    document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
  }, tenantId);
  await page.reload();
  await page.waitForLoadState('networkidle');
}

test.describe('Viewer switcher (登录视角) inside product-form dropdown', () => {
  const switcherTrigger = (page: import('@playwright/test').Page) =>
    page.getByRole('button', { name: /^产品形态/ });

  const openDropdown = async (page: import('@playwright/test').Page) => {
    await switcherTrigger(page).click();
  };

  // 状态隔离：只清 viewer 相关 cookie，保留登录态。
  test.afterEach(async ({ authenticatedPage }) => {
    await clearViewerCookies(authenticatedPage);
  });

  test('renders viewer section with platform and tenant items (system_admin)', async ({ authenticatedPage }) => {
    await openDropdown(authenticatedPage);

    await expect(authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.platform })).toBeVisible();
    await expect(authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.tenant })).toBeVisible();
    await expect(authenticatedPage.getByText('登录视角', { exact: true })).toBeVisible();
  });

  test('default viewer=platform shows check on platform item', async ({ authenticatedPage }) => {
    await openDropdown(authenticatedPage);

    const platformItem = authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.platform });
    const tenantItem = authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.tenant });

    // 每项都有一个 lucide 图标（Building2 / User），所以不能断言"任意 svg"。
    // 选中态会额外渲染一个 lucide-check 图标，据此判断选中项。
    await expect(platformItem.locator('svg.lucide-check')).toBeVisible();
    await expect(tenantItem.locator('svg.lucide-check')).toHaveCount(0);
  });

  test('switching to tenant with an existing selectedTenant writes cookie + shows banner', async ({ authenticatedPage }) => {
    // 顶栏 dashboard 没有挂 TenantSelector，只在部分管理页渲染，所以不能通过
    // 点击 combobox 选租户。直接写 cookie + localStorage 后 reload。
    const token = await adminToken();
    const tenantId = await firstTenantId(token);
    expect(tenantId).not.toBeNull();
    await setSelectedTenantCookie(authenticatedPage, tenantId!);

    await openDropdown(authenticatedPage);
    await authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.tenant }).click();
    await authenticatedPage.waitForTimeout(400);

    const cookie = await authenticatedPage.evaluate(() => {
      const m = document.cookie.match(/(?:^|;\s*)osg_viewer=(platform|tenant)/);
      return m ? m[1] : null;
    });
    expect(cookie).toBe('tenant');

    await expect(authenticatedPage.getByText(/正在以租户.*管理员身份操作/)).toBeVisible();
  });

  test('switching to tenant with null selectedTenant opens the selection dialog', async ({ authenticatedPage }) => {
    await clearViewerCookies(authenticatedPage);
    await authenticatedPage.goto('/zh/dashboard');
    await authenticatedPage.waitForLoadState('networkidle');

    await openDropdown(authenticatedPage);
    await authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.tenant }).click();
    await authenticatedPage.waitForTimeout(400);

    await expect(authenticatedPage.getByRole('dialog')).toBeVisible();
    await expect(authenticatedPage.getByText('选择租户', { exact: true })).toBeVisible();
  });

  test('confirming the tenant dialog switches viewer and shows banner', async ({ authenticatedPage }) => {
    await clearViewerCookies(authenticatedPage);
    await authenticatedPage.goto('/zh/dashboard');
    await authenticatedPage.waitForLoadState('networkidle');

    await openDropdown(authenticatedPage);
    await authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.tenant }).click();
    await authenticatedPage.waitForTimeout(400);
    await expect(authenticatedPage.getByRole('dialog')).toBeVisible();

    const dialog = authenticatedPage.getByRole('dialog');
    await dialog.getByRole('combobox').click();
    const firstOption = authenticatedPage.getByRole('option').first();
    const firstName = ((await firstOption.textContent()) ?? '').trim();
    await firstOption.click();
    await dialog.getByRole('button', { name: '进入' }).click();
    await authenticatedPage.waitForTimeout(500);

    const cookie = await authenticatedPage.evaluate(() => {
      const m = document.cookie.match(/(?:^|;\s*)osg_viewer=(platform|tenant)/);
      return m ? m[1] : null;
    });
    expect(cookie).toBe('tenant');
    if (firstName) {
      await expect(authenticatedPage.getByText(firstName).first()).toBeVisible();
    }
  });

  test('exit via impersonation banner restores platform viewer', async ({ authenticatedPage }) => {
    const token = await adminToken();
    const tenantId = await firstTenantId(token);
    expect(tenantId).not.toBeNull();
    await setSelectedTenantCookie(authenticatedPage, tenantId!);

    await openDropdown(authenticatedPage);
    await authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.tenant }).click();
    await authenticatedPage.waitForTimeout(400);
    await expect(authenticatedPage.getByText(/正在以租户.*管理员身份操作/)).toBeVisible();

    await authenticatedPage.getByRole('button', { name: '退出代登录' }).click();
    await authenticatedPage.waitForTimeout(400);

    const cookie = await authenticatedPage.evaluate(() => {
      const m = document.cookie.match(/(?:^|;\s*)osg_viewer=(platform|tenant)/);
      return m ? m[1] : null;
    });
    expect(cookie).toBe('platform');
    await expect(authenticatedPage.getByText(/正在以租户.*管理员身份操作/)).toHaveCount(0);
  });

  test('switching product form does not affect the viewer section', async ({ authenticatedPage }) => {
    await openDropdown(authenticatedPage);
    await authenticatedPage.getByRole('menuitem', { name: '传统版·单租户' }).click();
    await authenticatedPage.waitForTimeout(400);

    await openDropdown(authenticatedPage);
    await expect(authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.platform })).toBeVisible();
    await expect(authenticatedPage.getByRole('menuitem', { name: VIEWER_LABELS.tenant })).toBeVisible();
  });

  test('tenant_admin sees the product-form trigger but no viewer section', async ({ browser }) => {
    // Create a tenant_admin user via API at runtime (does NOT modify init.sql).
    const token = await adminToken();
    const tenantId = await firstTenantId(token);
    if (tenantId == null) {
      test.skip(true, 'no tenant exists; cannot seed a tenant_admin');
      return;
    }
    const suffix = uniqueSuffixAlnum();
    const taUsername = `viewer_e2e_${suffix}`;
    const taPassword = 'TenantPass123!';
    const r = await fetch(`${API_BASE}/api/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        username: taUsername,
        password: taPassword,
        role: 'tenant_admin',
        role_id: await resolveTenantRoleID(API_BASE, token),
        tenant_id: tenantId,
        must_change_password: false,
      }),
    });
    if (!r.ok) {
      test.skip(true, `could not create tenant_admin user: ${r.status}`);
      return;
    }
    const userId = ((await r.json()) as { id: number }).id;

    try {
      const newContext = await browser.newContext();
      const page = await newContext.newPage();
      await page.goto('/zh/login?advance');
      await page.locator('input[name="username"]').fill(taUsername);
      await page.locator('input[name="password"]').fill(taPassword);
      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

      await expect(switcherTrigger(page)).toHaveCount(1);

      await switcherTrigger(page).click();
      await expect(page.getByRole('menuitem', { name: VIEWER_LABELS.platform })).toHaveCount(0);
      await expect(page.getByRole('menuitem', { name: VIEWER_LABELS.tenant })).toHaveCount(0);
      await expect(page.getByText('登录视角', { exact: true })).toHaveCount(0);

      await newContext.close();
    } finally {
      await fetch(`${API_BASE}/api/v1/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
