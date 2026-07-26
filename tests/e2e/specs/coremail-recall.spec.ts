import { test, expect } from '../fixtures/auth.fixture';
import { uniqueSuffix } from '../helpers/test-data';

const API_BASE = 'http://localhost:18080/api/v1';

async function apiFetch(page: import('@playwright/test').Page, method: string, path: string, body?: object) {
  const url = `${API_BASE}${path}`;
  const opts: Record<string, unknown> = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) (opts as any).data = body;
  const resp = await page.context().request.fetch(url, opts);
  let json: any = null;
  try { json = await resp.json(); } catch {}
  return { status: resp.status(), json, text: '' };
}

test.describe.serial('Coremail Recall Key Management', () => {
  const keyId = `e2e_key_${uniqueSuffix()}`;
  const keySecret = 'e2e_secret_abc1234567890';
  let createdKeyId: number;

  test('list recall keys returns items array', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'GET', '/recall-keys');
    expect(status).toBe(200);
    expect(json).toHaveProperty('items');
    expect(Array.isArray(json.items)).toBeTruthy();
  });

  test('create recall key', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'POST', '/recall-keys', {
      key_id: keyId,
      key_secret: keySecret,
    });
    expect(status).toBe(201);
    expect(json).toHaveProperty('id');
    expect(json.key_id).toBe(keyId);
    expect(json.is_active).toBe(1);
    createdKeyId = json.id;
  });

  test('list recall keys includes created key', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'GET', '/recall-keys');
    expect(status).toBe(200);
    const found = json.items.find((k: any) => k.id === createdKeyId);
    expect(found).toBeDefined();
    expect(found.key_id).toBe(keyId);
  });

  test('update recall key secret', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'PUT',
      `/recall-keys/${createdKeyId}`,
      { key_secret: 'updated_secret_xyz987' },
    );
    expect(status).toBe(200);
    expect(json.id).toBe(createdKeyId);
  });

  test('update recall key deactivate', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'PUT',
      `/recall-keys/${createdKeyId}`,
      { is_active: 0 },
    );
    expect(status).toBe(200);

    const listResult = await apiFetch(authenticatedPage, 'GET', '/recall-keys');
    const found = listResult.json.items.find((k: any) => k.id === createdKeyId);
    expect(found.is_active).toBe(0);
  });

  test('update recall key reactivate', async ({ authenticatedPage }) => {
    const { status } = await apiFetch(
      authenticatedPage,
      'PUT',
      `/recall-keys/${createdKeyId}`,
      { is_active: 1 },
    );
    expect(status).toBe(200);
  });

  test('delete recall key', async ({ authenticatedPage }) => {
    const { status } = await apiFetch(authenticatedPage, 'DELETE', `/recall-keys/${createdKeyId}`);
    expect(status).toBe(204);

    const listResult = await apiFetch(authenticatedPage, 'GET', '/recall-keys');
    const found = listResult.json.items.find((k: any) => k.id === createdKeyId);
    expect(found).toBeUndefined();
  });
});

