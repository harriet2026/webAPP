import { APIRequestContext, APIResponse } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:18080/api/v1';

export class ApiClient {
  private request: APIRequestContext;
  private token: string | null = null;
  private tenantId: number | null = null;

  constructor(request: APIRequestContext, token?: string) {
    this.request = request;
    this.token = token || null;
  }

  setToken(token: string) {
    this.token = token;
  }

  setTenantId(id: number | null) {
    this.tenantId = id;
  }

  getTenantId(): number | null {
    return this.tenantId;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.tenantId !== null) {
      headers['X-Tenant-ID'] = String(this.tenantId);
    }
    return headers;
  }

  async get(path: string): Promise<APIResponse> {
    return this.request.get(`${API_BASE_URL}${path}`, {
      headers: this.getHeaders(),
    });
  }

  async post(path: string, data?: object): Promise<APIResponse> {
    return this.request.post(`${API_BASE_URL}${path}`, {
      headers: this.getHeaders(),
      data,
    });
  }

  async put(path: string, data?: object): Promise<APIResponse> {
    return this.request.put(`${API_BASE_URL}${path}`, {
      headers: this.getHeaders(),
      data,
    });
  }

  async delete(path: string): Promise<APIResponse> {
    return this.request.delete(`${API_BASE_URL}${path}`, {
      headers: this.getHeaders(),
    });
  }

  async login(username: string, password: string): Promise<string> {
    const response = await this.post('/auth/login', { username, password });
    const data = await response.json();
    if (data.token) {
      this.token = data.token;
      return data.token;
    }
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }
}

export async function createAuthenticatedClient(request: APIRequestContext): Promise<ApiClient> {
  const client = new ApiClient(request);
  const token = await client.login('admin', 'admin123');
  // Fetch tenants and set X-Tenant-ID so per-tenant API calls work.
  // System admins must supply X-Tenant-ID or the API rejects with 400.
  // page_size must cover every tenant: the list is NOT id-ordered, so the default
  // first page can omit the global lowest id once earlier suites left hundreds of
  // tenants behind — matching globalSetup, which also lists with page_size=500.
  const tenantsResp = await request.get(`${API_BASE_URL}/tenants?page_size=500`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (tenantsResp.ok()) {
    const data = await tenantsResp.json() as { items?: { id: number }[] };
    // Use the LOWEST-id tenant, not items[0] — the list is not id-ordered, and
    // globalSetup (plus the tenant_admin it provisions) targets the lowest id.
    // Picking items[0] (or the lowest of only the first page) can scope API-created
    // fixtures to a different tenant than the tenant_admin page shows, so the
    // seeded rows never appear.
    const lowestId = (data?.items ?? []).slice().sort((a, b) => a.id - b.id)[0]?.id;
    if (lowestId != null) {
      client.setTenantId(lowestId);
    }
  }
  return client;
}
