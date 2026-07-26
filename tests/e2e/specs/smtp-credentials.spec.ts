import { test, expect } from '../fixtures/auth.fixture';
import { SMTPCredentialsPage } from '../pages/smtp-credentials.page';
import { uniqueSuffix } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';

const API_BASE = 'http://localhost:18080/api/v1';

test.describe.serial('SMTP Credentials CRUD', () => {
  const testUsername = `e2e_smtp_${uniqueSuffix()}`;
  const editedUsername = `${testUsername}_edited`;
  const testPassword = 'TestPass123!';
  let tenantId: number;
  let token = '';

  test('page loads with table', async ({ authenticatedPage }) => {
    const page = new SMTPCredentialsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();
    await expect(page.table).toBeVisible();
  });

  test('create credential via dialog', async ({ authenticatedPage }) => {
    token = (await authenticatedPage.evaluate(() => localStorage.getItem('osgateway_token'))) || '';

    const tenantResp = await authenticatedPage.request.post(`${API_BASE}/tenants`, {
      data: { name: `tenant_smtp_${uniqueSuffix()}`, code: `smtp-${uniqueSuffix()}` },
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    expect(tenantResp.status()).toBe(201);
    const tenantBody = await tenantResp.json();
    tenantId = (tenantBody.tenant ?? tenantBody).id;

    const page = new SMTPCredentialsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();

    await page.openCreateDialog();
    await page.fillCreateForm({
      username: testUsername,
      password: testPassword,
      tenantId: tenantId,
      authBackend: 'local',
    });
    await page.submitForm();
    await waitForToast(authenticatedPage);
    await page.search(testUsername);
    await page.expectCredentialInTable(testUsername);

    const row = page.findRowByUsername(testUsername);
    await expect(row).toBeVisible();
    await expect(row).toContainText('local');
  });

  test('edit credential via dialog', async ({ authenticatedPage }) => {
    const page = new SMTPCredentialsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();
    await page.search(testUsername);

    await page.openEditDialog(testUsername);
    await page.fillEditForm({ username: editedUsername });
    await page.submitEditForm();
    await waitForToast(authenticatedPage);
    await page.search(editedUsername);
    await page.expectCredentialInTable(editedUsername);
  });

  test('reset password dialog opens and accepts input', async ({ authenticatedPage }) => {
    const page = new SMTPCredentialsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();
    await page.search(editedUsername);

    await page.openResetPasswordDialog(editedUsername);
    await expect(page.dialog).toBeVisible();

    await page.fillResetPassword('NewPass456!');
    await page.submitResetPassword();
    await waitForToast(authenticatedPage);
    await expect(page.dialog).not.toBeVisible();
  });

  test('delete credential via dialog', async ({ authenticatedPage }) => {
    const page = new SMTPCredentialsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();
    await page.search(editedUsername);

    await page.deleteCredential(editedUsername);
    await waitForToast(authenticatedPage);
    await expect(page.findRowByUsername(editedUsername)).not.toBeVisible({ timeout: 5000 });

    token = (await authenticatedPage.evaluate(() => localStorage.getItem('osgateway_token'))) || '';
    await authenticatedPage.request.delete(`${API_BASE}/tenants/${tenantId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  });
});
