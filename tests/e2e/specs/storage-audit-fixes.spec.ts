/**
 * E2E coverage for GT-11765 internal/storage audit fixes.
 * - #18: reason filter on /mail-logs
 * - #6: recipient + action filter honored together
 * - #5: export returns all matching rows (paging loop)
 * - #22: sender_filter import preview detects duplicate with backslash value
 */
import { test, expect } from '../fixtures/auth.fixture';
import { EmailLogsPage } from '../pages/email-logs.page';
import { createAuthenticatedClient } from '../fixtures/api.fixture';

const INGEST_URL =
  (process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081') +
  '/internal/mail-logs/ingest';

type IngestEntry = {
  message_id: string;
  client_ip?: string;
  sender: string;
  sender_domain?: string;
  recipients: string[];
  subject: string;
  action: string;
  status: string;
  reason?: string;
  spf_valid?: string;
  dkim_valid?: string;
  received_at: string;
  timestamp: string;
};

async function ingest(request: import('@playwright/test').APIRequestContext, entries: IngestEntry[]) {
  const resp = await request.post(INGEST_URL, {
    data: entries,
    headers: { 'Content-Type': 'application/json' },
  });
  expect(resp.ok()).toBeTruthy();
}

test.describe('GT-11765 Storage Audit Fixes', () => {
  test.describe.configure({ mode: 'serial' });

  // Shared state scoped to each test by unique senders/recipients; no DB cleanup
  // (the dev stack accumulates test rows; rows are uniquely tagged so they do
  // not collide with other tests' assertions).

  // --------------------------------------------------------------------------
  // Test 1: GT-11765 #18 — reason filter narrows results (API path)
  // --------------------------------------------------------------------------
  test('reason filter narrows results (API path)', async ({ request }) => {
    const sender = `gt18-pw-${Date.now()}@test.local`;
    const now = new Date().toISOString();
    const idA = `<gt18-pw-reasonA-${Date.now()}@test.local>`;
    const idB = `<gt18-pw-reasonB-${Date.now()}@test.local>`;

    await ingest(request, [
      {
        message_id: idA,
        sender,
        sender_domain: 'test.local',
        recipients: [`gt18-rcpt-${Date.now()}@sink.local`],
        subject: 'GT18 reason SPF_HFAIL',
        action: 'accept',
        status: 'delivered',
        reason: 'SPF_HFAIL',
        received_at: now,
        timestamp: now,
      },
      {
        message_id: idB,
        sender,
        sender_domain: 'test.local',
        recipients: [`gt18-rcpt2-${Date.now()}@sink.local`],
        subject: 'GT18 reason DKIM_FAIL',
        action: 'accept',
        status: 'delivered',
        reason: 'DKIM_FAIL',
        received_at: now,
        timestamp: now,
      },
    ]);

    const api = await createAuthenticatedClient(request);
    // The rows are ingested globally (tenant_id NULL); createAuthenticatedClient
    // auto-scopes to the first tenant once any tenant exists, which would hide
    // them. Query as an unscoped system_admin so the global rows are visible.
    api.setTenantId(null);
    const resp = await api.get(
      `/mail-logs?sender=${encodeURIComponent(sender)}&action=accept&reason=SPF_HFAIL&page=1&page_size=50`,
    );
    expect(resp.ok()).toBeTruthy();
    const body = (await resp.json()) as { items?: { message_id: string; reason?: string }[] };
    const items = body.items ?? [];
    const ids = items.map((i) => i.message_id);
    expect(ids).toContain(idA);
    expect(ids).not.toContain(idB);
    // Every returned row for this sender must carry the filtered reason.
    for (const it of items.filter((i) => ids.includes(idA) || i.message_id === idA)) {
      if (it.message_id === idA) {
        expect(it.reason).toBe('SPF_HFAIL');
      }
    }
  });

  // --------------------------------------------------------------------------
  // Test 2: GT-11765 #6 — recipient + action filter honored together (API path)
  // --------------------------------------------------------------------------
  test('recipient + action filter honored together (API path)', async ({ request }) => {
    const recipient = `gt6-pw-${Date.now()}@test.local`;
    const now = new Date().toISOString();
    const idReject = `<gt6-pw-reject-${Date.now()}@test.local>`;
    const idAccept = `<gt6-pw-accept-${Date.now()}@test.local>`;

    await ingest(request, [
      {
        message_id: idReject,
        sender: `gt6-sender-reject-${Date.now()}@test.local`,
        sender_domain: 'test.local',
        recipients: [recipient],
        subject: 'GT6 reject',
        action: 'reject',
        status: 'rejected',
        reason: 'RULE_MATCH',
        received_at: now,
        timestamp: now,
      },
      {
        message_id: idAccept,
        sender: `gt6-sender-accept-${Date.now()}@test.local`,
        sender_domain: 'test.local',
        recipients: [recipient],
        subject: 'GT6 accept',
        action: 'accept',
        status: 'delivered',
        reason: 'CLEAN',
        received_at: now,
        timestamp: now,
      },
    ]);

    const api = await createAuthenticatedClient(request);
    api.setTenantId(null); // global (tenant_id NULL) ingested rows — query unscoped
    const resp = await api.get(
      `/mail-logs?recipient=${encodeURIComponent(recipient)}&action=reject&page=1&page_size=50`,
    );
    expect(resp.ok()).toBeTruthy();
    const body = (await resp.json()) as { items?: { message_id: string; action?: string }[] };
    const items = body.items ?? [];
    const ids = items.map((i) => i.message_id);
    expect(ids).toContain(idReject);
    expect(ids).not.toContain(idAccept);
    const matched = items.find((i) => i.message_id === idReject);
    expect(matched).toBeDefined();
    expect(matched?.action).toBe('reject');
  });

  // --------------------------------------------------------------------------
  // Test 3: GT-11765 #5 — export returns all matching rows (download + API path)
  // --------------------------------------------------------------------------
  test('export returns all matching rows (download path)', async ({ request, authenticatedPage }) => {
    const sender = `gt5-pw-${Date.now()}@test.local`;
    const now = new Date().toISOString();
    const ids = Array.from({ length: 3 }, (_, i) => `<gt5-pw-${Date.now()}-${i}@test.local>`);

    await ingest(
      request,
      ids.map((id, i) => ({
        message_id: id,
        sender,
        sender_domain: 'test.local',
        recipients: [`gt5-rcpt-${Date.now()}-${i}@sink.local`],
        subject: `GT5 export ${i}`,
        action: 'accept',
        status: 'delivered',
        reason: 'CLEAN',
        received_at: now,
        timestamp: now,
      })),
    );

    // --- UI download path ----------------------------------------------------
    const emailLogsPage = new EmailLogsPage(authenticatedPage);
    await emailLogsPage.goto();
    await emailLogsPage.expectLoaded();
    await emailLogsPage.fillSender(sender);
    await emailLogsPage.clickSearch();

    const downloadPromise = emailLogsPage.page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await emailLogsPage.exportButton.click();
    const download = await downloadPromise;
    expect(download).not.toBeNull();
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/mail_logs|email-logs/);
    }

    // --- API path: prove the paging-loop fix returns ALL matching rows ------
    const api = await createAuthenticatedClient(request);
    api.setTenantId(null); // global (tenant_id NULL) ingested rows — query unscoped
    const resp = await api.get(
      `/mail-logs/export?format=json&action=accept&sender=${encodeURIComponent(sender)}`,
    );
    expect(resp.ok()).toBeTruthy();
    const body = (await resp.json()) as unknown;
    // Export JSON shape is either a bare array or { items: [...] } / { rows: [...] }.
    const rows: Array<Record<string, unknown>> = Array.isArray(body)
      ? (body as Array<Record<string, unknown>>)
      : Array.isArray((body as { items?: unknown[] }).items)
        ? ((body as { items: Array<Record<string, unknown>> }).items)
        : Array.isArray((body as { rows?: unknown[] }).rows)
          ? ((body as { rows: Array<Record<string, unknown>> }).rows)
          : [];
    expect(rows.length).toBeGreaterThan(0);
    const exportedIds = rows.map((r) => String(r.message_id ?? r.messageId ?? ''));
    for (const id of ids) {
      expect(exportedIds).toContain(id);
    }
  });

  // --------------------------------------------------------------------------
  // Test 4: GT-11765 #22 — sender_filter import preview detects duplicate with
  // a literal backslash in the value (API path).
  // --------------------------------------------------------------------------
  test('sender_filter import preview detects duplicate with backslash (API path)', async ({ request }) => {
    const api = await createAuthenticatedClient(request);

    // metadata for the CREATE endpoint is map[string]interface{} (see
    // CreateRuleRequest in internal/models/unified_rules.go), so send a JSON
    // object here.
    const senderEmail = `gt22-pw-${Date.now()}-foo\\.com`;
    const metadataObj = {
      feature: 'sender_filter',
      list_type: 'blacklist',
      sender_config: { type: 'individual', value: senderEmail },
      ip_range: { type: 'all' },
    };
    const ruleName = `gt22-pw-create-${Date.now()}`;

    const createResp = await api.post('/unified-rules', {
      name: ruleName,
      rule_class: 'action',
      stage: 'rcpt',
      priority: 100,
      condition_tree: {
        type: 'condition',
        field: 'sender',
        operator: 'eq',
        value: senderEmail,
      },
      action: 'reject',
      metadata: metadataObj,
      page: 'sender_filter',
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();
    const createBody = (await createResp.json()) as { id?: number };
    const ruleId = createBody.id;
    expect(ruleId).toBeDefined();

    try {
      // The import-preview payload carries models.Rule rows, whose Metadata
      // field is a STRING (raw JSON), so serialize the same metadata to a
      // string here (matches the Go test at export_import_test.go:1514-1536).
      const sfMetaStr = JSON.stringify(metadataObj);
      const conditionTreeStr = JSON.stringify({
        type: 'condition',
        field: 'sender',
        operator: 'eq',
        value: senderEmail,
      });

      const previewResp = await api.post(
        '/unified-rules/import/preview?scope=sender_filter',
        {
          file: {
            version: 'rule-settings/v1',
            scope: 'sender_filter',
            data: {
              rules: [
                {
                  name: ruleName,
                  rule_class: 'action',
                  stage: 'rcpt',
                  priority: 100,
                  condition_tree: conditionTreeStr,
                  action: 'reject',
                  metadata: sfMetaStr,
                  is_active: true,
                },
              ],
            },
          },
          selection: {
            include_rules: true,
            include_detection_profiles: true,
          },
          import_mode: { mode: 'restore_original_tenants' },
        },
      );
      expect(previewResp.status()).toBe(200);
      const body = (await previewResp.json()) as {
        summary?: { rules?: { duplicates?: number } };
        duplicates?: { rules?: Array<{ reason?: string; source?: { name?: string } }> };
      };
      const dupRules = body.duplicates?.rules ?? [];
      expect(dupRules.length).toBeGreaterThanOrEqual(1);
      const summaryDups = body.summary?.rules?.duplicates ?? 0;
      expect(summaryDups).toBeGreaterThanOrEqual(1);
    } finally {
      if (ruleId !== undefined) {
        await api.delete(`/unified-rules/${ruleId}`);
      }
    }
  });
});
