import { apiRequest, type ApiRequestFn } from './client';
import type {
  IPFrequencyRulePayload,
  IPFrequencyRuleView,
  IPFrequencyTestRequest,
  IPFrequencyTestResponse,
  SuspendedIP,
} from '@/types/ip-frequency';

export async function getIPFrequencyRules(
  params: {
    page?: number;
    page_size?: number;
    q?: string;
    search?: string;
    scope_type?: string;
    is_active?: boolean;
    sort?: string;
  },
  requestFn: ApiRequestFn = apiRequest,
) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.page_size) searchParams.set('page_size', String(params.page_size));
  if (params.q || params.search) searchParams.set('q', params.q || params.search || '');
  if (params.scope_type) searchParams.set('scope_type', params.scope_type);
  if (params.is_active !== undefined) searchParams.set('is_active', String(params.is_active));
  if (params.sort) searchParams.set('sort', params.sort);
  const qs = searchParams.toString();
  return requestFn<{ items: IPFrequencyRuleView[]; total: number; page: number; page_size: number }>(
    `/ip-frequency/rules${qs ? `?${qs}` : ''}`,
  );
}

export async function getIPFrequencyRule(id: number, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<IPFrequencyRuleView>(`/ip-frequency/rules/${id}`);
}

export async function createIPFrequencyRule(data: IPFrequencyRulePayload, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<IPFrequencyRuleView>('/ip-frequency/rules', { method: 'POST', body: data });
}

export async function updateIPFrequencyRule(
  id: number,
  data: IPFrequencyRulePayload,
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<IPFrequencyRuleView>(`/ip-frequency/rules/${id}`, { method: 'PUT', body: data });
}

export async function deleteIPFrequencyRule(
  id: number,
  releaseSuspended: boolean = false,
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<void>(`/ip-frequency/rules/${id}`, {
    method: 'DELETE',
    body: releaseSuspended ? { release_suspended: true } : undefined,
  });
}

export async function setIPFrequencyRuleStatus(
  id: number,
  isActive: boolean,
  releaseSuspended: boolean = false,
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<{ id: number; is_active: boolean }>(`/ip-frequency/rules/${id}/status`, {
    method: 'PUT',
    body: { is_active: isActive, release_suspended: releaseSuspended },
  });
}

export async function bulkIPFrequencyRules(
  data: { action: 'delete' | 'toggle'; ids: number[]; is_active?: boolean },
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<{ action: string; ids: number[]; count: number }>('/ip-frequency/rules/bulk', {
    method: 'POST',
    body: data,
  });
}

export async function exportIPFrequencyRules(requestFn: ApiRequestFn = apiRequest) {
  return requestFn<{ version: string; exported_at: string; rules: IPFrequencyRuleView[] }>(
    '/ip-frequency/rules/export',
  );
}

export async function importIPFrequencyRules(
  data: { rules: IPFrequencyRulePayload[] },
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<{ imported: number; errors: string[]; total: number }>('/ip-frequency/rules/import', {
    method: 'POST',
    body: data,
  });
}

export async function testIPFrequencyRule(data: IPFrequencyTestRequest, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<IPFrequencyTestResponse>('/ip-frequency/rules/test', { method: 'POST', body: data });
}

export async function getSuspendedIPs(requestFn: ApiRequestFn = apiRequest) {
  const resp = await requestFn<{ suspensions: SuspendedIP[] }>('/ip-frequency/suspended-ips');
  return resp.suspensions ?? [];
}

export async function getRuleSuspendedIPs(ruleId: number, requestFn: ApiRequestFn = apiRequest) {
  const resp = await requestFn<{ suspensions: SuspendedIP[] }>(`/ip-frequency/rules/${ruleId}/suspended-ips`);
  return resp.suspensions ?? [];
}

export async function releaseSuspendedIP(ip: string, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<{ released: string }>('/ip-frequency/suspended-ips/release', {
    method: 'POST',
    body: { ip },
  });
}

export async function bulkReleaseSuspendedIPs(
  data: { ips?: string[]; rule_id?: number; all?: boolean },
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<{ released: number | string }>('/ip-frequency/suspended-ips/bulk-release', {
    method: 'POST',
    body: data,
  });
}
