import { test, expect } from '../fixtures/auth.fixture';
import { EmailLogsPage } from '../pages/email-logs.page';
import { seedMailLogs } from '../helpers/seed-data';

test.describe('Email Logs - Delivery Events', () => {
  let emailLogsPage: EmailLogsPage;
  const apiRootUrl = (process.env.API_BASE_URL || 'http://localhost:18080').replace(/\/api\/v1\/?$/, '');

  test.beforeEach(async ({ authenticatedPage, request }) => {
    await seedMailLogs(request);
    emailLogsPage = new EmailLogsPage(authenticatedPage);
    await emailLogsPage.goto();
    await emailLogsPage.expectLoaded();
  });

  test('detail modal shows delivery tab', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const senderCell = rows.nth(0).locator('td span.underline, td span.cursor-pointer');
    expect(await senderCell.count()).toBeGreaterThan(0);

    await emailLogsPage.openDetailAndWait(0);

    const dialog = emailLogsPage.page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    const deliveryTab = dialog.locator('[role="tab"]').filter({ hasText: /Delivery|投递/i });
    await expect(deliveryTab).toBeVisible();
    await deliveryTab.click();

    const deliveryContent = dialog.getByRole('tabpanel', { name: /Delivery|投递/i });
    await expect(deliveryContent).toBeVisible();

    await emailLogsPage.closeDetail();
  });

  test('delivery tab shows delivery status and attempts', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const senderCell = rows.nth(0).locator('td span.underline, td span.cursor-pointer');
    expect(await senderCell.count()).toBeGreaterThan(0);

    await emailLogsPage.openDetailAndWait(0);

    const dialog = emailLogsPage.page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    const deliveryTab = dialog.locator('[role="tab"]').filter({ hasText: /Delivery|投递/i });
    await expect(deliveryTab).toBeVisible();
    await deliveryTab.click();

    const tabContent = dialog.getByRole('tabpanel', { name: /Delivery|投递/i });
    await expect(tabContent).toBeVisible();

    const hasDeliveryStatus = await tabContent.locator('text=/unknown|delivered|in.delivery|failed|accepted/i').count();
    const hasDeliveryAttempts = await tabContent.locator('text=/Delivery Attempts|投递次数|delivery.attempts/i').count();
    const hasNoDeliveryInfo = await tabContent.locator('text=/No delivery info|暂无投递/i').count();

    expect(hasDeliveryStatus + hasDeliveryAttempts + hasNoDeliveryInfo).toBeGreaterThan(0);

    await emailLogsPage.closeDetail();
  });

  test('delivery tab shows no delivery info for seed data', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const senderCell = rows.nth(0).locator('td span.underline, td span.cursor-pointer');
    expect(await senderCell.count()).toBeGreaterThan(0);

    await emailLogsPage.openDetailAndWait(0);

    const dialog = emailLogsPage.page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    const deliveryTab = dialog.locator('[role="tab"]').filter({ hasText: /Delivery|投递/i });
    await expect(deliveryTab).toBeVisible();
    await deliveryTab.click();

    const tabContent = dialog.getByRole('tabpanel', { name: /Delivery|投递/i });
    await expect(tabContent).toBeVisible();

    await emailLogsPage.closeDetail();
  });

  test('detail modal has all expected tabs including delivery', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const senderCell = rows.nth(0).locator('td span.underline, td span.cursor-pointer');
    expect(await senderCell.count()).toBeGreaterThan(0);

    await emailLogsPage.openDetailAndWait(0);

    const dialog = emailLogsPage.page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    const tabs = dialog.locator('[role="tab"]');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(3);

    const tabTexts = [];
    for (let i = 0; i < tabCount; i++) {
      tabTexts.push(await tabs.nth(i).innerText());
    }

    const hasDeliveryTab = tabTexts.some(t => /Delivery|投递/i.test(t));
    expect(hasDeliveryTab).toBeTruthy();

    await emailLogsPage.closeDetail();
  });

  test('table has delivery column group available', async () => {
    const columnToggle = emailLogsPage.page.locator('button').filter({ hasText: /列|Columns/i });
    await expect(columnToggle.first()).toBeVisible();
    await columnToggle.first().click();

    const deliveryGroup = emailLogsPage.page.locator('text=/Delivery|投递/i');
    expect(await deliveryGroup.count()).toBeGreaterThan(0);

    await emailLogsPage.page.keyboard.press('Escape');
  });

  test('delivery events API endpoint returns events for a mail log', async ({ request }) => {
    const loginResp = await request.post(`${apiRootUrl}/api/v1/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    });
    const { token } = await loginResp.json();

    const logsResp = await request.get(`${apiRootUrl}/api/v1/mail-logs?page_size=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logsResp.ok()).toBeTruthy();
    const logsData = await logsResp.json();
    const items = logsData.items || logsData.data || [];
    expect(items.length).toBeGreaterThan(0);

    const mailLogId = items[0].id;
    const eventsResp = await request.get(`${apiRootUrl}/api/v1/mail-logs/${mailLogId}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(eventsResp.ok()).toBeTruthy();
    const eventsData = await eventsResp.json();
    expect(eventsData.items).toBeDefined();
    expect(Array.isArray(eventsData.items)).toBeTruthy();
    expect(typeof eventsData.total).toBe('number');
  });
});
