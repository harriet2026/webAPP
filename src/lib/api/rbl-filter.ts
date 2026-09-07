import { apiRequest, type ApiRequestFn } from './client';
import type {
  RBLFilterRulePayload,
  RBLFilterRuleTestRequest,
  RBLFilterRuleTestResponse,
  RBLFilterRuleView,
  RBLProbeResponse,
} from '@/types/rbl-filter';
import { fetchAllPages } from './pagination';

export interface RBLFilterRuleListParams {
  page?: number;
  page_size?: number;
  q?: string;
  match_mode?: string;
  product_action?: string;
  is_active?: boolean;
  sort?: string;
}

function rblFilterRulesPath(params: RBLFilterRuleListParams): string {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.q) qs.set('q', params.q);
  if (params.match_mode) qs.set('match_mode', params.match_mode);
  if (params.product_action) qs.set('product_action', params.product_action);
  if (params.is_active !== undefined) qs.set('is_active', String(params.is_active));
  if (params.sort) qs.set('sort', params.sort);
  const query = qs.toString();
  return `/rbl-filter/rules${query ? `?${query}` : ''}`;
}

export async function getRBLFilterRules(
  params: RBLFilterRuleListParams,
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<{ items: RBLFilterRuleView[]; total: number }>(rblFilterRulesPath(params));
}

export async function listAllRBLFilterRules(
  params: Omit<RBLFilterRuleListParams, 'page' | 'page_size'>,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ items: RBLFilterRuleView[] }> {
  const items = await fetchAllPages<RBLFilterRuleView>(rblFilterRulesPath(params), requestFn);
  return { items };
}

export async function createRBLFilterRule(data: RBLFilterRulePayload, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<RBLFilterRuleView>('/rbl-filter/rules', { method: 'POST', body: data });
}

export async function getRBLFilterRule(id: number, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<RBLFilterRuleView>(`/rbl-filter/rules/${id}`);
}

export async function updateRBLFilterRule(id: number, data: RBLFilterRulePayload, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<RBLFilterRuleView>(`/rbl-filter/rules/${id}`, { method: 'PUT', body: data });
}

export async function deleteRBLFilterRule(id: number, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<void>(`/rbl-filter/rules/${id}`, { method: 'DELETE' });
}

export async function setRBLFilterRuleStatus(id: number, isActive: boolean, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<void>(`/rbl-filter/rules/${id}/status`, { method: 'PUT', body: { is_active: isActive } });
}

export async function bulkRBLFilterRules(action: 'enable' | 'disable' | 'delete', ids: number[], requestFn: ApiRequestFn = apiRequest) {
  return requestFn<{ affected: number }>('/rbl-filter/rules/bulk', { method: 'POST', body: { action, ids } });
}

export async function getRBLFilterStats(days: number = 7, requestFn: ApiRequestFn = apiRequest) {
  const response = await requestFn<{ stats: Record<string, number> }>(`/rbl-filter/stats?days=${days}`);
  return response.stats ?? {};
}

export async function probeRBL(clientIP: string, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<RBLProbeResponse>('/rbl-filter/probe', { method: 'POST', body: { client_ip: clientIP } });
}

export async function testRBLFilterRule(data: RBLFilterRuleTestRequest, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<RBLFilterRuleTestResponse>('/rbl-filter/rules/test', { method: 'POST', body: data });
}
