import { APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:18080/api/v1';
const INGEST_URL = (process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081') + '/internal/mail-logs/ingest';

export async function getAdminToken(request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${API_BASE}/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  const body = await resp.json();
  return body.token;
}

export async function createTenant(
  request: APIRequestContext,
  token: string,
  name: string
): Promise<number> {
  const code = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const resp = await request.post(`${API_BASE}/tenants`, {
    data: { name, code, description: 'E2E test tenant' },
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await resp.json();
  return body.tenant?.id ?? body.id;
}

export async function deleteTenant(
  request: APIRequestContext,
  token: string,
  tenantId: number
) {
  await request.delete(`${API_BASE}/tenants/${tenantId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function seedMailLogs(request: APIRequestContext): Promise<void> {
  const now = new Date();
  const logs = [];

  for (let i = 0; i < 5; i++) {
    logs.push({
      message_id: `<e2e-search-test-${i}@test.local>`,
      client_ip: `10.0.${i}.1`,
      sender: `search-test-sender-${i}@test.local`,
      sender_domain: 'test.local',
      recipients: [`recipient-${i}@testdomain.local`],
      subject: `E2E Test Subject ${i}`,
      action: i % 2 === 0 ? 'accept' : 'reject',
      status: i % 2 === 0 ? 'delivered' : 'rejected',
      spf_valid: i % 2 === 0 ? 'pass' : 'fail',
      dkim_valid: i % 3 === 0 ? 'pass' : 'fail',
      received_at: now.toISOString(),
      timestamp: now.toISOString(),
    });
  }

  await request.post(INGEST_URL, {
    data: logs,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
