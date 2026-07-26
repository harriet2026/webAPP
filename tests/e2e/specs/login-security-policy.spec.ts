import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { resolveTenantRoleID } from '../helpers/roles';
import { pickActiveTenantId } from '../helpers/tenant';

// GT-11959: login-security policy — platform baseline + per-tenant tightening.
//
// The load-bearing checks here are the ones a unit test cannot make:
//
//  1. A tenant admin can actually REACH the tab. They hold neither manage_tenants
//     nor manage_users, so before this feature they could not open /users at all.
//     Backend correctness is worth nothing if the page is unreachable.
//  2. Opening /users as a tenant admin produces NO 403. The admin-accounts query
//     used to fire unconditionally on mount, before any permission branch — so
//     merely widening access would have had every tenant admin eat a 403 on every
//     visit (and GT-12005/12008 already taught us what happens when a "not for this
//     viewer" 403 gets dressed up as a fault).
//  3. The server rejects an override weaker than the baseline. The UI greys those
//     options out, but that is UX; the boundary is server-side.

const APISERVER = process.env.APISERVER_BASE_URL || 'http://localhost:18080';

async function adminToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${APISERVER}/api/v1/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).token as string;
}

test.describe('Login security policy (GT-11959)', () => {
  test('platform admin sees the 登录安全 tab on /users', async ({ authenticatedPage: page }) => {
    await page.goto('/zh/users');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('users-tab-login-security')).toBeVisible();
    await page.getByTestId('users-tab-login-security').click();

    // Scope to the tab: 密码策略 also exists as a sidebar entry, so a page-wide
    // getByText is a strict-mode violation.
    const tab = page.getByTestId('login-security-tab');
    await expect(tab).toBeVisible();
    for (const section of ['密码策略', '登录控制', 'IP 访问控制', '单点登录限制']) {
      await expect(tab.getByRole('heading', { name: section })).toBeVisible();
    }
  });

  // The four-checkbox complexity control from the product design is deliberately
  // NOT built: the backend enforces "at least N of four classes", so ticking
  // "uppercase + special" would actually enforce "any 2 of 4" and a lowercase+digit
  // password would sail through the rule the admin thinks they set.
  test('complexity is an "at least N classes" dropdown, not four checkboxes', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/zh/users');
    await page.getByTestId('users-tab-login-security').click();
    const tab = page.getByTestId('login-security-tab');
    await expect(tab).toBeVisible();

    await expect(tab.getByLabel('密码复杂度要求')).toBeVisible();
    for (const label of ['大写字母', '小写字母', '特殊字符']) {
      await expect(tab.getByRole('checkbox', { name: label })).toHaveCount(0);
    }
  });

  // The security boundary. The UI greys weaker options out, but a caller talking to
  // the API directly is not running our JavaScript.
  test('the API rejects a tenant override weaker than the baseline', async ({ request }) => {
    const token = await adminToken(request);
    const auth = { Authorization: `Bearer ${token}` };

    // page_size=1 hands back ONE arbitrary tenant (the list is not id-ordered);
    // on a data-heavy dev DB that lone tenant is typically `pending`, so
    // pickActiveTenantId returns null and `?tenant_id=null` silently turns this
    // into a PLATFORM-baseline PUT (200) — the boundary under test never runs.
    const tl = await request.get(`${APISERVER}/api/v1/tenants?page_size=100`, { headers: auth });
    const tenantId = pickActiveTenantId((await tl.json()).items);
    expect(tenantId, 'need an active tenant to exercise the override boundary').not.toBeNull();

    // Capture the pre-test baseline so the finally-block can put it back
    // verbatim — this spec must not leave a mutated platform policy behind.
    const before = await request.get(`${APISERVER}/api/v1/security/login-policy`, { headers: auth });
    expect(before.ok()).toBeTruthy();
    const baselineBefore = ((await before.json()) as {
      baseline: { historyLimit: number; minLength: number };
    }).baseline;

    try {
      // Baseline: history = 3.
      const base = await request.put(`${APISERVER}/api/v1/security/login-policy`, {
        headers: auth,
        data: { historyLimit: 3, minLength: 10 },
      });
      expect(base.ok()).toBeTruthy();

      // historyLimit = 0 means "no history check at all" — the WEAKEST setting. A
      // naive numeric compare reads 0 as the largest value and would wave it through,
      // letting the tenant switch the check off while appearing to tighten it.
      const weak = await request.put(
        `${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`,
        { headers: auth, data: { historyLimit: 0 } },
      );
      expect(weak.status()).toBe(400);
      expect(await weak.text()).toContain('historyLimit');

      // A genuine tightening is accepted.
      const strong = await request.put(
        `${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`,
        { headers: auth, data: { historyLimit: 8, minLength: 16 } },
      );
      expect(strong.ok()).toBeTruthy();
      const body = await strong.json();
      expect(body.effective.historyLimit).toBe(8);
      expect(body.effective.minLength).toBe(16);
    } finally {
      // Restore, and ASSERT the restore took (a fire-and-forget PUT is not a
      // restore). `data: {}` is a silent no-op here — hasLayeredFields skips the
      // override upsert when every layered field is absent — which is exactly
      // how the minLength=16 override used to leak and 400 dashboard-tenant-kpi
      // 's user creation on the NEXT regression round. Neutralize the override
      // by writing baseline-equal values instead.
      const neutral = await request.put(
        `${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`,
        { headers: auth, data: { historyLimit: 3, minLength: 10 } },
      );
      expect(neutral.ok(), 'restore tenant override').toBeTruthy();
      const restoreBase = await request.put(`${APISERVER}/api/v1/security/login-policy`, {
        headers: auth,
        data: { historyLimit: baselineBefore.historyLimit, minLength: baselineBefore.minLength },
      });
      expect(restoreBase.ok(), 'restore platform baseline').toBeTruthy();
    }
  });

  // A tenant's whitelist must bite even when the platform baseline is `none` — the
  // configuration in which the first cut of this feature was completely inert
  // (the gate read the baseline's mode and let every IP on earth through).
  test('a tenant whitelist blocks a login from outside it', async ({ request }) => {
    const token = await adminToken(request);
    const auth = { Authorization: `Bearer ${token}` };

    // Create a dedicated tenant instead of grabbing /tenants?page_size=1's first
    // row. That listing is NOT ordered by id, so "the first tenant" was whatever
    // happened to land on page 1 — here a leftover 2fa-e2e tenant carrying a
    // 16-char password override, which rejected this test's password outright.
    // Worse, the test then WRITES an ipMode whitelist onto whichever tenant it
    // drew, mutating unrelated state. Owning the tenant makes both problems go away.
    const tenantSuffix = Date.now();
    const tenantResp = await request.post(`${APISERVER}/api/v1/tenants`, {
      headers: auth,
      data: { name: `pw-ipgate-tenant-${tenantSuffix}`, code: `pw-ipgate-${tenantSuffix}` },
    });
    expect(tenantResp.ok(), `create tenant: ${tenantResp.status()} ${await tenantResp.text()}`).toBeTruthy();
    const tenantBody = await tenantResp.json();
    const tenantId = (tenantBody.tenant ?? tenantBody).id as number;
    const username = `pw-ipgate-${tenantSuffix}`;
    // >= the platform baseline minLength (10) with room to spare, so a tenant
    // override cannot silently invalidate it the way the borrowed tenant did.
    const password = 'ProbePass@2026-LongEnough';

    const created = await request.post(`${APISERVER}/api/v1/users`, {
      headers: auth,
      data: {
        username,
        role: 'tenant_admin',
        role_id: await resolveTenantRoleID(APISERVER, token),
        tenant_id: tenantId,
        password,
        must_change_password: false,
      },
    });
    expect(created.ok()).toBeTruthy();
    const userId = (await created.json()).id as number;

    await request.put(`${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`, {
      headers: auth,
      data: { ipMode: 'whitelist' },
    });
    const rule = await request.post(
      `${APISERVER}/api/v1/security/login-policy/ip-rules?tenant_id=${tenantId}`,
      { headers: auth, data: { cidr: '10.1.0.0/16', remark: 'office' } },
    );
    expect(rule.ok()).toBeTruthy();
    const ruleId = (await rule.json()).id as number;

    try {
      const inside = await request.post(`${APISERVER}/api/v1/auth/login`, {
        headers: { 'X-Forwarded-For': '10.1.2.3' },
        data: { username, password },
      });
      expect(inside.status(), 'a login from inside the whitelist must succeed').toBe(200);

      const outside = await request.post(`${APISERVER}/api/v1/auth/login`, {
        headers: { 'X-Forwarded-For': '203.0.113.9' },
        data: { username, password },
      });
      expect(
        outside.status(),
        'a login from OUTSIDE the tenant whitelist must be 403. A 200 here means the gate read ' +
          'the BASELINE ipMode (none) instead of the tenant\'s, so the whitelist does nothing.',
      ).toBe(403);
      expect(await outside.text()).toContain('ip_not_allowed');
    } finally {
      await request.delete(
        `${APISERVER}/api/v1/security/login-policy/ip-rules/${ruleId}?tenant_id=${tenantId}`,
        { headers: auth },
      );
      await request.put(`${APISERVER}/api/v1/security/login-policy?tenant_id=${tenantId}`, {
        headers: auth,
        data: {},
      });
      await request.delete(`${APISERVER}/api/v1/users/${userId}`, { headers: auth });
      await request.delete(`${APISERVER}/api/v1/tenants/${tenantId}`, { headers: auth });
    }
  });
});
