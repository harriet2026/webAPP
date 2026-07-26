import { apiRequest, ApiError, API_BASE, type ApiRequestFn } from './client';
import type {
  Rule,
  CreateRuleRequest,
  UpdateRuleRequest,
  FieldDefinitionsResponse,
  RuleNode,
} from '@/types/unified-rules';

// Advanced-rules page rows: the backend injects a `keywords` summary and never
// carries hit_stats/health_status on this page, so we widen Rule to expose
// keywords and forbid hit_stats.
export interface RuleWithExtras extends Rule {
  hit_stats?: never;
  keywords?: string[];
}

export type RuleRange = '24h' | '7d' | '30d';

export interface HitTrendPoint {
  bucket: string;
  count: number;
}

export interface EffectStats {
  range: string;
  hits: number;
  processed: number;
  fp_signals: {
    quarantine_total: number;
    quarantine_released: number;
    audit_total: number;
    audit_approved: number;
  };
  fp_rate: number | null;
  has_feedback_signal: boolean;
}

export interface RuleVersionMeta {
  id: number;
  rule_id: number;
  version_no: number;
  changed_by: string;
  change_summary: string;
  created_at: string;
}

export interface EmlTestResult {
  matched: boolean;
  evaluated_conditions: { field: string; operator: string; value: string; result: boolean }[];
  unavailable_fields: string[];
  derived: Record<string, string>;
}

export async function listAdvancedRules(
  requestFn: ApiRequestFn = apiRequest,
): Promise<RuleWithExtras[]> {
  const response = await requestFn<{ items: RuleWithExtras[] }>(
    `/unified-rules?rule_page=advanced_rules`,
  );
  return response.items ?? [];
}

export async function createAdvancedRule(
  data: CreateRuleRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<Rule> {
  return requestFn<Rule>(`/unified-rules`, { method: 'POST', body: data });
}

export async function updateAdvancedRule(
  id: number,
  data: UpdateRuleRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<Rule> {
  return requestFn<Rule>(`/unified-rules/${id}`, { method: 'PUT', body: data });
}

export async function deleteAdvancedRule(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  return requestFn<void>(`/unified-rules/${id}`, { method: 'DELETE' });
}

export async function toggleAdvancedRule(
  id: number,
  isActive: boolean,
  requestFn: ApiRequestFn = apiRequest,
): Promise<Rule> {
  return requestFn<Rule>(`/unified-rules/${id}/status`, {
    method: 'PUT',
    body: { is_active: isActive },
  });
}

export async function getAdvancedFieldDefinitions(
  requestFn: ApiRequestFn = apiRequest,
): Promise<FieldDefinitionsResponse> {
  return requestFn<FieldDefinitionsResponse>(
    // sideline is the superset stage: it exposes normal DATA conditions plus
    // attachment/security facts whose Availability is sideline_async. The
    // editor still derives each rule's persisted stage from its selected
    // fields, so ordinary conditions remain real-time while rules that use a
    // sideline fact execute after the corresponding inspection completes.
    `/unified-rules/field-definitions?stage=sideline&page=advanced_rules`,
  );
}

export async function getModuleEnabled(
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ enabled: boolean }> {
  return requestFn<{ enabled: boolean }>(`/security/advanced-rules/enabled`);
}

export async function setModuleEnabled(
  enabled: boolean,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  return requestFn<void>(`/security/advanced-rules/enabled`, {
    method: 'PUT',
    body: { enabled },
  });
}

export async function getHitTrend(
  id: number,
  range: RuleRange,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ range: string; points: HitTrendPoint[] }> {
  return requestFn<{ range: string; points: HitTrendPoint[] }>(
    `/unified-rules/${id}/hit-trend?range=${range}`,
  );
}

export async function getEffectStats(
  id: number,
  range: RuleRange,
  requestFn: ApiRequestFn = apiRequest,
): Promise<EffectStats> {
  return requestFn<EffectStats>(`/unified-rules/${id}/effect-stats?range=${range}`);
}

export async function listRuleVersions(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ items: RuleVersionMeta[] }> {
  return requestFn<{ items: RuleVersionMeta[] }>(`/unified-rules/${id}/versions`);
}

export async function rollbackRule(
  id: number,
  versionNo: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<Rule> {
  return requestFn<Rule>(`/unified-rules/${id}/rollback`, {
    method: 'POST',
    body: { version_no: versionNo },
  });
}

// Multipart EML test — cannot go through apiRequest (it JSON.stringify's the
// body and forces Content-Type: application/json). We fetch directly and let
// the browser set the multipart boundary. Errors mirror apiRequest's ApiError
// semantics so callers can handle them uniformly.
export async function testRuleWithEml(
  file: File,
  conditionTree: RuleNode,
): Promise<EmlTestResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('condition_tree', JSON.stringify(conditionTree));

  const response = await fetch(`${API_BASE}/unified-rules/test-eml`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const message =
      typeof error.error === 'string' ? error.error : error.error?.message || 'Request failed';
    throw new ApiError(response.status, message, error);
  }

  return response.json();
}
