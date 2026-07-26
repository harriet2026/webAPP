import { apiRequest, type ApiRequestFn } from './client';
import type { IPFilterRulePayload, IPFilterRuleView, IPGroupMeta } from '@/types/ip-filter';

interface UnifiedRuleEnvelope {
  version: string;
  scope: string;
  exported_at: string;
  tenant_context: { mode: string };
  data: { rules: Array<{ metadata?: string | Record<string, unknown> }> };
}

interface UnifiedImportResponse {
  summary?: unknown;
  duplicates?: unknown;
  invalid_items?: unknown;
}

export async function getIPFilterRules(
  params: { page?: number; page_size?: number; q?: string; list_type?: string; is_active?: boolean; sort?: string },
  requestFn: ApiRequestFn = apiRequest,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.q) qs.set('q', params.q);
  if (params.list_type) qs.set('list_type', params.list_type);
  if (params.is_active !== undefined) qs.set('is_active', String(params.is_active));
  if (params.sort) qs.set('sort', params.sort);
  return requestFn<{ items: IPFilterRuleView[]; total: number }>(`/ip-filter/rules?${qs}`);
}

// 全局 IP 组元信息（GT-11464：expression 的组多选数据源）。
// 真实端点：/unified-rules/_meta/groups?type=ip，返回 {items:[{id,label,rule_id}]}。
export async function getIPGroups(requestFn: ApiRequestFn = apiRequest) {
  return requestFn<{ items: IPGroupMeta[] }>('/unified-rules/_meta/groups?type=ip');
}

export async function createIPFilterRule(data: IPFilterRulePayload, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<IPFilterRuleView>('/ip-filter/rules', { method: 'POST', body: data });
}

export async function getIPFilterRule(id: number, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<IPFilterRuleView>(`/ip-filter/rules/${id}`);
}

export async function updateIPFilterRule(id: number, data: IPFilterRulePayload, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<IPFilterRuleView>(`/ip-filter/rules/${id}`, { method: 'PUT', body: data });
}

export async function deleteIPFilterRule(id: number, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<void>(`/ip-filter/rules/${id}`, { method: 'DELETE' });
}

export async function setIPFilterRuleStatus(id: number, isActive: boolean, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<void>(`/ip-filter/rules/${id}/status`, { method: 'PUT', body: { is_active: isActive } });
}

export async function bulkIPFilterRules(action: 'enable' | 'disable' | 'delete', ids: number[], requestFn: ApiRequestFn = apiRequest) {
  return requestFn<{ affected: number }>('/ip-filter/rules/bulk', { method: 'POST', body: { action, ids } });
}

export async function exportIPFilterRules(listType?: string, requestFn: ApiRequestFn = apiRequest) {
  const qs = new URLSearchParams({ scope: 'ip_filter', include: 'rules' });
  const envelope = await requestFn<UnifiedRuleEnvelope>(`/unified-rules/export?${qs}`);
  if (listType && envelope?.data?.rules) {
    envelope.data.rules = envelope.data.rules.filter((rule) => {
      try {
        const meta = typeof rule.metadata === 'string' ? JSON.parse(rule.metadata) : rule.metadata;
        return !!meta && typeof meta === 'object' && (meta as Record<string, unknown>).list_type === listType;
      } catch {
        return false;
      }
    });
  }
  return envelope;
}

export async function importIPFilterRules(data: unknown, requestFn: ApiRequestFn = apiRequest) {
  const parsedData = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};
  const file = parsedData.version ? parsedData : {
    version: 'rule-settings/v1',
    scope: 'ip_filter',
    exported_at: new Date().toISOString(),
    tenant_context: { mode: 'multi' },
    data: { rules: Array.isArray(parsedData.rules) ? parsedData.rules : [] },
  };
  const body = {
    file,
    scope: 'ip_filter',
    selection: { include_rules: true },
    import_mode: { mode: 'restore_original_tenants' },
  };
  const preview = await requestFn<UnifiedImportResponse>('/unified-rules/import/preview?scope=ip_filter', { method: 'POST', body });
  return requestFn<UnifiedImportResponse>('/unified-rules/import?scope=ip_filter', {
    method: 'POST',
    body: {
      ...body,
      duplicate_resolutions: { apply_to_remaining: 'skip' },
    },
  }).then((result) => ({ ...result, preview }));
}
