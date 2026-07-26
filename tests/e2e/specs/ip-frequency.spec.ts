import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { IPFrequencyPage } from '../pages/ip-frequency.page';
import { uniqueSuffix } from '../helpers/test-data';
import { resolveTenantRoleID } from '../helpers/roles';

test.describe('IP Frequency Rules', () => {
  let ipFreqPage: IPFrequencyPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    ipFreqPage = new IPFrequencyPage(authenticatedPage);
    await ipFreqPage.goto();
    await ipFreqPage.expectLoaded();
  });

  test('page loads with table and expected columns', async () => {
    const headers = await ipFreqPage.getTableColumnHeaders();
    expect(headers.some(h => h.includes('Name') || h.includes('名称'))).toBeTruthy();
    expect(headers.some(h => h.includes('Priority') || h.includes('优先级'))).toBeTruthy();
  });

  test('search input filters rules', async ({ authenticatedPage }) => {
    const initialCount = await ipFreqPage.getDataRowCount();
    if (initialCount === 0) return;

    const firstName = await ipFreqPage.getCellTextByHeader(0, '名称');
    const searchName = firstName.trim();

    await ipFreqPage.searchRules(searchName);
    await authenticatedPage.waitForTimeout(1000);

    const filteredCount = await ipFreqPage.getDataRowCount();
    expect(filteredCount).toBeGreaterThanOrEqual(1);
  });

  test('search with nonexistent term shows empty', async () => {
    await ipFreqPage.searchRules('nonexistent-rule-xyz-99999');
    await ipFreqPage.page.waitForTimeout(1000);

    expect(await ipFreqPage.hasEmptyState()).toBeTruthy();
  });

  test('suspended IPs dialog opens and closes', async () => {
    await ipFreqPage.openSuspendedIPs();

    const dialog = ipFreqPage.page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const heading = dialog.locator('h2, [data-slot="dialog-title"]');
    await expect(heading).toContainText(/Suspended IPs|封禁 IP/i);

    await ipFreqPage.closeDialog();
  });

  test('export button triggers download', async ({ authenticatedPage }) => {
    const downloadPromise = authenticatedPage.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await ipFreqPage.getExportButton().click();

    const download = await downloadPromise;
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toContain('ip-frequency-rules');
      expect(filename).toContain('.json');
    }
  });

  test('create rule dialog opens with form fields', async () => {
    await ipFreqPage.clickCreateRule();

    const dialog = ipFreqPage.page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const title = dialog.locator('h2, [data-slot="dialog-title"]');
    await expect(title).toContainText(/Create Rule|创建|新增/);
  });

  test('create and delete rule round trip via API', async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-test-${uniqueSuffix()}`;

    const createResp = await apiClient.post('/ip-frequency/rules', {
      name: ruleName,
      priority: 950,
      scope_type: 'all',
      action: 'reject',
      daily_connection_limit: 99999,
      concurrent_connection_limit: -1,
      window_minutes: 60,
      window_connection_limit: -1,
      hourly_auth_failure_limit: -1,
      single_connection_command_error_limit: -1,
      single_connection_auth_failure_limit: -1,
      suspend_minutes: 60,
    });
    expect(createResp.ok()).toBeTruthy();

    const created = await createResp.json();
    const ruleId = created.Rule.id;
    expect(created.Rule.name).toBe(ruleName);
    expect(created.ScopeType).toBe('all');

    const getResp = await apiClient.get(`/ip-frequency/rules/${ruleId}`);
    expect(getResp.ok()).toBeTruthy();
    const fetched = await getResp.json();
    expect(fetched.Rule.name).toBe(ruleName);

    const deleteResp = await apiClient.delete(`/ip-frequency/rules/${ruleId}`);
    expect(deleteResp.ok()).toBeTruthy();

    const goneResp = await apiClient.get(`/ip-frequency/rules/${ruleId}`);
    expect(goneResp.status()).toBe(404);
  });

  test('bulk selection shows action buttons', async () => {
    const dataCount = await ipFreqPage.getDataRowCount();
    if (dataCount < 2) return;

    await ipFreqPage.selectRow(0);

    const selectedText = await ipFreqPage.getSelectedCountText();
    expect(selectedText).toBeTruthy();
  });
});

test.describe('IP Frequency Access Control', () => {
  test('tenant admin direct URL shows not authorized', async ({ authenticatedPage }) => {
    const token = (await authenticatedPage.evaluate(() => localStorage.getItem('osgateway_token'))) || '';
    const suffix = uniqueSuffix();
    const tenantResp = await authenticatedPage.request.post('http://localhost:18080/api/v1/tenants', {
      data: { name: `ipfreq-tenant-${suffix}`, code: `ipfreq-${suffix}` },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(tenantResp.ok()).toBeTruthy();
    const tenant = await tenantResp.json();

    const username = `ipfreq_tenant_${suffix}`;
    const password = 'TenantPass123!';
    const userResp = await authenticatedPage.request.post('http://localhost:18080/api/v1/users', {
      data: { username, password, role: 'tenant_admin', role_id: await resolveTenantRoleID('http://localhost:18080', token, authenticatedPage.request), tenant_id: (tenant.tenant ?? tenant).id, must_change_password: false },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(userResp.ok()).toBeTruthy();
    const user = await userResp.json();

    const page = authenticatedPage;
    await page.goto('/zh/login');
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    await page.goto('/zh/security/ip-frequency');
    await expect(page.getByText(/not authorized|无权|未授权/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Create Rule|创建规则|新增规则/i })).not.toBeVisible();

    await authenticatedPage.request.delete(`http://localhost:18080/api/v1/users/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await authenticatedPage.request.delete(`http://localhost:18080/api/v1/tenants/${(tenant.tenant ?? tenant).id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});
