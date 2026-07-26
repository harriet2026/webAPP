import { test, expect } from '../fixtures/auth.fixture';
import type { Page } from '@playwright/test';
import { pickActiveTenantId } from '../helpers/tenant';

// 测试模块总开关持久化：关闭后刷新页面，状态应保持关闭。
// 直接 URL 的页面（ip-filter / rbl / ip-frequency / similar-detection）可测，
// pipeline drawer 里的页面由各自 spec 覆盖。
//
// 覆盖 spec §8.2 / review 2.4：至少为每个 EnforcedBy 类型抽一个代表性页面。
// - unified:    ip_filter, rbl_filter
// - runtime:    ip_frequency
// - standalone: similar_detection  ← 本文件补的缺口（GT-12061 回归点）

const PAGES: Array<{ page: string; url: string; scope: 'global' | 'tenant' }> = [
  { page: 'ip_filter', url: '/zh/security/ip-filter', scope: 'global' },
  { page: 'rbl_filter', url: '/zh/rules/rbl', scope: 'global' },
  { page: 'ip_frequency', url: '/zh/security/ip-frequency', scope: 'global' },
  { page: 'similar_detection', url: '/zh/rules/similar-detection', scope: 'tenant' },
];

async function firstActiveTenant(page: Page): Promise<number> {
  const resp = await page.request.get('/api/v1/tenants?status=active&page_size=1');
  expect(resp.ok(), `list active tenants ${resp.status()}`).toBeTruthy();
  const tenantId = pickActiveTenantId((await resp.json()).items) ?? undefined;
  expect(tenantId, 'an active tenant is required for tenant-scoped module tests').toBeTruthy();
  return tenantId!;
}

async function selectTenant(page: Page, tenantId: number) {
  await page.evaluate((id) => {
    localStorage.setItem('osgateway_selected_tenant', String(id));
    document.cookie = `osg_selected_tenant=${id}; path=/; SameSite=Strict`;
    // 必须同时把视角切成 tenant：GT-12245 (feecfffd56) 起，平台视角会**主动清掉**
    // 残留的租户选择（见本文件 'platform viewer clears a stale tenant context'
    // 用例）。只写 selected_tenant 而不写 osg_viewer 的话，选择会被清空，租户级
    // 模块开关随即变成 aria-disabled + title="请先选择租户，再修改此模块"，
    // 点击直接超时。
    document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
  }, tenantId);
}

