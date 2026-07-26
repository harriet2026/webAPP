import { apiRequest, type ApiRequestFn } from './client';
import type { TenantDomain, TenantDomainListResponse } from '@/types/tenant';

export interface RoutingScope {
  mode: 'single' | 'multi';
  tenant_id: number | null;
}

export function getRoutingScope(requestFn: ApiRequestFn = apiRequest): Promise<RoutingScope> {
  return requestFn<RoutingScope>('/routing/_meta/scope');
}

export interface DomainProbeResult {
  probe_status: 'normal' | 'abnormal' | 'partial' | 'unchecked';
  detail?: string;
  last_probe_time: string;
  nexthops: Array<{
    id: number;
    host: string;
    port: number;
    probe_status: 'normal' | 'abnormal' | 'unchecked';
  }>;
}

/** List all domains for a tenant (mail-routing UI, all product forms). */
export function listTenantDomains(
  tenantId: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<TenantDomain[]> {
  return requestFn<TenantDomainListResponse>(`/tenants/${tenantId}/domains`).then(
    (res) => res.items
  );
}

/** Trigger TCP-dial probe for all active nexthops of a domain. */
export function probeDomain(
  tenantId: number,
  domainId: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<DomainProbeResult> {
  return requestFn<DomainProbeResult>(
    `/tenants/${tenantId}/domains/${domainId}/probe`,
    { method: 'POST' }
  );
}
