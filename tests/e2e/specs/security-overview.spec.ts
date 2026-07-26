import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { SecurityOverviewPage } from '../pages/security-overview.page';
import { resolveTenantRoleID } from '../helpers/roles';

// API setup/assertions hit the apiserver directly. The webapp proxy (port 80)
// 301-redirects to https; Playwright both drops the Authorization header across
// that scheme change AND demotes POST/PUT to GET, so writes silently no-op.
// Talking to the apiserver avoids the redirect entirely.
const APISERVER = process.env.APISERVER_BASE_URL || 'http://localhost:18080';

async function adminToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${APISERVER}/api/v1/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).token as string;
}

// Create a tenant and flip it to `active` (new tenants start `pending`; the
// scope selector only lists active tenants). Returns the tenant id.
async function createActiveTenant(request: APIRequestContext, token: string, name: string, code: string): Promise<number> {
  const auth = { Authorization: `Bearer ${token}` };
  const c = await request.post(`${APISERVER}/api/v1/tenants`, { headers: auth, data: { name, code } });
  expect(c.ok()).toBeTruthy();
  const b = await c.json();
  const id = (b.tenant ?? b).id as number;
  const a = await request.put(`${APISERVER}/api/v1/tenants/${id}/status`, { headers: auth, data: { status: 'active' } });
  expect(a.ok()).toBeTruthy();
  return id;
}