test('system_admin tenant viewer cannot turn a stage-1 action into a global write', async ({ authenticatedPage }) => {
  const tenantId = await firstActiveTenant(authenticatedPage);
  await authenticatedPage.evaluate((id) => {
    localStorage.setItem('osgateway_selected_tenant', String(id));
    document.cookie = `osg_selected_tenant=${id}; path=/; SameSite=Strict`;
    document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
  }, tenantId);

  await authenticatedPage.goto('/zh/security/ip-filter');
  await authenticatedPage.waitForLoadState('networkidle');
  const toggle = authenticatedPage.locator('[data-testid="master-switch-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 15000 });
  await expect(toggle).toBeDisabled();
});

test('system_admin platform viewer clears a stale tenant context before editing RBL', async ({ authenticatedPage }) => {
  const tenantId = await firstActiveTenant(authenticatedPage);
  await authenticatedPage.evaluate((id) => {
    // Reproduce a browser that was switched back to platform view while an old
    // tenant selection survived in local storage/cookies.
    localStorage.setItem('osgateway_selected_tenant', String(id));
    document.cookie = `osg_selected_tenant=${id}; path=/; SameSite=Strict`;
    document.cookie = 'osg_viewer=platform; path=/; SameSite=Strict';
  }, tenantId);

  await authenticatedPage.goto('/zh/rules/rbl');
  await authenticatedPage.waitForLoadState('networkidle');

  await expect(authenticatedPage.locator('[data-testid="master-switch-toggle"]')).toBeEnabled({ timeout: 15000 });
  await expect(authenticatedPage.getByPlaceholder(/rbl\.example\.com/i)).toBeEnabled();
  await expect
    .poll(() => authenticatedPage.evaluate(() => localStorage.getItem('osgateway_selected_tenant')))
    .toBeNull();
});

test('system_admin tenant viewer sends the selected tenant on module switch writes', async ({ authenticatedPage }) => {
  const tenantId = await firstActiveTenant(authenticatedPage);
  await authenticatedPage.evaluate((id) => {
    localStorage.setItem('osgateway_selected_tenant', String(id));
    document.cookie = `osg_selected_tenant=${id}; path=/; SameSite=Strict`;
    document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
  }, tenantId);

  // Observe the real browser request without mutating the shared backend used
  // by the developer's live page. The API-level A/B isolation test below owns
  // persistence coverage; this assertion pins the UI-to-API scope hand-off.
  await authenticatedPage.route('**/api/v1/security/modules/similar_detection', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.continue();
  });

  await authenticatedPage.goto('/zh/rules/similar-detection');
  await authenticatedPage.waitForLoadState('networkidle');
  const toggle = authenticatedPage.locator('[data-testid="master-switch-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 15000 });
  await expect(toggle).toBeEnabled();

  const putRequest = authenticatedPage.waitForRequest((request) =>
    request.method() === 'PUT' && request.url().endsWith('/api/v1/security/modules/similar_detection'),
  );
  await toggle.click();
  const request = await putRequest;
  expect(request.headers()['x-tenant-id']).toBe(String(tenantId));
});

for (const { page, url, scope } of PAGES) {
  test(`${page}: master switch persists across reload`, async ({ authenticatedPage }) => {
    if (scope === 'tenant') {
      await selectTenant(authenticatedPage, await firstActiveTenant(authenticatedPage));
    }
    await authenticatedPage.goto(url);
    await authenticatedPage.waitForLoadState('networkidle');

    const toggle = authenticatedPage.locator('[data-testid="master-switch-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 15000 });

    // 先确保是启用状态（恢复可能的脏数据）
    const contentBefore = authenticatedPage.locator(`[data-testid="module-content-${page}"]`);
    const isEnabledBefore = await contentBefore.getAttribute('data-enabled');
    if (isEnabledBefore === 'false') {
      await toggle.click();
      await expect(authenticatedPage.locator('[data-testid="module-disabled-overlay"]')).toBeHidden();
    }

    // 关闭模块
    await toggle.click();
    await expect(
      authenticatedPage.locator(`[data-testid="module-content-${page}"]`),
    ).toHaveAttribute('data-enabled', 'false');

    // 刷新 — 纯 useState 的假开关会在这里复位为"启用"
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle');

    await expect(
      authenticatedPage.locator(`[data-testid="module-content-${page}"]`),
    ).toHaveAttribute('data-enabled', 'false');

    // 配置区不可交互
    await expect(
      authenticatedPage.locator(`[data-testid="module-content-${page}"]`),
    ).toHaveCSS('pointer-events', 'none');

    // 恢复，避免污染后续 spec
    await authenticatedPage.locator('[data-testid="master-switch-toggle"]').click();
    await expect(
      authenticatedPage.locator(`[data-testid="module-content-${page}"]`),
    ).toHaveAttribute('data-enabled', 'true');
  });
}

// 写操作必须打绝对的 apiserver 地址，不能走相对路径（即 webapp origin）。
// runner 把 PLAYWRIGHT_BASE_URL 设为 http://localhost，而 webapp 会把 http 301
// 重定向到 https —— 301 会把 POST/PUT **降级成 GET**（HTTP 语义），于是：
//   POST /tenants  → 变成 GET /tenants → 200 {items:[…]}，没有 .tenant
//                    → "Cannot read properties of undefined (reading 'id')"
//   PUT  …/status  → 变成 GET → 200 → resp.ok() 为真，但**根本没写进去**
// 后者更危险：断言看着是绿的，实际什么都没发生。读操作不受影响（GET→GET），
// 所以只有这个用例暴露出来。直连 apiserver 即可绕开整个重定向。
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:18080/api/v1';

async function apiToken(page: Page): Promise<string> {
  const resp = await page.request.post(`${API_BASE_URL}/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(resp.ok(), `login: ${resp.status()}`).toBeTruthy();
  return (await resp.json()).token as string;
}

test('tenant-scoped switch follows the selected tenant without leaking A/B state', async ({ authenticatedPage }) => {
  const suffix = Date.now().toString(36);
  const token = await apiToken(authenticatedPage);
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const createTenant = async (label: string) => {
    const resp = await authenticatedPage.request.post(`${API_BASE_URL}/tenants`, {
      headers: authHeaders,
      data: { name: `secmod-pw-${label}-${suffix}`, code: `secmod-pw-${label}-${suffix}` },
    });
    expect(resp.ok(), `create tenant ${label}: ${resp.status()}`).toBeTruthy();
    const tenantId = (await resp.json()).tenant.id as number;
    const activated = await authenticatedPage.request.put(`${API_BASE_URL}/tenants/${tenantId}/status`, {
      headers: { ...authHeaders, 'X-Tenant-ID': String(tenantId) },
      data: { status: 'active' },
    });
    expect(activated.ok(), `activate tenant ${label}: ${activated.status()}`).toBeTruthy();
    // 确认真的激活了：301 降级成 GET 时 ok() 同样为真，只有回读才能区分。
    const check = await authenticatedPage.request.get(`${API_BASE_URL}/tenants/${tenantId}`, {
      headers: { ...authHeaders, 'X-Tenant-ID': String(tenantId) },
    });
    expect(check.ok(), `read back tenant ${label}: ${check.status()}`).toBeTruthy();
    expect((await check.json()).status, `tenant ${label} must be active`).toBe('active');
    return tenantId;
  };

  const tenantA = await createTenant('a');
  const tenantB = await createTenant('b');
  try {
    for (const [tenantId, enabled] of [[tenantA, false], [tenantB, true]] as const) {
      const updated = await authenticatedPage.request.put(
        `${API_BASE_URL}/security/modules/similar_detection`,
        {
          headers: { ...authHeaders, 'X-Tenant-ID': String(tenantId) },
          data: { enabled },
        },
      );
      expect(updated.ok(), `set tenant ${tenantId}: ${updated.status()}`).toBeTruthy();
    }

    await selectTenant(authenticatedPage, tenantA);
    await authenticatedPage.goto('/zh/rules/similar-detection');
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(
      authenticatedPage.locator('[data-testid="module-content-similar_detection"]'),
    ).toHaveAttribute('data-enabled', 'false');

    await selectTenant(authenticatedPage, tenantB);
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(
      authenticatedPage.locator('[data-testid="module-content-similar_detection"]'),
    ).toHaveAttribute('data-enabled', 'true');
  } finally {
    // 同样走绝对地址：相对路径的 DELETE 会被 301 降级成 GET，租户根本删不掉，
    // 每跑一次就往库里多留两个租户（tenant 列表已被历次 E2E 堆到上千条）。
    for (const tenantId of [tenantA, tenantB]) {
      await authenticatedPage.request.delete(`${API_BASE_URL}/tenants/${tenantId}`, {
        headers: { ...authHeaders, 'X-Tenant-ID': String(tenantId) },
      });
    }
  }
});
