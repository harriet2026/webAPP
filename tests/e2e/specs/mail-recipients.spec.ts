import { test, expect } from '../fixtures/auth.fixture';
import { APIRequestContext } from '@playwright/test';
import { EmailLogsPage } from '../pages/email-logs.page';

const INGEST_URL = (process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081') + '/internal/mail-logs/ingest';

async function seedMultiRecipientMailLogs(request: APIRequestContext) {
  const now = new Date();
  const logs = [];

  for (let i = 0; i < 3; i++) {
    logs.push({
      message_id: `<multi-rcpt-${i}@test.local>`,
      sender: `sender-multi-${i}@test.local`,
      recipients: [
        `shared-recipient@test.local`,
        `unique-rcpt-${i}@test.local`,
        `another-rcpt-${i}@test.local`,
      ],
      subject: `Multi-recipient test ${i}`,
      action: 'accept',
      status: 'delivered',
      received_at: now.toISOString(),
    });
  }

  await request.post(INGEST_URL, {
    data: logs,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

test.describe('Mail Recipients', () => {
  let emailLogsPage: EmailLogsPage;

  test.beforeEach(async ({ authenticatedPage, request }) => {
    await seedMultiRecipientMailLogs(request);
    emailLogsPage = new EmailLogsPage(authenticatedPage);
    await emailLogsPage.goto();
    await emailLogsPage.expectLoaded();
  });

  test('email logs page loads with multi-recipient data', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('search by shared recipient filters results', async () => {
    await emailLogsPage.fillRecipient('shared-recipient@test.local');
    await emailLogsPage.clickSearch();

    const dataCount = await emailLogsPage.getDataRowCount();
    expect(dataCount).toBeGreaterThan(0);
  });

  test('search by unique recipient returns subset', async () => {
    await emailLogsPage.fillRecipient('unique-rcpt-0@test.local');
    await emailLogsPage.clickSearch();

    const dataCount = await emailLogsPage.getDataRowCount();
    expect(dataCount).toBeGreaterThanOrEqual(1);
  });

  test('search by non-existent recipient shows empty state', async () => {
    await emailLogsPage.fillRecipient('no-such-recipient-xyz@test.local');
    await emailLogsPage.clickSearch();

    expect(await emailLogsPage.hasEmptyState()).toBeTruthy();
  });

  test('bulk ingest creates mail recipient records', async ({ request }) => {
    const now = new Date();
    const logs = [];
    for (let i = 0; i < 50; i++) {
      logs.push({
        message_id: `<batch-rcpt-${i}@test.local>`,
        sender: `batch-sender-${i}@test.local`,
        recipients: [`batch-rcpt-${i}@test.local`],
        subject: `Batch test ${i}`,
        action: 'accept',
        received_at: now.toISOString(),
      });
    }

    const resp = await request.post(INGEST_URL, {
      data: logs,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect([200, 201]).toContain(resp.status());
  });
});
