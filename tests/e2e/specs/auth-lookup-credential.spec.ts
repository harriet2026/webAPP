import { test, expect } from '../fixtures/auth.fixture';
import { SMTPCredentialsPage } from '../pages/smtp-credentials.page';
import { uniqueSuffix } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';
import { internalFetch, INTERNAL_API_BASE } from '../helpers/internal-client';

const API_BASE = 'http://localhost:18080/api/v1';
const HMAC_SECRET = 'test-hmac-secret-for-e2e';

async function lookupCredential(username: string): Promise<Response> {
  const body = JSON.stringify({ username });
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}\nPOST\n/internal/v1/auth/lookup-credential\n${body}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  const sig = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return internalFetch(`${INTERNAL_API_BASE}/internal/v1/auth/lookup-credential`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OSG-Timestamp': ts,
      'X-OSG-Signature': sig,
    },
    body,
  });
}

test.describe.serial('Auth Lookup Credential (authd DB independence)', () => {
  const testUsername = `authlookup_${uniqueSuffix()}`;
  const testPassword = 'TestPass123!';
  let tenantId: number;
  let token = '';

  test('create credential for lookup test', async ({ authenticatedPage }) => {
    const loginResp = await authenticatedPage.request.post(`${API_BASE}/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    });
    token = (await loginResp.json()).token;

    const tenantResp = await authenticatedPage.request.post(`${API_BASE}/tenants`, {
      data: { name: `tenant_authlookup_${uniqueSuffix()}`, code: `authlookup-${uniqueSuffix()}` },
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    expect(tenantResp.status()).toBe(201);
    const tenantBody = await tenantResp.json();
    tenantId = (tenantBody.tenant ?? tenantBody).id;

    // Activate tenant so GetSMTPCredentialByUsername (tenantOperationalSQL) can find credentials.
    await authenticatedPage.request.put(`${API_BASE}/tenants/${tenantId}/status`, {
      data: { status: 'active' },
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });

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
  });

  test('lookup credential returns correct data', async ({ authenticatedPage }) => {
    const resp = await lookupCredential(testUsername);
    expect(resp.status).toBe(200);

    const data = await resp.json();
    expect(data.username).toBe(testUsername);
    expect(data.password_hash).toBeTruthy();
    expect(data.is_active).toBe(true);
    expect(data.auth_backend).toBe('local');
    expect(data.tenant_id).toBe(tenantId);
    expect(data.failed_attempts).toBe(0);
    expect(data.locked_until).toBeNull();
  });

  test('lookup nonexistent user returns 404', async ({ authenticatedPage }) => {
    const resp = await lookupCredential(`nonexistent_${uniqueSuffix()}`);
    expect(resp.status).toBe(404);
  });

  test('lookup without HMAC returns 401', async ({ authenticatedPage }) => {
    const resp = await internalFetch(`${INTERNAL_API_BASE}/internal/v1/auth/lookup-credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername }),
    });
    expect(resp.status).toBe(401);
  });

  test('credential lockout via ingest state machine', async ({ authenticatedPage }) => {
    if (!token) {
      const loginResp = await authenticatedPage.request.post(`${API_BASE}/auth/login`, {
        data: { username: 'admin', password: 'admin123' },
      });
      token = (await loginResp.json()).token;
    }

    const lockoutCred = `lockout_${uniqueSuffix()}`;
    const credResp = await fetch(`${API_BASE}/smtp-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        username: lockoutCred,
        password: 'TestPass123!',
        tenant_id: tenantId,
        auth_backend: 'local',
      }),
    });
    expect(credResp.status).toBe(201);
    const credId = (await credResp.json()).id;

    const failedAttempts = [];
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      failedAttempts.push({
        username: lockoutCred,
        client_ip: `10.50.${Math.floor(i / 256)}.${i % 256}`,
        success: false,
        failure_reason: 'invalid password',
        tenant_id: tenantId,
        auth_backend: 'local',
        attempted_at: new Date(now + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      });
    }

    const ingestUrl = `${INTERNAL_API_BASE}/internal/auth-attempts/ingest`;
    const ingestResp = await internalFetch(
      ingestUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(failedAttempts),
      }
    );
    expect(ingestResp.status).toBe(201);

    await authenticatedPage.waitForTimeout(2000);

    const lookupResp = await lookupCredential(lockoutCred);
    expect(lookupResp.status).toBe(200);
    const lookupData = await lookupResp.json();
    expect(lookupData.locked_until).not.toBeNull();
    expect(lookupData.failed_attempts).toBeGreaterThanOrEqual(5);

    try {
      await fetch(`${API_BASE}/smtp-credentials/${credId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch {}
  });

  test('cleanup test credential', async ({ authenticatedPage }) => {
    if (!token) {
      const loginResp = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      });
      token = (await loginResp.json()).token;
    }

    const page = new SMTPCredentialsPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();
    await page.search(testUsername);

    try {
      await page.deleteCredential(testUsername);
      await waitForToast(authenticatedPage);
    } catch {}

    await fetch(`${API_BASE}/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  });
});
