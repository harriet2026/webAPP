import { test, expect } from '../fixtures/auth.fixture';
import { TenantsPage } from '../pages/tenants.page';
import { uniqueSuffix } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:18080';

async function adminToken(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!r.ok) throw new Error(`admin login failed: ${r.status}`);
  return (await r.json()).token;
}

/**
 * Spec 2A — Tenant Management UI.
 *
 * Serial CRUD with API-side cleanup in `afterAll` (there is no delete-tenant
 * UI button). Each run uses unique name+code so concurrent / re-runs don't
 * collide on the unique `code` index.
 *
 * Impersonate ("Manage") is intentionally NOT in this flow — it swaps
 * viewer+tenant cookies and navigates to /dashboard, polluting subsequent
 * tests' session state. See spec brief.
 */
test.describe.serial('Tenants CRUD (Spec 2A)', () => {
  const suffix = uniqueSuffix();
  const testTenantName = `e2e_tenant_${suffix}`;
  const testTenantCode = `e2e${suffix.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const editedTenantName = `${testTenantName}_edited`;
  let createdTenantId: number | null = null;

  test.afterAll(async () => {
    if (createdTenantId === null) return;
    try {
      const token = await adminToken();
      const r = await fetch(`${API_BASE}/api/v1/tenants/${createdTenantId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      // 204 = deleted; 404 = already gone (e.g. previous run cleanup raced).
      if (!r.ok && r.status !== 404) {
        // eslint-disable-next-line no-console
        console.warn(`afterAll: delete tenant ${createdTenantId} -> ${r.status}`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('afterAll: cleanup failed', err);
    }
  });

  test('page loads with stats cards and table', async ({ authenticatedPage }) => {
    const page = new TenantsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    // Stats grid: 4 cards rendered (total / active / pending / awaitingRouting).
    const cards = page.statsGrid().locator(':scope > div');
    await expect(cards).toHaveCount(4, { timeout: 10000 });
    await expect(cards.first()).toBeVisible();

    // Tenant table is rendered.
    await expect(page.table).toBeVisible();
  });

  test('create tenant via drawer (name + code)', async ({ authenticatedPage }) => {
    const page = new TenantsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    await page.openCreateDrawer();
    await page.fillCreateForm({
      name: testTenantName,
      code: testTenantCode,
      // Spec 2A §5 requires ≥1 domain; provide a unique one.
      domains: [`${testTenantCode}.example.com`],
    });
    await page.submitDrawer();
    await waitForToast(authenticatedPage);

    // Row appears with both the code and the name visible.
    await page.expectTenantInTable(testTenantName);
    const row = page.findRowByName(testTenantName);
    await expect(row).toBeVisible();
    await expect(row).toContainText(testTenantCode);
    await expect(row).toContainText(testTenantName);

    // Stash the id for cleanup. The list endpoint gives us the authoritative id.
    const token = await adminToken();
    const r = await fetch(
      `${API_BASE}/api/v1/tenants?search=${encodeURIComponent(testTenantName)}&page_size=20`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) throw new Error(`lookup created tenant failed: ${r.status}`);
    const body = await r.json();
    const found = (body.items || []).find(
      (t: { name: string; code: string }) => t.name === testTenantName && t.code === testTenantCode,
    );
    if (!found) throw new Error('created tenant not found via API for id capture');
    createdTenantId = found.id;
  });

  test('edit tenant (rename; code read-only)', async ({ authenticatedPage }) => {
    // Depends on the create test having populated createdTenantId / row.
    test.skip(!createdTenantId, 'create test did not produce a tenant');

    const page = new TenantsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    await page.openEditDrawer(testTenantName);
    // code is read-only in edit mode
    await page.expectCodeReadOnly();
    await page.fillEditForm({ name: editedTenantName });
    await page.submitDrawer();
    await waitForToast(authenticatedPage);

    await page.expectTenantInTable(editedTenantName);
    const row = page.findRowByName(editedTenantName);
    await expect(row).toBeVisible();
    // code should still be the original
    await expect(row).toContainText(testTenantCode);
  });

  test('edit drawer shows primary admin + links to user management filtered by tenant', async ({
    authenticatedPage,
  }) => {
    test.skip(!createdTenantId, 'create test did not produce a tenant');

    const page = new TenantsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();
    await page.openEditDrawer(editedTenantName);

    const drawer = authenticatedPage.locator('[role="dialog"]');
    // §6: 主管理员 detail section is rendered. The test tenant has no
    // tenant_admin user, so it shows the "未设置" (none) placeholder.
    await expect(drawer.getByText('主管理员', { exact: true })).toBeVisible();
    await expect(drawer.getByText('未设置')).toBeVisible();

    // "在用户管理中查看" deep-links to /users pre-filtered by this tenant.
    await drawer.getByRole('link', { name: /在用户管理中查看/ }).click();
    await expect(authenticatedPage).toHaveURL(
      new RegExp(`/users\\?tenant=${createdTenantId}`),
    );
    await expect(authenticatedPage.getByTestId('user-tenant-filter')).toBeVisible();
  });

  test('status toggle suspend -> activate', async ({ authenticatedPage }) => {
    test.skip(!createdTenantId, 'create test did not produce a tenant');

    // Newly created tenants start in `pending`. The suspend/activate toggle
    // only makes sense from `active`, so promote the tenant to active first
    // (the status API accepts active/suspended; pending is create-only).
    const token = await adminToken();
    const toActive = await fetch(
      `${API_BASE}/api/v1/tenants/${createdTenantId}/status`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'active' }),
      },
    );
    if (!toActive.ok) {
      throw new Error(`reset tenant to active failed: ${toActive.status}`);
    }

    const page = new TenantsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    // suspend
    await page.suspend(editedTenantName);
    await waitForToast(authenticatedPage);
    {
      const row = await page.navigateToRow(editedTenantName);
      await expect(row).toContainText('已暂停', { timeout: 10000 });
    }

    // activate
    await page.activate(editedTenantName);
    await waitForToast(authenticatedPage);
    {
      const row = await page.navigateToRow(editedTenantName);
      await expect(row).toContainText('活跃', { timeout: 10000 });
    }
  });

  test('newly created tenant (pending) can be activated from list', async ({
    authenticatedPage,
  }) => {
    // Regression for GT-11560: a freshly created tenant starts in `pending`,
    // and the action column must show the "启用" (activate) button so admins
    // can flip pending -> active without falling back to the API.
    //
    // The backend SetTenantStatus endpoint only accepts {active, suspended}
    // (pending is the create-only initial state), so we cannot reuse the
    // shared serial tenant (which earlier tests already moved out of
    // pending). Instead we create a fresh tenant that is guaranteed to be in
    // pending and clean it up here.
    const suffix = uniqueSuffix();
    const pendingName = `e2e_pending_${suffix}`;
    const pendingCode = `e2epd${suffix.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    const page = new TenantsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    await page.openCreateDrawer();
    await page.fillCreateForm({
      name: pendingName,
      code: pendingCode,
      domains: [`${pendingCode}.example.com`],
    });
    await page.submitDrawer();
    await waitForToast(authenticatedPage);

    let pendingId: number | null = null;
    try {
      const row = await page.navigateToRow(pendingName);
      await expect(row).toContainText('待开通', { timeout: 10000 });

      // The activate button must be visible on a pending row (GT-11560).
      await expect(row.locator('button[title="启用"]')).toBeVisible();

      await page.activate(pendingName);
      await waitForToast(authenticatedPage);

      const activeRow = await page.navigateToRow(pendingName);
      await expect(activeRow).toContainText('活跃', { timeout: 10000 });

      // Capture id for cleanup.
      const token = await adminToken();
      const r = await fetch(
        `${API_BASE}/api/v1/tenants?search=${encodeURIComponent(pendingName)}&page_size=20`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (r.ok) {
        const body = await r.json();
        const found = (body.items || []).find(
          (t: { name: string; code: string }) =>
            t.name === pendingName && t.code === pendingCode,
        );
        pendingId = found ? found.id : null;
      }
    } finally {
      if (pendingId !== null) {
        const token = await adminToken();
        await fetch(`${API_BASE}/api/v1/tenants/${pendingId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  });
});
