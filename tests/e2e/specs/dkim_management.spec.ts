import { test, expect } from '../fixtures/auth.fixture';
import { uniqueSuffix, uniqueSuffixAlnum } from '../helpers/test-data';

const API_BASE = 'http://localhost:18080/api/v1';
const MOCKDNS_URL = 'http://localhost:5380';

test.describe.serial('DKIM Key Management', () => {
  const suffix = uniqueSuffix();
  const alnum = uniqueSuffixAlnum();
  let tenantId: number;
  let domain: string;
  let token: string;
  let keyId: number;

  test('setup tenant and domain', async ({ authenticatedPage }) => {
    token = (await authenticatedPage.evaluate(() => localStorage.getItem('osgateway_token'))) || '';

    const tenantResp = await authenticatedPage.request.post(`${API_BASE}/tenants`, {
      data: { name: `dkim_tenant_${suffix}`, code: `dkim-${suffix}` },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(tenantResp.ok()).toBeTruthy();
    const tenantBody = await tenantResp.json();
    tenantId = (tenantBody.tenant ?? tenantBody).id;

    domain = `dkim-${alnum}.local`;
    const domainResp = await authenticatedPage.request.post(`${API_BASE}/tenants/${tenantId}/domains`, {
      data: {
        domain,
        next_hop_type: 'domain',
        next_hop_host: 'smtpsink',
        next_hop_port: 25,
        mail_system_type: 'standard_smtp',
      },
      // Mail-routing domain API requires X-Tenant-ID == path :id for system_admin.
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
    });
    expect(domainResp.ok()).toBeTruthy();
  });

  test('generate DKIM key via API', async ({ authenticatedPage }) => {
    const resp = await authenticatedPage.request.post(`${API_BASE}/dkim/keys/generate`, {
      data: {
        tenant_id: tenantId,
        domain,
        selector: 's2026',
        algorithm: 'rsa-sha256',
        key_size: 2048,
      },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(201);
    const data = await resp.json();
    // The private key is never echoed back — signing is server-side (see
    // GenerateDKIMKey in internal/api/dkim_keys.go, PrivateKeyPEM left empty /
    // omitempty). The GET below also asserts it stays absent.
    expect(data.private_key_pem).toBeFalsy();
    expect(data.public_key).toBeTruthy();
    expect(data.dns_record_name).toContain('s2026._domainkey');
    expect(data.dns_record).toContain('v=DKIM1');
    expect(data.dns_status).toBe('unverified');
    expect(data.is_active).toBe(false);
    keyId = data.id;

    const getResp = await authenticatedPage.request.get(`${API_BASE}/dkim/keys/${keyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getResp.ok()).toBeTruthy();
    const getData = await getResp.json();
    expect(getData.private_key_pem).toBeFalsy();
  });

  test('list DKIM keys', async ({ authenticatedPage }) => {
    const resp = await authenticatedPage.request.get(`${API_BASE}/dkim/keys?tenant_id=${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    expect(data.total).toBeGreaterThanOrEqual(1);
  });

  test('verify DNS and activate', async ({ authenticatedPage }) => {
    const keyResp = await authenticatedPage.request.get(`${API_BASE}/dkim/keys/${keyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const keyData = await keyResp.json();

    await authenticatedPage.request.post(`${MOCKDNS_URL}/records`, {
      data: { name: keyData.dns_record_name, type: 'TXT', value: keyData.dns_record },
    });

    const verifyResp = await authenticatedPage.request.post(`${API_BASE}/dkim/keys/${keyId}/verify-dns`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(verifyResp.ok()).toBeTruthy();
    const verifyData = await verifyResp.json();
    expect(verifyData.dns_status).toBe('verified');

    const activateResp = await authenticatedPage.request.put(`${API_BASE}/dkim/keys/${keyId}/status`, {
      data: { is_active: true },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(activateResp.status()).toBe(204);
  });

  test('activate unverified key fails', async ({ authenticatedPage }) => {
    const genResp = await authenticatedPage.request.post(`${API_BASE}/dkim/keys/generate`, {
      data: {
        tenant_id: tenantId,
        domain,
        selector: `unverified-${alnum}`,
        algorithm: 'rsa-sha256',
        key_size: 2048,
      },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(genResp.status()).toBe(201);
    const unverifiedKey = await genResp.json();

    const activateResp = await authenticatedPage.request.put(`${API_BASE}/dkim/keys/${unverifiedKey.id}/status`, {
      data: { is_active: true },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(activateResp.status()).toBe(409);
  });

  test('invalid selector rejected', async ({ authenticatedPage }) => {
    const resp = await authenticatedPage.request.post(`${API_BASE}/dkim/keys/generate`, {
      data: {
        tenant_id: tenantId,
        domain,
        selector: 'INVALID',
        algorithm: 'rsa-sha256',
        key_size: 2048,
      },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(422);
  });

  test('delete inactive key', async ({ authenticatedPage }) => {
    const genResp = await authenticatedPage.request.post(`${API_BASE}/dkim/keys/generate`, {
      data: {
        tenant_id: tenantId,
        domain,
        selector: `todelete-${alnum}`,
        algorithm: 'rsa-sha256',
        key_size: 2048,
      },
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    expect(genResp.status()).toBe(201);
    const deleteKeyId = (await genResp.json()).id;

    const delResp = await authenticatedPage.request.delete(`${API_BASE}/dkim/keys/${deleteKeyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delResp.status()).toBe(204);
  });

  test('delete active key fails', async ({ authenticatedPage }) => {
    const delResp = await authenticatedPage.request.delete(`${API_BASE}/dkim/keys/${keyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delResp.status()).toBe(409);
  });

  test('cleanup', async ({ authenticatedPage }) => {
    await authenticatedPage.request.post(`${MOCKDNS_URL}/records/reset`);

    if (tenantId) {
      await authenticatedPage.request.delete(`${API_BASE}/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
