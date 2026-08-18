import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { QuarantinePage } from '../pages/quarantine.page';
import { SidelinePage } from '../pages/sideline.page';
import { AuditQueuePage } from '../pages/audit-queue.page';
import { InboundAuditPage } from '../pages/inbound-audit.page';
import { internalFetch, INTERNAL_API_BASE } from '../helpers/internal-client';

const HMAC_SECRET = 'test-hmac-secret-for-e2e';

async function hmacGet(path: string): Promise<Response> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}\nGET\n${path}\n`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  const sig = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return internalFetch(`${INTERNAL_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      'X-OSG-Timestamp': ts,
      'X-OSG-Signature': sig,
    },
  });
}

async function hmacPost(path: string, body: object): Promise<Response> {
  const bodyStr = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}\nPOST\n${path}\n${bodyStr}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  const sig = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return internalFetch(`${INTERNAL_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OSG-Timestamp': ts,
      'X-OSG-Signature': sig,
    },
    body: bodyStr,
  });
}

test.describe('Antispam DB Independence', () => {
  test.describe('Internal API - Snapshot Endpoint', () => {
    test('snapshot returns 200 with valid JSON', async () => {
      const resp = await hmacGet('/internal/v1/antispam/snapshot');
      expect(resp.status).toBe(200);

      const data = await resp.json();
      expect(data.generated_at).toBeTruthy();
      expect(Array.isArray(data.tenant_domains || [])).toBeTruthy();
      expect(Array.isArray(data.smtp_credentials || [])).toBeTruthy();
      expect(typeof data.unified_rules).toBe('object');
    });

    test('snapshot includes ETag header for caching', async () => {
      const resp = await hmacGet('/internal/v1/antispam/snapshot');
      expect(resp.status).toBe(200);

      const etag = resp.headers.get('etag');
      expect(etag).toBeTruthy();
      expect(etag!.startsWith('"')).toBeTruthy();
    });

    test('snapshot returns 304 when If-None-Match matches', async () => {
      const first = await hmacGet('/internal/v1/antispam/snapshot');
      expect(first.status).toBe(200);
      const etag = first.headers.get('etag');
      expect(etag).toBeTruthy();

      const ts = Math.floor(Date.now() / 1000).toString();
      const path = '/internal/v1/antispam/snapshot';
      const payload = `${ts}\nGET\n${path}\n`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(HMAC_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
      const sigArray = Array.from(new Uint8Array(sigBuffer));
      const sig = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const second = await internalFetch(`${INTERNAL_API_BASE}${path}`, {
        method: 'GET',
        headers: {
          'X-OSG-Timestamp': ts,
          'X-OSG-Signature': sig,
          'If-None-Match': etag!,
        },
      });
      expect(second.status).toBe(304);
    });

    test('snapshot does not leak password_hash', async () => {
      const resp = await hmacGet('/internal/v1/antispam/snapshot');
      expect(resp.status).toBe(200);

      const text = await resp.text();
      expect(text).not.toContain('password_hash');
      // The config snapshot legitimately carries password-POLICY keys once an
      // admin has overridden them (apiserver.cf/security/password_min_length,
      // password_min_char_classes, password_history_limit, …) — those key NAMES
      // are not secrets. Strip them before the catch-all below, matching on the
      // config-path shape ("<file>.cf/<section>/password_*"): enumerating
      // individual policy keys made this assertion fail the moment a new one was
      // added (password_history_limit), which reads as a credential leak.
      //
      // A leaked DB column arrives as a BARE field name ("password_hash",
      // "password_enc", "password") with no config path in front of it, so it
      // still trips the catch-all — the check keeps its teeth.
      const withoutPolicyKeys = text.replace(/"[^"]*\/password_[a-z_]*"/g, '""');
      expect(withoutPolicyKeys).not.toContain('password');
    });

    test('snapshot without HMAC returns 401', async () => {
      const resp = await internalFetch(`${INTERNAL_API_BASE}/internal/v1/antispam/snapshot`);
      expect(resp.status).toBe(401);
    });
  });

  test.describe('Internal API - Sideline Pending Count', () => {
    test('pending-count returns 200 with count field', async () => {
      const resp = await hmacGet('/internal/v1/antispam/sideline/pending-count');
      expect(resp.status).toBe(200);

      const data = await resp.json();
      expect(typeof data.count).toBe('number');
      expect(data.count).toBeGreaterThanOrEqual(0);
    });

    test('pending-count with tenant_id filter', async () => {
      const resp = await hmacGet('/internal/v1/antispam/sideline/pending-count?tenant_id=1');
      expect(resp.status).toBe(200);

      const data = await resp.json();
      expect(typeof data.count).toBe('number');
    });

    test('pending-count with invalid tenant_id returns 400', async () => {
      const resp = await hmacGet('/internal/v1/antispam/sideline/pending-count?tenant_id=abc');
      expect(resp.status).toBe(400);
    });

    test('pending-count without HMAC returns 401', async () => {
      const resp = await internalFetch(`${INTERNAL_API_BASE}/internal/v1/antispam/sideline/pending-count`);
      expect(resp.status).toBe(401);
    });
  });

  test.describe('Internal API - Claim Endpoints', () => {
    test('claim outbound audit items without body returns 400', async () => {
      const body = '{}';
      const ts = Math.floor(Date.now() / 1000).toString();
      const path = '/internal/v1/antispam/outbound-audit/claim';
      const payload = `${ts}\nPOST\n${path}\n${body}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(HMAC_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
      const sigArray = Array.from(new Uint8Array(sigBuffer));
      const sig = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const resp = await internalFetch(`${INTERNAL_API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OSG-Timestamp': ts,
          'X-OSG-Signature': sig,
        },
        body,
      });
      expect(resp.status).toBe(400);
    });

    test('claim outbound audit items with valid request', async () => {
      const resp = await hmacPost('/internal/v1/antispam/outbound-audit/claim', {
        node_id: 'test-node-e2e',
        limit: 5,
        lease_seconds: 300,
      });
      expect(resp.status).toBe(200);

      const data = await resp.json();
      expect(Array.isArray(data.items)).toBeTruthy();
    });

    test('claim inbound audit items with valid request', async () => {
      const resp = await hmacPost('/internal/v1/antispam/inbound-audit/claim', {
        node_id: 'test-node-e2e',
        limit: 5,
        lease_seconds: 300,
      });
      expect(resp.status).toBe(200);

      const data = await resp.json();
      expect(Array.isArray(data.items)).toBeTruthy();
    });
  });

  test.describe('Quarantine View Unchanged', () => {
    let quarantinePage: QuarantinePage;

    test.beforeEach(async ({ authenticatedPage }) => {
      quarantinePage = new QuarantinePage(authenticatedPage);
      await quarantinePage.goto();
      await quarantinePage.expectLoaded();
    });

    test('page loads with heading', async () => {
      await expect(quarantinePage.heading).toBeVisible();
    });

    test('table renders with expected columns or empty state', async () => {
      await quarantinePage.page.waitForSelector('table tbody tr, :text("暂无数据"), :text("No data")', { timeout: 10000 });
      const dataCount = await quarantinePage.getDataRowCount();
      if (dataCount === 0) {
        expect(await quarantinePage.hasEmptyState()).toBeTruthy();
      } else {
        const rows = await quarantinePage.getTableRows();
        expect(await rows.count()).toBeGreaterThan(0);
      }
    });

    test('search and reset controls work', async () => {
      await quarantinePage.fillSender('test-schema-check');
      expect(await quarantinePage.getSenderInput().inputValue()).toBe('test-schema-check');

      await quarantinePage.clickReset();
      expect(await quarantinePage.getSenderInput().inputValue()).toBe('');
    });
  });

  test.describe('Sideline View Unchanged', () => {
    let sidelinePage: SidelinePage;

    test.beforeEach(async ({ authenticatedPage }) => {
      sidelinePage = new SidelinePage(authenticatedPage);
      await sidelinePage.goto();
      await sidelinePage.expectLoaded();
    });

    test('page loads with heading', async () => {
      await expect(sidelinePage.heading).toBeVisible();
    });

    test('table renders with expected columns or empty state', async () => {
      await sidelinePage.page.waitForSelector('table tbody tr, :text("暂无数据"), :text("No data")', { timeout: 10000 });
      const dataCount = await sidelinePage.getDataRowCount();
      if (dataCount === 0) {
        expect(await sidelinePage.hasEmptyState()).toBeTruthy();
      } else {
        const headers = await sidelinePage.page.locator('table th').allTextContents();
        expect(headers).toContain('主题');
        expect(headers).toContain('发件人');
        expect(headers).toContain('状态');
      }
    });

    test('status filter options include all queue states', async () => {
      await sidelinePage.page.locator('main [data-slot="select-trigger"]').first().click();
      await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '待处理' })).toBeVisible();
      await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '处理中' })).toBeVisible();
      await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '失败' })).toBeVisible();
    });
  });

  test.describe('Outbound Audit View Unchanged', () => {
    let auditPage: AuditQueuePage;

    test.beforeEach(async ({ authenticatedPage }) => {
      auditPage = new AuditQueuePage(authenticatedPage);
      await auditPage.goto();
      await auditPage.expectLoaded();
    });

    test('page loads with heading and tabs', async () => {
      await expect(auditPage.heading).toHaveText('出站审核');

      const activeTab = await auditPage.getActiveTabValue();
      expect(activeTab).toContain('待审核');
    });

    test('table has expected columns', async () => {
      const headers = await auditPage.getTableHeaders().allTextContents();
      expect(headers.some(h => h.includes('发件人'))).toBeTruthy();
      expect(headers.some(h => h.includes('收件人'))).toBeTruthy();
      expect(headers.some(h => h.includes('主题'))).toBeTruthy();
    });

    test('tab switching works across all tabs', async () => {
      await auditPage.switchToApproved();
      expect(await auditPage.getActiveTabValue()).toContain('已批准');

      await auditPage.switchToRejected();
      expect(await auditPage.getActiveTabValue()).toContain('已拒绝');

      await auditPage.switchToPending();
      expect(await auditPage.getActiveTabValue()).toContain('待审核');
    });
  });

  test.describe('Inbound Audit View Unchanged', () => {
    let inboundAuditPage: InboundAuditPage;

    test.beforeEach(async ({ authenticatedPage }) => {
      inboundAuditPage = new InboundAuditPage(authenticatedPage);
      await inboundAuditPage.goto();
      await inboundAuditPage.expectLoaded();
    });

    test('page loads with heading', async () => {
      await expect(inboundAuditPage.heading).toBeVisible();
    });

    test('status tabs are present', async () => {
      const pendingTab = inboundAuditPage.page.locator('button[role="tab"]').filter({ hasText: /Pending|待审核/ });
      await expect(pendingTab).toBeVisible();
      const approvedTab = inboundAuditPage.page.locator('button[role="tab"]').filter({ hasText: /Approved|已放行|已通过/ });
      await expect(approvedTab).toBeVisible();
      const rejectedTab = inboundAuditPage.page.locator('button[role="tab"]').filter({ hasText: /Rejected|已拒绝/ });
      await expect(rejectedTab).toBeVisible();
    });

    test('table renders or shows empty state', async () => {
      const dataCount = await inboundAuditPage.getDataRowCount();
      expect(dataCount).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Public API Compatibility', () => {
    test('quarantine list API still returns valid response', async ({ request }) => {
      const client = await createAuthenticatedClient(request);
      const resp = await client.get('/quarantine?page=1&page_size=5');
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(typeof data.total).toBe('number');
      expect(Array.isArray(data.items)).toBeTruthy();
    });

    test('sideline list API still returns valid response', async ({ request }) => {
      const client = await createAuthenticatedClient(request);
      const resp = await client.get('/sideline?page=1&page_size=5');
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(typeof data.total).toBe('number');
      expect(Array.isArray(data.items)).toBeTruthy();
    });

    test('outbound audit list API still returns valid response', async ({ request }) => {
      const client = await createAuthenticatedClient(request);
      const resp = await client.get('/outbound-audit?page=1&page_size=5&status=pending');
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(typeof data.total).toBe('number');
      expect(Array.isArray(data.items)).toBeTruthy();
    });

    test('inbound audit list API still returns valid response', async ({ request }) => {
      const client = await createAuthenticatedClient(request);
      const resp = await client.get('/inbound-audit?page=1&page_size=5&status=pending');
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(typeof data.total).toBe('number');
      expect(Array.isArray(data.items)).toBeTruthy();
    });
  });
});
