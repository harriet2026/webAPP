import { test, expect } from '../fixtures/auth.fixture';

const _INTERNAL = process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081';
const INGEST_MAIL_URL = `${_INTERNAL}/internal/mail-logs/ingest`;
const INGEST_AUTH_URL = `${_INTERNAL}/internal/auth-attempts/ingest`;
const INGEST_INTERCEPT_URL = `${_INTERNAL}/internal/intercept-events/ingest`;

test.describe('Batch Ingest Performance', () => {
  test('mail log batch 500 rows under 5 seconds', async ({ request }) => {
    const now = new Date();
    const logs = [];
    for (let i = 0; i < 500; i++) {
      logs.push({
        sender: `perf-sender-${i}@test.local`,
        recipients: [`perf-rcpt-${i}@test.local`],
        subject: `Perf test ${i}`,
        action: 'accept',
        received_at: now.toISOString(),
      });
    }

    const start = Date.now();
    const resp = await request.post(INGEST_MAIL_URL, {
      data: logs,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const elapsed = Date.now() - start;

    expect([200, 201]).toContain(resp.status());
    expect(elapsed).toBeLessThan(5000);
  });

  test('auth attempts batch 100 rows', async ({ request }) => {
    const now = new Date();
    const attempts = [];
    for (let i = 0; i < 100; i++) {
      attempts.push({
        username: `auth-perf-${i}@test.local`,
        client_ip: `10.0.${Math.floor(i / 256)}.${i % 256}`,
        success: i % 3 === 0 ? 0 : 1,
        attempted_at: now.toISOString(),
      });
    }

    const resp = await request.post(INGEST_AUTH_URL, {
      data: attempts,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect([200, 201]).toContain(resp.status());
  });

  test('intercept events batch 50 rows', async ({ request }) => {
    const now = new Date();
    const events = [];
    for (let i = 0; i < 50; i++) {
      events.push({
        rule_id: 1,
        rule_name: `Perf Rule ${i}`,
        stage: 'data',
        rule_action: 'reject',
        product_action: 'reject',
        occurred_at: now.toISOString(),
      });
    }

    const resp = await request.post(INGEST_INTERCEPT_URL, {
      data: events,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect([200, 201]).toContain(resp.status());
  });
});
