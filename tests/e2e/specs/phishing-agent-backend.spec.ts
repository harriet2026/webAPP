/**
 * Playwright E2E tests for the phishing-agent investigation backend.
 *
 * These tests do NOT depend on unbuilt frontend pages. They verify the API
 * contract and the screenshot blob proxy via Playwright's request context:
 *   a) screenshot endpoint rejects bad keys (400)
 *   b) screenshot endpoint returns 404 for a valid-format but missing key
 *   c) screenshot endpoint full round-trip (PUT blob → GET via apiserver proxy)
 *   d) detection-logs API returns merged sideline + investigation rows
 *   e) existing sideline page still loads (regression guard)
 */

import * as crypto from 'crypto';
import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { internalFetch } from '../helpers/internal-client';
import { uniqueSuffix } from '../helpers/test-data';

const HMAC_SECRET = process.env.OSG_INTERNAL_HMAC_SECRET || 'test-hmac-secret-for-e2e';

// --------------------------------------------------------------------------- //
// HMAC helpers — match Go's internalauth.Sign
//   buildPayload: fmt.Sprintf("%d\n%s\n%s\n%s", ts, METHOD, path, string(body))
// --------------------------------------------------------------------------- //

function hmacTextHeaders(
  method: string,
  path: string,
  bodyStr: string,
): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}\n${method.toUpperCase()}\n${path}\n${bodyStr}`;
  const sig = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload, 'utf-8')
    .digest('hex');
  return { 'X-OSG-Timestamp': ts, 'X-OSG-Signature': sig };
}

function hmacRawHeaders(
  method: string,
  path: string,
  body: Buffer,
): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const prefix = Buffer.from(`${ts}\n${method.toUpperCase()}\n${path}\n`, 'utf-8');
  const payload = Buffer.concat([prefix, body]);
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  return { 'X-OSG-Timestamp': ts, 'X-OSG-Signature': sig };
}

// --------------------------------------------------------------------------- //
// Seed helpers
// --------------------------------------------------------------------------- //

async function seedSQL(sql: string): Promise<void> {
  const bodyStr = JSON.stringify({ sql, args: [] });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...hmacTextHeaders('POST', '/internal/v1/test/sql', bodyStr),
  };
  const resp = await internalFetch('/internal/v1/test/sql', {
    method: 'POST',
    headers,
    body: bodyStr,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`seedSQL failed: ${resp.status} ${text}`);
  }
}

async function cleanupSQL(sql: string): Promise<void> {
  try {
    await seedSQL(sql);
  } catch {
    // best-effort cleanup
  }
}

async function putBlob(key: string, body: Buffer, contentType: string): Promise<boolean> {
  const path = `/internal/v1/blob?key=${key}`;
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    ...hmacRawHeaders('PUT', path, body),
  };
  const resp = await internalFetch(`https://localhost:20003${path}`, {
    method: 'PUT',
    headers,
    body: body as unknown as BodyInit,
  });
  return resp.ok;
}

// Minimal PNG magic + filler (the proxy returns exactly what was stored).
function makePngBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(100),
  ]);
}

// =========================================================================== //
// Tests
// =========================================================================== //

