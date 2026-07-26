import { apiRequest, type ApiRequestFn } from './client';
import type {
  Tenant,
  TenantListResponse,
  TenantDomainNexthop,
  TenantEgressBinding,
  TenantRoutingSummary,
  CreateTenantNexthopRequest,
  UpdateTenantNexthopRequest,
  CreateTenantEgressBindingRequest,
  UpdateTenantEgressBindingRequest,
  TenantNexthopListResponse,
  TenantEgressBindingListResponse,
} from '@/types/tenant';

export interface RoutingOverviewParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

export function routingOverview(
  params: RoutingOverviewParams = {}
): Promise<TenantListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('page_size', String(params.pageSize));
  if (params.search) q.set('search', params.search);
  if (params.status) q.set('status', params.status);
  const qs = q.toString();
  return apiRequest<TenantListResponse>(
    `/tenants/_meta/routing-overview${qs ? `?${qs}` : ''}`
  );
}

export function getTenantRouting(
  id: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<TenantRoutingSummary> {
  return requestFn<TenantRoutingSummary>(`/tenants/${id}/routing`);
}

export function listNexthops(
  tenantId: number,
  domainId: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<TenantDomainNexthop[]> {
  return requestFn<TenantNexthopListResponse>(
    `/tenants/${tenantId}/domains/${domainId}/nexthops`
  ).then((res) => res.items);
}

export function createNexthop(
  tenantId: number,
  domainId: number,
  data: CreateTenantNexthopRequest,
  requestFn: ApiRequestFn = apiRequest
): Promise<TenantDomainNexthop> {
  return requestFn<TenantDomainNexthop>(
    `/tenants/${tenantId}/domains/${domainId}/nexthops`,
    { method: 'POST', body: data }
  );
}

export function updateNexthop(
  tenantId: number,
  domainId: number,
  nexthopId: number,
  data: UpdateTenantNexthopRequest,
  requestFn: ApiRequestFn = apiRequest
): Promise<TenantDomainNexthop> {
  return requestFn<TenantDomainNexthop>(
    `/tenants/${tenantId}/domains/${domainId}/nexthops/${nexthopId}`,
    { method: 'PUT', body: data }
  );
}

export function deleteNexthop(
  tenantId: number,
  domainId: number,
  nexthopId: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<void> {
  return requestFn<void>(
    `/tenants/${tenantId}/domains/${domainId}/nexthops/${nexthopId}`,
    { method: 'DELETE' }
  );
}

export function listEgressBindings(tenantId: number): Promise<TenantEgressBinding[]> {
  return apiRequest<TenantEgressBindingListResponse>(
    `/tenants/${tenantId}/egress-bindings`
  ).then((res) => res.items);
}

export function createEgressBinding(
  tenantId: number,
  data: CreateTenantEgressBindingRequest
): Promise<TenantEgressBinding> {
  return apiRequest<TenantEgressBinding>(`/tenants/${tenantId}/egress-bindings`, {
    method: 'POST',
    body: data,
  });
}

export function updateEgressBinding(
  tenantId: number,
  bindingId: number,
  data: UpdateTenantEgressBindingRequest
): Promise<TenantEgressBinding> {
  return apiRequest<TenantEgressBinding>(
    `/tenants/${tenantId}/egress-bindings/${bindingId}`,
    { method: 'PUT', body: data }
  );
}

export function deleteEgressBinding(
  tenantId: number,
  bindingId: number
): Promise<void> {
  return apiRequest<void>(`/tenants/${tenantId}/egress-bindings/${bindingId}`, {
    method: 'DELETE',
  });
}

export function listEgressNames(): Promise<string[]> {
  return apiRequest<{ items: string[] }>(`/routing/_meta/egress-ips`).then(
    (res) => res.items
  );
}

export type { Tenant };