test.describe.serial('Coremail Recall License Management', () => {
  const suffix = uniqueSuffix();
  const keyId = `e2e_lic_key_${suffix}`;
  const keySecret = 'e2e_lic_secret_abc123';
  const licenseId = `e2e_license_${suffix}`;
  const cid = `cid_${suffix}`;
  const tenantCode = `e2erc-${suffix.replace(/_/g, '').slice(-10)}`;
  let recallKeyId: number;
  let tenantId: number;
  let createdLicenseRowId: number;

  test('setup: create tenant and recall key', async ({ authenticatedPage }) => {
    const tenantRes = await apiFetch(authenticatedPage, 'POST', '/tenants', {
      name: `e2e_recall_tenant_${suffix}`,
      code: tenantCode,
    });
    expect(tenantRes.status).toBe(201);
    tenantId = tenantRes.json.tenant?.id ?? tenantRes.json.id;

    const keyRes = await apiFetch(authenticatedPage, 'POST', '/recall-keys', {
      key_id: keyId,
      key_secret: keySecret,
    });
    expect(keyRes.status).toBe(201);
    recallKeyId = keyRes.json.id;
  });

  test('list recall licenses returns items array', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'GET', '/recall-licenses');
    expect(status).toBe(200);
    expect(json).toHaveProperty('items');
    expect(Array.isArray(json.items)).toBeTruthy();
  });

  test('create recall tenant license', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'POST', '/recall-licenses', {
      tenant_id: tenantId,
      key_id: keyId,
      license_id: licenseId,
      cid: cid,
    });
    expect(status).toBe(201);
    expect(json).toHaveProperty('id');
    expect(json.tenant_id).toBe(tenantId);
    expect(json.key_id).toBe(keyId);
    expect(json.license_id).toBe(licenseId);
    expect(json.cid).toBe(cid);
    createdLicenseRowId = json.id;
  });

  test('list recall licenses includes created license', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'GET', '/recall-licenses');
    expect(status).toBe(200);
    const found = json.items.find((l: any) => l.id === createdLicenseRowId);
    expect(found).toBeDefined();
    expect(found.license_id).toBe(licenseId);
  });

  test('filter licenses by key_id', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'GET',
      `/recall-licenses?key_id=${keyId}`,
    );
    expect(status).toBe(200);
    expect(json.items.length).toBeGreaterThanOrEqual(1);
    for (const item of json.items) {
      expect(item.key_id).toBe(keyId);
    }
  });

  test('delete recall tenant license', async ({ authenticatedPage }) => {
    const { status } = await apiFetch(
      authenticatedPage,
      'DELETE',
      `/recall-licenses/${createdLicenseRowId}`,
    );
    expect(status).toBe(204);

    const listResult = await apiFetch(authenticatedPage, 'GET', '/recall-licenses');
    const found = listResult.json.items.find((l: any) => l.id === createdLicenseRowId);
    expect(found).toBeUndefined();
  });

  test('cleanup: delete tenant and recall key', async ({ authenticatedPage }) => {
    await apiFetch(authenticatedPage, 'DELETE', `/recall-keys/${recallKeyId}`);
    await apiFetch(authenticatedPage, 'DELETE', `/tenants/${tenantId}`);
  });
});

test.describe.serial('Coremail Recall Request Management', () => {
  test('list recall requests returns paginated response', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'GET', '/recall-requests');
    expect(status).toBe(200);
    expect(json).toHaveProperty('items');
    expect(json).toHaveProperty('total');
    expect(json).toHaveProperty('page');
    expect(json).toHaveProperty('page_size');
    expect(Array.isArray(json.items)).toBeTruthy();
  });

  test('list recall requests with pagination params', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'GET',
      '/recall-requests?page=1&page_size=5',
    );
    expect(status).toBe(200);
    expect(json.page).toBe(1);
    expect(json.page_size).toBe(5);
    expect(json.items.length).toBeLessThanOrEqual(5);
  });

  test('list recall requests with operate_result filter', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'GET',
      '/recall-requests?operate_result=handling',
    );
    expect(status).toBe(200);
    expect(Array.isArray(json.items)).toBeTruthy();
    for (const item of json.items) {
      expect(item.operate_result).toBe('handling');
    }
  });

  test('list recall requests with tenant_id filter', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'GET',
      '/recall-requests?tenant_id=999999',
    );
    expect(status).toBe(200);
    expect(json.items.length).toBe(0);
    expect(json.total).toBe(0);
  });

  test('list recall reports for non-existent request returns empty', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'GET',
      '/recall-requests/999999/reports',
    );
    expect(status).toBe(200);
    expect(json).toHaveProperty('items');
    expect(Array.isArray(json.items)).toBeTruthy();
  });

  test('create recall request with invalid message_id returns error', async ({ authenticatedPage }) => {
    const { status } = await apiFetch(authenticatedPage, 'POST', '/recall-requests', {
      message_id: 'nonexistent_message_id_xyz',
      receivers: ['user@test.local'],
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
