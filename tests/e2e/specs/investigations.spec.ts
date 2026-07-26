import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

function nowISOString() {
  return new Date().toISOString();
}

async function pollInvestigation(page: Page, taskId: string) {
  const token = await page.evaluate(() => window.localStorage.getItem('osgateway_token') || '');
  await expect.poll(async () => {
    const response = await page.request.get(`http://localhost:18080/api/v1/investigations/${taskId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok()) {
      return 'http_error';
    }
    const body = await response.json();
    return body.task.status;
  }, { timeout: 20000 }).toBe('completed');
}

test.describe('Investigations', () => {
  test('can create account investigation from UI and view structured details', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `pw-${uniqueSuffix()}`;
    const accountId = `acct-${unique}@test.local`;

    const ingestHeaders = {
      'Content-Type': 'application/json',
    };
    const ingestMailResp = await request.post((process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081') + '/internal/mail-logs/ingest', {
      data: [
        {
          message_id: `<${unique}-1@test.local>`,
          client_ip: '10.61.0.1',
          sender: accountId,
          sender_domain: 'test.local',
          smtp_user: accountId,
          authenticated: true,
          auth_type: 'PLAIN',
          recipients: ['recipient-a@testdomain.local', 'recipient-b@testdomain.local'],
          subject: `Playwright Investigation ${unique}`,
          content: 'playwright investigation seed message',
          action: 'accept',
          status: 'delivered',
          received_at: nowISOString(),
          timestamp: nowISOString(),
        },
      ],
      headers: ingestHeaders,
    });
    expect(ingestMailResp.ok()).toBeTruthy();

    const ingestAuthResp = await request.post((process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081') + '/internal/auth-attempts/ingest', {
      data: [
        {
          username: accountId,
          client_ip: '198.51.100.31',
          success: false,
          failure_reason: 'invalid password',
          auth_backend: 'local',
          mechanism: 'LOGIN',
          attempted_at: nowISOString(),
        },
        {
          username: accountId,
          client_ip: '198.51.100.32',
          success: true,
          auth_backend: 'local',
          mechanism: 'PLAIN',
          attempted_at: nowISOString(),
        },
      ],
      headers: ingestHeaders,
    });
    expect(ingestAuthResp.ok()).toBeTruthy();

    await authenticatedPage.goto('/zh/investigations');
    await expect(authenticatedPage.getByRole('heading', { name: 'Agent 调查' })).toBeVisible();

    await authenticatedPage.getByRole('button', { name: '新建调查' }).click();
    const dialog = authenticatedPage.getByRole('dialog', { name: '新建调查' });
    await dialog.getByRole('combobox').nth(0).click();
    await authenticatedPage.getByRole('option', { name: '账号异常分析' }).click();
    await dialog.getByRole('combobox').nth(1).click();
    await authenticatedPage.getByRole('option', { name: '账号' }).click();
    await dialog.locator('#target-mail-log-id').fill(accountId);
    await dialog.locator('#investigation-prompt').fill('playwright coverage for account investigation');
    await dialog.getByRole('button', { name: '启动调查' }).click();

    await expect(authenticatedPage.getByText('调查任务已创建')).toBeVisible();
    const detailDialog = authenticatedPage.getByRole('dialog', { name: '调查详情' });
    await expect(detailDialog.getByText('调查详情')).toBeVisible();

    const detailDescription = await detailDialog.getByText(/查看任务 inv_.+ 的执行过程和结构化结果。/).textContent();
    const taskId = detailDescription?.match(/(inv_[a-z0-9-]+)/i)?.[1] || null;
    expect(taskId).toBeTruthy();
    await pollInvestigation(authenticatedPage, taskId!.trim());

    await expect(detailDialog).toContainText(accountId);
    await expect(detailDialog).toContainText('目标摘要');
    await expect(detailDialog).toContainText('账号标识');
    await expect(detailDialog).toContainText('认证尝试数');
    await expect(detailDialog).toContainText('最近 IP 列表');
    await expect(detailDialog).toContainText('invalid password');

    const listResp = await api.get(`/investigations?created_by=admin`);
    expect(listResp.ok()).toBeTruthy();
    const list = await listResp.json();
    expect(list.items.some((item: { id: string; target_type: string; type: string }) => item.id === taskId?.trim() && item.target_type === 'account' && item.type === 'account_anomaly_analysis')).toBeTruthy();
  });
});
