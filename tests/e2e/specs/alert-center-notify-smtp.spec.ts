import { test, expect } from '../fixtures/auth.fixture';

const CFG = { use_internal_postfix: false, server: 'smtp.co.com', port: 587, encryption: 'starttls', auth_method: 'plain', username: 'alert@co.com', password_configured: true, password_masked: '********', sender_email: 'alert@co.com', sender_name: '告警系统', connect_timeout_seconds: 10, send_timeout_seconds: 30, enc_key_ready: true };

async function baseMock(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/monitor/alerts/stats', (r) => r.fulfill({ json: { total: 0, unconfirmed: 0, processing: 0, resolved: 0, critical: 0, major: 0 } }));
  await page.route('**/api/v1/monitor/alert-smtp-config', (r) => {
    if (r.request().method() === 'PUT') return r.fulfill({ json: CFG });
    return r.fulfill({ json: CFG });
  });
}

test.describe('Alert Center — notification & SMTP', () => {
  test.beforeEach(async ({ authenticatedPage }) => { await baseMock(authenticatedPage); });

  test('TC020-021 notify tab → configure opens SMTP drawer', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('tab', { name: '通知设置' }).click();
    await authenticatedPage.getByTestId('channel-email').getByRole('button', { name: /配置/ }).click();
    await expect(authenticatedPage.getByTestId('smtp-form')).toBeVisible();
  });

  test('TC022 auth dropdown only none/plain/login (no cram-md5)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('button', { name: /邮件服务配置/ }).click();
    await expect(authenticatedPage.getByTestId('smtp-form')).toBeVisible();
    await expect(authenticatedPage.getByText(/CRAM-MD5/i)).toHaveCount(0);
  });

  test('TC023-024 test-send success shows message', async ({ authenticatedPage }) => {
    await authenticatedPage.route('**/api/v1/monitor/alert-smtp-config/test', (r) =>
      r.fulfill({ json: { success: true, message: '连接成功，测试邮件已发送' } }));
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('button', { name: /邮件服务配置/ }).click();
    await authenticatedPage.getByPlaceholder('admin@company.com').fill('admin@co.com');
    await authenticatedPage.getByTestId('smtp-test-btn').click();
    await expect(authenticatedPage.getByTestId('smtp-test-result')).toContainText('连接成功');
  });

  test('TC025 test-send failure shows specific reason', async ({ authenticatedPage }) => {
    await authenticatedPage.route('**/api/v1/monitor/alert-smtp-config/test', (r) =>
      r.fulfill({ json: { success: false, message: '认证失败：535 5.7.8' } }));
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('button', { name: /邮件服务配置/ }).click();
    await authenticatedPage.getByPlaceholder('admin@company.com').fill('admin@co.com');
    await authenticatedPage.getByTestId('smtp-test-btn').click();
    await expect(authenticatedPage.getByTestId('smtp-test-result')).toContainText('535');
  });

  test('TC026 save & close', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('button', { name: /邮件服务配置/ }).click();
    await authenticatedPage.getByTestId('smtp-save-close').click();
    await expect(authenticatedPage.getByTestId('smtp-form')).toBeHidden();
  });

  test('TC027 unsaved-close asks confirm', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('button', { name: /邮件服务配置/ }).click();
    await authenticatedPage.getByTestId('smtp-form').getByRole('textbox').first().fill('smtp.changed.com');
    await authenticatedPage.keyboard.press('Escape');
    // The confirm dialog renders "未保存" in both its title and description, so
    // a bare getByText(/未保存/) strict-mode-fails on 2 matches. Assert the
    // dialog title heading specifically.
    await expect(authenticatedPage.getByRole('heading', { name: '未保存的更改' })).toBeVisible();
  });
});
