import { test, expect } from '../fixtures/auth.fixture';
import { SecurityOverviewPage } from '../pages/security-overview.page';
import { uniqueSuffix } from '../helpers/test-data';

const INTERNAL_BASE = process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081';

function nowISOString() {
  return new Date().toISOString();
}

test.describe('Listener Auth Cleanup - mTLS-only Ingest', () => {
  test('mail-log ingest accepts request without Bearer token', async ({ request }) => {
    const unique = uniqueSuffix();
    const resp = await request.post(`${INTERNAL_BASE}/internal/mail-logs/ingest`, {
      data: [
        {
          message_id: `<no-bearer-${unique}@test.local>`,
          sender: `no-bearer-${unique}@test.local`,
          recipients: [`rcpt-${unique}@test.local`],
          subject: `No Bearer test ${unique}`,
          action: 'accept',
          received_at: nowISOString(),
        },
      ],
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(resp.status()).not.toBe(401);
    expect([200, 201]).toContain(resp.status());
  });

  test('auth-attempts ingest accepts request without Bearer token', async ({ request }) => {
    const unique = uniqueSuffix();
    const resp = await request.post(`${INTERNAL_BASE}/internal/auth-attempts/ingest`, {
      data: [
        {
          username: `no-bearer-${unique}@test.local`,
          client_ip: '10.99.0.1',
          success: 1,
          attempted_at: nowISOString(),
        },
      ],
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(resp.status()).not.toBe(401);
    expect([200, 201]).toContain(resp.status());
  });

  test('intercept-events ingest accepts request without Bearer token', async ({ request }) => {
    const unique = uniqueSuffix();
    const resp = await request.post(`${INTERNAL_BASE}/internal/intercept-events/ingest`, {
      data: [
        {
          rule_id: 99999,
          rule_name: `NoBearerRule-${unique}`,
          stage: 'data',
          rule_action: 'reject',
          product_action: 'reject',
          occurred_at: nowISOString(),
        },
      ],
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(resp.status()).not.toBe(401);
    expect([200, 201]).toContain(resp.status());
  });

  test('security overview page loads correctly after auth cleanup', async ({ authenticatedPage }) => {
    const securityOverviewPage = new SecurityOverviewPage(authenticatedPage);
    await securityOverviewPage.goto();
    await securityOverviewPage.expectLoaded();

    const count = await securityOverviewPage.getKpiCardCount();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('disposal settings page has no reference to OSG_INGEST_TOKEN', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/disposal-settings');
    await authenticatedPage.waitForLoadState('networkidle');

    const bodyText = await authenticatedPage.locator('body').textContent();
    expect(bodyText).not.toContain('OSG_INGEST_TOKEN');
    expect(bodyText).not.toContain('ingest_token');
    expect(bodyText).not.toContain('Ingest Token');
  });
});