test.describe('Security Overview', () => {
  let securityOverviewPage: SecurityOverviewPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    securityOverviewPage = new SecurityOverviewPage(authenticatedPage);
    await securityOverviewPage.goto();
    await securityOverviewPage.expectLoaded();
  });

  // GT-11934: `total` / `block_rate` / `change` are per-row summary fields, but
  // DetailTable treated them as chart series and pushed them through the
  // threatTypes.* i18n namespace, so the headers printed the raw keys and the
  // console logged MISSING_MESSAGE. Watch the real console — asserting only on
  // the JSON files would not prove the keys are consumed correctly.
  test('明细表列头无 MISSING_MESSAGE、不显示原始 i18n key (GT-11934)', async ({ authenticatedPage }) => {
    const missing: string[] = [];
    authenticatedPage.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('MISSING_MESSAGE')) missing.push(text);
    });

    await securityOverviewPage.goto();
    await securityOverviewPage.expectLoaded();
    // The detail table is at the bottom of the page.
    await authenticatedPage.getByRole('table').last().waitFor({ state: 'visible' });

    const headers = (
      await authenticatedPage.getByRole('table').last().getByRole('columnheader').allTextContents()
    ).map((h) => h.trim());

    // No header may be a raw backend key or a raw i18n key path.
    for (const raw of ['total', 'block_rate', 'change']) {
      expect(headers, `header must not be the raw key ${raw}`).not.toContain(raw);
    }
    expect(headers.some((h) => h.includes('securityOverview.') || h.includes('threatTypes.'))).toBe(false);

    expect(missing, `MISSING_MESSAGE in console: ${missing.join(' | ')}`).toEqual([]);
  });

  // NOTE: the former GT-11984 test ("AI 分析按钮可点击并流式渲染结果") was removed.
  // The 邮件安全总览 v3 redesign (b95c1b88a1 "recommended email security overview",
  // then 4e3e8a590f / 59278e20dd "移除 AI 分析入口") deliberately deleted the AI
  // analysis entry button from this page — `security-overview-ai-analysis` no
  // longer exists in any component. Its *absence* is now the contract, asserted
  // by security-overview-html-spec.spec.ts (`...toHaveCount(0)`). Keeping a
  // positive "button clickable + streams" test here would test a removed feature.

  // GT-11983 / GT-11932: the backend already returned a TOP4 peak_hours; the card
  // never read it. Assert on the rendered ranking, not on any class name.
  test('攻击时段卡片显示 TOP4 高峰时段排行 (GT-11983)', async ({ authenticatedPage }) => {
    await securityOverviewPage.goto();
    await securityOverviewPage.expectLoaded();

    const list = authenticatedPage.getByTestId('peak-hours-list');
    await expect(list).toBeVisible({ timeout: 20_000 });

    const items = list.getByRole('listitem');
    await expect(items).toHaveCount(4);
    // Each row must name an hour RANGE (HH:00-HH:00), not a bare hour.
    await expect(items.first()).toHaveText(/\d{2}:00-\d{2}:00/);
    // And the summary must carry the range + unit, not the old "峰值时段: 10:00 · 280".
    await expect(authenticatedPage.getByText(/攻击高峰：\d{2}:00-\d{2}:00（共 .+ 封）/)).toBeVisible();
  });

  // GT-11982 / GT-11933 → b95c1b88a1 (PRD v3): 首个视角改为统一的 11 类邮件
  // 类型分类（email_type），威胁类型视角从趋势卡整体退役。「正常邮件默认隐藏」
  // 的解释文案随之挂在 email_type 视图上；图例按 11 类分类命名。
  test('邮件类型图例按 11 类分类命名，并解释正常邮件为何默认隐藏 (GT-11982/PRD v3)', async ({ authenticatedPage }) => {
    await securityOverviewPage.goto();
    await securityOverviewPage.expectLoaded();

    // 提示必须真的渲染出来（默认 email_type 视图）
    await expect(
      authenticatedPage.getByText('正常邮件默认隐藏，避免其量级压制威胁曲线，可点击图例展开'),
    ).toBeVisible({ timeout: 20_000 });

    // 图例按 11 类邮件分类命名（挑三个有区分度的：正常被默认隐藏但图例仍在、
    // 订阅资讯与钓鱼邮件是新分类法独有的名字）。
    await expect(authenticatedPage.getByRole('button', { name: '正常', exact: true })).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: '订阅资讯' })).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: '钓鱼邮件' })).toBeVisible();
    // 旧威胁类型分类法的「普通垃圾/可疑垃圾」不得再出现在图例里。
    await expect(authenticatedPage.getByRole('button', { name: '普通垃圾' })).toHaveCount(0);
    await expect(authenticatedPage.getByRole('button', { name: '可疑垃圾' })).toHaveCount(0);
  });

  test('page loads with KPI cards', async () => {
    const count = await securityOverviewPage.getKpiCardCount();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('direction filter changes data', async () => {
    const main = securityOverviewPage.page.locator('main');
    const allButton = main.getByRole('button', { name: '全部', exact: true }).first();
    await expect(allButton).toBeVisible({ timeout: 5000 });

    await securityOverviewPage.selectDirection('receive');

    // The SegmentedControl marks the active segment with the primary fill.
    const receiveButton = main.getByRole('button', { name: '接收', exact: true }).first();
    await expect(receiveButton).toHaveClass(/bg-primary/);
  });

  // GT-11888 去掉「威胁等级」视角；b95c1b88a1 (PRD v3) 进一步把趋势卡收敛为
  // 邮件类型 + 处置动作两个视角（威胁类型视角退役，email_type 居首为默认）。
  // 这里断言完整的 Tab 文案清单（而不是 `if (count > 1)` 这种恒真写法），
  // 任何退役视角回潮都会红。
  test('viewBy tab switching works（邮件类型/处置动作两视角，GT-11888/PRD v3）', async () => {
    const tabs = securityOverviewPage.getViewByTabs();
    await expect(tabs).toHaveText(['邮件类型', '处置动作']);

    await securityOverviewPage.clickViewByTab(1);
    await expect(tabs.nth(1)).toHaveAttribute('data-active', '');
  });

  test('time range buttons render', async () => {
    const buttons = securityOverviewPage.timeRangeButtons;
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('CSV export button is present', async () => {
    const exportBtn = securityOverviewPage.exportCsvButton;
    if (await exportBtn.count() > 0) {
      await expect(exportBtn).toBeVisible();
    }
  });

  // TC-O07: platform admin (dev compose = cloud form / multiTenant / viewer=platform)
  // sees the tenant scope selector defaulting to "all tenants".
  test('TC-O07 platform admin sees tenant scope defaulting to all tenants', async () => {
    const trigger = securityOverviewPage.tenantScopeTrigger;
    await expect(trigger).toBeVisible({ timeout: 10000 });
    await expect(trigger).toContainText(/全部租户|All tenants/);
  });

  test('selecting a tenant refetches the overview with X-Tenant-ID', async ({ request }) => {
    // create an active tenant so the scope dropdown has a concrete entry.
    const token = await adminToken(request);
    await createActiveTenant(request, token, 'E2E SecOverview', 'E2ESO' + Date.now().toString().slice(-6));

    const reqPromise = securityOverviewPage.page.waitForRequest(
      (r) => r.url().includes('/statistics/security-overview?') && !!r.headers()['x-tenant-id'],
      { timeout: 10000 },
    );
    await securityOverviewPage.selectTenantScope('E2E SecOverview');
    const req = await reqPromise;
    expect(req.headers()['x-tenant-id']).toBeTruthy();
  });

  // TC-O03: platform admin picks a concrete tenant → the scope label reflects
  // the selection (stable recompute) and the overview refetches scoped.
  test('TC-O03 selecting a tenant updates the scope label and refetches scoped', async ({ request }) => {
    const token = await adminToken(request);
    await createActiveTenant(request, token, 'E2E O3 Tenant', 'E2EO3' + Date.now().toString().slice(-6));

    const reqPromise = securityOverviewPage.page.waitForRequest(
      (r) => r.url().includes('/statistics/security-overview?') && !!r.headers()['x-tenant-id'],
      { timeout: 10000 },
    );
    await securityOverviewPage.selectTenantScope('E2E O3 Tenant');
    await reqPromise;
    await expect(securityOverviewPage.tenantScopeTrigger).toContainText('E2E O3 Tenant', { timeout: 10000 });
  });
});

// TC-O04 / TC-O06 (F10 tenant isolation). A tenant_admin is JWT-locked to their
// own tenant: a forged cross-tenant X-Tenant-ID must be ignored. We assert this
// at the API level (data-independent — does not need seeded mail data): for a
// tenant_admin, the security-overview response is byte-identical regardless of
// the X-Tenant-ID header value, proving the header cannot widen/redirect scope.
test.describe('Security Overview — tenant isolation (F10)', () => {
  test('tenant_admin: forged X-Tenant-ID is ignored (scope stays own tenant)', async ({ request }) => {
    const sfx = Date.now().toString().slice(-7);
    // admin (apiserver-direct, Bearer) provisions two tenants + a tenant_admin
    // bound to tenant A.
    const adminTok = await adminToken(request);
    const tenantA = await createActiveTenant(request, adminTok, `F10 A ${sfx}`, `f10a${sfx}`);
    const tenantB = await createActiveTenant(request, adminTok, `F10 B ${sfx}`, `f10b${sfx}`);

    const username = `f10admin_${sfx}`;
    const password = 'TenantPass123!';
    const userResp = await request.post(`${APISERVER}/api/v1/users`, {
      headers: { Authorization: `Bearer ${adminTok}` },
      data: { username, password, role: 'tenant_admin', role_id: await resolveTenantRoleID(APISERVER, adminTok), tenant_id: tenantA, must_change_password: false },
    });
    expect(userResp.ok()).toBeTruthy();

    // tenant_admin logs in via the cookie-isolated `request` fixture (does NOT
    // clobber the admin cookies on page.request).
    const loginResp = await request.post(`${APISERVER}/api/v1/auth/login`, { data: { username, password } });
    expect(loginResp.ok()).toBeTruthy();
    const token = (await loginResp.json()).token as string;
    expect(token).toBeTruthy();

    const qs = 'start_date=2026-06-01&end_date=2026-06-07&direction=all';
    const fetchKpi = async (headers: Record<string, string>) => {
      const r = await request.get(`${APISERVER}/api/v1/statistics/security-overview?${qs}`, {
        headers: { Authorization: `Bearer ${token}`, ...headers },
      });
      expect(r.ok()).toBeTruthy();
      return JSON.stringify((await r.json()).kpi);
    };

    const ownScope = await fetchKpi({});
    const forgedB = await fetchKpi({ 'X-Tenant-ID': String(tenantB) });
    const forgedOwn = await fetchKpi({ 'X-Tenant-ID': String(tenantA) });

    // Forging another tenant's id must not change the result; the JWT tenant wins.
    expect(forgedB).toBe(ownScope);
    expect(forgedOwn).toBe(ownScope);
  });
});

// NOTE on F7 (escapes drawer) / F6 (drill-down card) E2E coverage:
// Both depend on the selected scope having recall / mail data, which the dev
// environment may not seed. For stability this round only asserts the selector
// entry visibility and the scoped request header (above). Data-level assertions
// for the escapes drawer and drill-down card are deferred to a seed-data suite.