test.describe('Phishing Detection Agent Backend', () => {
  test.describe.configure({ timeout: 60000 });

  // ------------------------------------------------------------------ //
  // a) screenshot endpoint rejects bad keys
  // ------------------------------------------------------------------ //
  test('screenshot endpoint rejects bad key with 400', async ({ request }) => {
    const api = await createAuthenticatedClient(request);
    const resp = await api.get(
      '/phishing-agent/screenshot?storage_node=antispam&key=../escape',
    );
    expect(resp.status()).toBe(400);
  });

  // ------------------------------------------------------------------ //
  // b) screenshot endpoint returns 404 for a valid-format but missing key
  // ------------------------------------------------------------------ //
  test('screenshot endpoint returns 404 for missing blob', async ({ request }) => {
    const api = await createAuthenticatedClient(request);
    const resp = await api.get(
      '/phishing-agent/screenshot?storage_node=antispam&key=blob/shots/pw-missing/notfound.png',
    );
    expect(resp.status()).toBe(404);
  });

  // ------------------------------------------------------------------ //
  // c) screenshot endpoint full round-trip
  // ------------------------------------------------------------------ //
  test('screenshot endpoint serves a valid image (round-trip)', async ({ request }) => {
    const unique = uniqueSuffix();
    const taskId = `pw-rt-${unique}`;
    const key = `blob/shots/${taskId}/capture.png`;
    const pngBytes = makePngBytes();

    // Resolve tenant_id early so the seeded task matches the X-Tenant-ID the client sends.
    // The screenshot proxy checks tenant ownership when X-Tenant-ID is present.
    const api = await createAuthenticatedClient(request);
    const tenantId = api.getTenantId();
    const tenantSQL = tenantId != null ? `, tenant_id` : '';
    const tenantVal = tenantId != null ? `, ${tenantId}` : '';

    // Seed an investigation task so the screenshot proxy's task_id validation passes.
    await seedSQL(
      `INSERT INTO investigation_tasks ` +
        `(id${tenantSQL}, type, status, trigger_type, source_type, source_id, target_type, target_ids_json, summary, risk_level, confidence, created_by) ` +
        `VALUES ('${taskId}'${tenantVal}, 'phish_analysis', 'completed', 'api', 'manual', '${taskId}', 'mail', '[]'::jsonb, 'pw screenshot test', 'low', 0.1, 'pw-test')`,
    );

    try {
      // PUT the blob to the antispam blob endpoint (localhost:20003, mTLS + HMAC)
      const putOk = await putBlob(key, pngBytes, 'image/png');
      expect(putOk).toBeTruthy();

      // GET the screenshot via the apiserver proxy (Bearer JWT auth + X-Tenant-ID)
      const resp = await api.get(
        `/phishing-agent/screenshot?storage_node=antispam&key=${key}`,
      );
      expect(resp.ok()).toBeTruthy();
      expect(resp.headers()['content-type']).toContain('image/png');
      const body = await resp.body();
      expect(body.equals(pngBytes)).toBeTruthy();
    } finally {
      await cleanupSQL(`DELETE FROM investigation_tasks WHERE id='${taskId}'`);
    }
  });

  // ------------------------------------------------------------------ //
  // d) detection-logs API returns merged sideline + investigation rows
  // ------------------------------------------------------------------ //
  test('detection logs API returns merged rows', async ({ request }) => {
    const unique = uniqueSuffix();
    const itemId = `pw-sl-${unique}`;
    const invId = `pw-inv-${unique}`;
    const sender = `pw-detlog-${unique}@e2e.test`;
    const subject = `pw-detlog-${unique}`;
    const rcpt = `victim-${unique}@e2e.test`;

    // Resolve tenant_id so seeded rows are visible when the client sends X-Tenant-ID.
    const api = await createAuthenticatedClient(request);
    const tenantId = api.getTenantId();
    const tidSQL = tenantId != null ? `, tenant_id` : '';
    const tidVal = tenantId != null ? `, ${tenantId}` : '';

    try {
      // Seed sideline_item with matching tenant_id (reinjected_at NULL → visible in detection logs)
      await seedSQL(
        `INSERT INTO sideline_items ` +
          `(id${tidSQL}, message_id, sender, recipients, subject, storage_path, storage_node, direction, status, sidelined_at) ` +
          `VALUES ('${itemId}'${tidVal}, '<${itemId}@e2e.test>', '${sender}', ARRAY['${rcpt}']::text[], '${subject}', 'blob/test/${itemId}.eml', 'antispam', 'receive', 'pending', NOW())`,
      );

      // Seed investigation_task linked to the sideline item with matching tenant_id
      await seedSQL(
        `INSERT INTO investigation_tasks ` +
          `(id${tidSQL}, type, status, trigger_type, source_type, source_id, target_type, target_ids_json, summary, risk_level, confidence, result_json, steps_json, created_by) ` +
          `VALUES ('${invId}'${tidVal}, 'phish_analysis', 'completed', 'api', 'sideline_item', '${itemId}', 'mail', '["${itemId}"]'::jsonb, 'pw test', 'high', 0.92, '{"verdict":"phishing_suspected","summary":"pw test"}'::jsonb, '[{"name":"llm_analysis","status":"completed"}]'::jsonb, 'pw-test')`,
      );

      // GET detection logs filtered by the unique subject
      const resp = await api.get(
        `/phishing-agent/detection-logs?subject=${encodeURIComponent(subject)}`,
      );
      expect(resp.ok()).toBeTruthy();
      const body = await resp.json();
      expect(body.items).toBeInstanceOf(Array);
      expect(body.total).toBeGreaterThanOrEqual(1);
      const matched = body.items.find(
        (r: { sideline_id: string }) => r.sideline_id === itemId,
      );
      expect(matched).toBeTruthy();
      expect(matched.verdict).toBe('phishing_suspected');
      expect(matched.risk_level).toBe('high');
      expect(matched.sender).toBe(sender);
    } finally {
      await cleanupSQL(`DELETE FROM investigation_tasks WHERE id='${invId}'`);
      await cleanupSQL(`DELETE FROM sideline_items WHERE id='${itemId}'`);
    }
  });

  // ------------------------------------------------------------------ //
  // e) existing sideline page still loads (regression guard)
  // ------------------------------------------------------------------ //
  test('existing sideline page still loads', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/sideline');
    await authenticatedPage.waitForSelector('table th', { timeout: 15000 });
    const headers = await authenticatedPage.locator('table th').allTextContents();
    expect(headers).toContain('主题');
    expect(headers).toContain('发件人');
    expect(headers).toContain('状态');
  });
});
