import { apiRequest, type ApiRequestFn } from './client';
import type {
  Tenant,
  TenantDomain,
  TenantStats,
  CreateTenantRequest,
  CreateTenantResponse,
  UpdateTenantRequest,
  CreateTenantDomainRequest,
  UpdateTenantDomainRequest,
  TenantListResponse,
  TenantDomainListResponse,
  TenantLLMSetting,
  UpsertTenantLLMRequest,
  TenantLLMSettingResponse,
  DomainVerifyResult,
} from '@/types/tenant';

export interface ListTenantsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

export function listTenants(params: ListTenantsParams = {}): Promise<TenantListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('page_size', String(params.pageSize));
  if (params.status) q.set('status', params.status);
  if (params.search) q.set('search', params.search);
  const qs = q.toString();
  return apiRequest<TenantListResponse>(`/tenants${qs ? `?${qs}` : ''}`);
}

export function getTenantStats(): Promise<TenantStats> {
  return apiRequest<TenantStats>('/tenants/_meta/stats');
}

export function setTenantStatus(id: number, status: 'active' | 'suspended'): Promise<void> {
  return apiRequest<void>(`/tenants/${id}/status`, { method: 'PUT', body: { status } });
}

export function getTenants(search?: string): Promise<Tenant[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest<TenantListResponse>(`/tenants${params}`).then((res) => res.items);
}

export function getTenant(id: number): Promise<Tenant> {
  return apiRequest<Tenant>(`/tenants/${id}`);
}

export function createTenant(data: CreateTenantRequest): Promise<CreateTenantResponse> {
  return apiRequest<CreateTenantResponse>('/tenants', {
    method: 'POST',
    body: data,
  });
}

export function updateTenant(id: number, data: UpdateTenantRequest): Promise<Tenant> {
  return apiRequest<Tenant>(`/tenants/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export function deleteTenant(id: number): Promise<void> {
  return apiRequest<void>(`/tenants/${id}`, {
    method: 'DELETE',
  });
}

export function getTenantDomains(tenantId: number): Promise<TenantDomain[]> {
  // Mail-routing domain routes require X-Tenant-ID == path :id for system_admin.
  return apiRequest<TenantDomainListResponse>(`/tenants/${tenantId}/domains`, {
    headers: { 'X-Tenant-ID': String(tenantId) },
  }).then((res) => res.items);
}

// Mail-routing domain routes require X-Tenant-ID for system_admin (== path :id
// for /tenants/:id/... routes, == the operated tenant for flat /tenant-domains/...
// routes). Tenant-admin callers may omit tenantId (the JWT carries their tenant).
function tenantHeader(tenantId?: number): { headers?: Record<string, string> } {
  return tenantId !== undefined && tenantId !== null
    ? { headers: { 'X-Tenant-ID': String(tenantId) } }
    : {};
}

export function createTenantDomain(
  tenantId: number,
  data: CreateTenantDomainRequest,
  requestFn: ApiRequestFn = apiRequest
): Promise<TenantDomain> {
  return requestFn<TenantDomain>(`/tenants/${tenantId}/domains`, {
    method: 'POST',
    body: data,
    ...tenantHeader(tenantId),
  });
}

export function updateTenantDomain(
  domainId: number,
  data: UpdateTenantDomainRequest,
  tenantId?: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<TenantDomain> {
  return requestFn<TenantDomain>(`/tenant-domains/${domainId}`, {
    method: 'PUT',
    body: data,
    ...tenantHeader(tenantId),
  });
}

export function deleteTenantDomain(
  domainId: number,
  tenantId?: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<void> {
  return requestFn<void>(`/tenant-domains/${domainId}`, {
    method: 'DELETE',
    ...tenantHeader(tenantId),
  });
}

export function verifyDomainDNS(tenantId: number, did: number): Promise<DomainVerifyResult> {
  return apiRequest<DomainVerifyResult>(`/tenants/${tenantId}/domains/${did}/verify`, {
    method: 'POST',
    ...tenantHeader(tenantId),
  });
}

export function verifyDomainManual(tenantId: number, did: number): Promise<DomainVerifyResult> {
  return apiRequest<DomainVerifyResult>(`/tenants/${tenantId}/domains/${did}/verify/manual`, {
    method: 'POST',
    ...tenantHeader(tenantId),
  });
}

export function getTenantLLMSetting(tenantId: number): Promise<TenantLLMSetting | null> {
  return apiRequest<TenantLLMSettingResponse>(`/tenants/${tenantId}/llm`).then(
    (res) => res.setting
  );
}

export function upsertTenantLLMSetting(
  tenantId: number,
  data: UpsertTenantLLMRequest
): Promise<TenantLLMSetting> {
  return apiRequest<TenantLLMSettingResponse>(`/tenants/${tenantId}/llm`, {
    method: 'PUT',
    body: data,
  }).then((res) => res.setting!);
}

export function deleteTenantLLMSetting(tenantId: number): Promise<void> {
  return apiRequest<void>(`/tenants/${tenantId}/llm`, {
    method: 'DELETE',
  });
}

export function testEwsConnection(config: Record<string, unknown>, tenantId?: number): Promise<{ success: boolean; message: string }> {
  return apiRequest('/tenant-domains/_actions/test-ews', {
    method: 'POST',
    body: config,
    ...tenantHeader(tenantId),
  });
}

export function bulkSetMailSystemType(data: {
  domain_ids: number[];
  mail_system_type: string;
  mail_system_config?: Record<string, unknown> | null;
}, tenantId?: number): Promise<{ updated: number }> {
  return apiRequest('/tenant-domains/_actions/bulk-set-mail-system-type', {
    method: 'POST',
    body: data,
    ...tenantHeader(tenantId),
  });
}

export function resolveDomainTypes(domains: string[], tenantId?: number): Promise<Record<string, string>> {
  return apiRequest(`/tenant-domains/_actions/resolve-types?domains=${encodeURIComponent(domains.join(','))}`, tenantHeader(tenantId));
}
