import { test, expect } from '../fixtures/auth.fixture';
import { waitForToast } from '../helpers/wait';

// E2E for the system_admin password-policy settings page (design §5.1). Drives
// the two preset-tier dropdowns through the UI, saves, and verifies the change
// persisted via the API. Also pins the server-side tier enforcement (non-tier
// value → 400). RBAC (non-system_admin → 403) is covered by the Go dbtest
// TestPasswordPolicySettings_NonSystemAdminForbidden, so it is not duplicated here.

const API_BASE = 'http://localhost:18080/api/v1';
const AUTH = { username: 'admin', password: 'admin123' };

test.describe.serial('password policy settings page', () => {
  let token = '';

  test.beforeAll(async ({ request }) => {
    const resp = await request.post(`${API_BASE}/auth/login`, { data: AUTH });
    token = ((await resp.json()) as { token: string }).token;
  });

  test.afterAll(async ({ request }) => {
    // Restore shipped defaults so this test does not tighten policy for other
    // suites that create users / change passwords.
    await request.put(`${API_BASE}/security/password-policy`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { minLength: 10, minCharClasses: 2 },
    });
  });

  test('change tiers via UI and persist', async ({ authenticatedPage, request }) => {
    const page = authenticatedPage;
    await page.goto('/zh/system/password-policy');

    const combos = page.locator('.max-w-md [role="combobox"]');
    await expect(combos.first()).toBeVisible({ timeout: 10000 });

    // minLength → 12
    await combos.nth(0).click();
    await page.getByRole('option', { name: '12', exact: true }).click();
    // minCharClasses → 3
    await combos.nth(1).click();
    await page.getByRole('option', { name: '3', exact: true }).click();

    await page.locator('button:has(svg.lucide-save)').click();
    await waitForToast(page);

    // Verify persistence through the API (effective values reflect the write).
    const resp = await request.get(`${API_BASE}/security/password-policy`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.minLength).toBe(12);
    expect(body.minCharClasses).toBe(3);
  });

  test('server rejects a non-tier minLength', async ({ request }) => {
    const resp = await request.put(`${API_BASE}/security/password-policy`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { minLength: 11, minCharClasses: 2 },
    });
    expect(resp.status()).toBe(400);
  });
});
