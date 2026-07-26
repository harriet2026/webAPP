import { test, expect } from '@playwright/test';
import { resolveTenantRoleID } from '../helpers/roles';

// GT-12005 / GT-12008: on the tenant_admin dashboard every KPI read 0 and the
// 待办 panel read "当前无待办事项", because the dashboard fetched all sources in a
// single Promise.all and /inbound-audit (RequireSystemAdmin) 403s for tenants —
// one rejection zeroed the entire page even though /statistics/dashboard and
// /statistics/security-overview returned that tenant's real data.
//
// This spec drives the real browser as a real tenant_admin. It provisions its
// own user so it does not depend on whatever accounts happen to exist.
const API = 'http://localhost:18080/api/v1';
const TA_USER = `e2e_dash_ta_${Date.now()}`;
// 16+ chars: survives even a leaked minLength=16 tenant override (an upstream
// spec's unrestored tightening once 400'd this beforeAll on the second round).
const TA_PASS_INITIAL = 'InitPass123!Dash16';
const TA_PASS = 'DashPass456!Kpi16x';

test.describe('Dashboard tenant_admin KPIs (GT-12005 / GT-12008)', () => {
  test.beforeAll(async ({ request }) => {
    const login = await request.post(`${API}/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    });
    const { token } = (await login.json()) as { token: string };
    const auth = { Authorization: `Bearer ${token}` };

    const tenantsResp = await request.get(`${API}/tenants?page_size=500`, { headers: auth });
    const items = ((await tenantsResp.json()) as { items: { id: number; status: string }[] }).items;
    const tenant = items.filter((t) => t.status === 'active').sort((a, b) => a.id - b.id)[0];
    expect(tenant, 'need an active tenant').toBeTruthy();

    const created = await request.post(`${API}/users`, {
      headers: auth,
      data: {
        username: TA_USER,
        password: TA_PASS_INITIAL,
        role: 'tenant_admin',
        role_id: await resolveTenantRoleID(API, token),
        tenant_id: tenant.id,
      },
    });
    expect(created.status()).toBe(201);

    // New accounts are created with must_change_password=true.
    const first = await request.post(`${API}/auth/login`, {
      data: { username: TA_USER, password: TA_PASS_INITIAL },
    });
    const body = (await first.json()) as { need_change_pwd?: boolean; ticket?: string };
    if (body.need_change_pwd && body.ticket) {
      const forced = await request.post(`${API}/auth/password/forced-change`, {
        data: { ticket: body.ticket, new_password: TA_PASS },
      });
      expect(forced.ok()).toBeTruthy();
    }
  });

  test('KPI 卡片显示真实数据而不是全 0', async ({ page }) => {
    const forbidden: string[] = [];
    page.on('response', (r) => {
      if (r.status() === 403) forbidden.push(new URL(r.url()).pathname);
    });

    await page.goto('/zh/login');
    await page.locator('input[name="username"]').fill(TA_USER);
    await page.locator('input[name="password"]').fill(TA_PASS);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
    await page.goto('/zh/dashboard');

    // The 收信总量 KPI must reflect the tenant's real mail volume. Before the fix
    // it was a hard 0 because the whole combined query rejected. Locate the card
    // by its title and read the big number next to it.
    const inboundCard = page
      .locator('div')
      .filter({ has: page.getByText('收信总量', { exact: true }) })
      .last();
    await expect(inboundCard).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(
        async () => {
          const txt = (await inboundCard.textContent()) ?? '';
          // strip the title, keep the digits of the value
          return txt.replace(/[^0-9]/g, '');
        },
        { timeout: 25_000, message: '收信总量 must not stay 0 for a tenant with mail' },
      )
      .not.toBe('0');

    // A 403 on a platform-only source is allowed to happen; what must NOT happen
    // is the page reporting itself as failed because of it. (Whether the 403 is
    // actually observed depends on react-query caching, so it is logged, not
    // asserted — asserting an incidental fact would make this spec flaky.)
    if (forbidden.length) {
      console.log(`[GT-12005] tolerated 403s: ${forbidden.join(', ')}`);
    }
    await expect(page.getByText('系统状态数据加载失败')).toHaveCount(0);
  });
});
