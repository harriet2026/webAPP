import { apiRequest, type ApiRequestFn } from './client';
import type { Rule, CreateRuleRequest, UpdateRuleRequest, FieldDefinitionsResponse, SystemTag, SidelineCheckMeta } from '@/types/unified-rules';
import type { DetectionProfile } from '@/types/unified-rules';

export const API_BASE = '';

export interface RuleExportTenantContext {
  mode: string;
  tenant_id?: number;
  tenant_name?: string;
}

export interface RuleExportData {
  rules?: Rule[];
  detection_profiles?: DetectionProfile[];
}

export interface RuleExportEnvelope {
  version: string;
  exported_at: string;
  scope: string;
  tenant_context: RuleExportTenantContext;
  data: RuleExportData;
}

export interface RuleImportSelection {
  include_rules: boolean;
  include_detection_profiles: boolean;
}

export type RuleExportSelection = RuleImportSelection;

export interface RuleImportMode {
  mode: 'restore_original_tenants' | 'import_to_selected_tenant';
  target_tenant_id?: number;
}

export interface RuleImportPreviewRequest {
  file: RuleExportEnvelope;
  selection: RuleImportSelection;
  import_mode: RuleImportMode;
}

export interface ImportTypeSummary {
  parsed: number;
  importable: number;
  duplicates: number;
  invalid: number;
}

export interface ImportPreviewSummaryResponse {
  rules: ImportTypeSummary;
  detection_profiles: ImportTypeSummary;
}

export interface ImportPreviewItem {
  preview_item_id: string;
  reason: string;
  source: unknown;
  existing?: unknown;
  default_action: string;
  error?: string;
}

export interface TenantMappingSummary {
  mode: string;
  target_tenant_id?: number;
  resolved: number;
  failed: number;
}

export interface RuleImportPreviewResponse {
  summary: ImportPreviewSummaryResponse;
  tenant_mapping: TenantMappingSummary;
  duplicates: Record<string, ImportPreviewItem[]>;
  invalid_items: Record<string, ImportPreviewItem[]>;
}

export interface DuplicateResolutionItem {
  preview_item_id: string;
  action: 'skip';
}

export interface DuplicateResolutionRequest {
  apply_to_remaining?: 'skip';
  items?: DuplicateResolutionItem[];
}

export interface RuleImportExecuteRequest {
  file: RuleExportEnvelope;
  selection: RuleImportSelection;
  import_mode: RuleImportMode;
  duplicate_resolutions: DuplicateResolutionRequest;
}

export interface ImportTypeCounters {
  rules: number;
  detection_profiles: number;
}

export interface RuleImportExecuteResponse extends RuleImportPreviewResponse {
  imported: ImportTypeCounters;
  skipped_duplicates: ImportTypeCounters;
  errors?: string[];
}

export async function getUnifiedRules(params: { rule_class?: string; stage?: string; page?: string }, requestFn: ApiRequestFn = apiRequest): Promise<Rule[]> {
  const searchParams = new URLSearchParams();
  if (params.rule_class) searchParams.set('rule_class', params.rule_class);
  if (params.stage) searchParams.set('stage', params.stage);
  if (params.page) searchParams.set('rule_page', params.page);
  const qs = searchParams.toString();
  const url = `${API_BASE}/unified-rules${qs ? `?${qs}` : ''}`;
  const response = await requestFn<{ items: Rule[] }>(url);
  return response.items ?? [];
}

export async function createUnifiedRule(data: CreateRuleRequest, requestFn: ApiRequestFn = apiRequest): Promise<Rule> {
  return requestFn<Rule>(`${API_BASE}/unified-rules`, {
    method: 'POST',
    body: data,
  });
}

export async function updateUnifiedRule(id: number, data: UpdateRuleRequest, requestFn: ApiRequestFn = apiRequest): Promise<Rule> {
  return requestFn<Rule>(`${API_BASE}/unified-rules/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export async function deleteUnifiedRule(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`${API_BASE}/unified-rules/${id}`, {
    method: 'DELETE',
  });
}

export async function toggleUnifiedRule(id: number, isActive: boolean, requestFn: ApiRequestFn = apiRequest): Promise<Rule> {
  return requestFn<Rule>(`${API_BASE}/unified-rules/${id}/status`, {
    method: 'PUT',
    body: { is_active: isActive },
  });
}

// ruleClass 让字段目录与写侧校验同源：rule_class=route 时后端只返回投递规则
// 白名单内的字段（GT-12780）。不传 = 完整目录，既有调用方行为不变。
export async function getFieldDefinitions(
  stage: string,
  page?: string,
  requestFn: ApiRequestFn = apiRequest,
  ruleClass?: string,
): Promise<FieldDefinitionsResponse> {
  const qs = new URLSearchParams();
  if (stage) qs.set('stage', stage);
  if (page) qs.set('page', page);
  if (ruleClass) qs.set('rule_class', ruleClass);
  return requestFn<FieldDefinitionsResponse>(`${API_BASE}/unified-rules/field-definitions?${qs.toString()}`);
}

export async function getSidelineChecksMetadata(requestFn: ApiRequestFn = apiRequest): Promise<SidelineCheckMeta[]> {
  const resp = await requestFn<{ checks: SidelineCheckMeta[] }>(`${API_BASE}/sideline-checks`);
  return resp.checks ?? [];
}

export async function getSystemTags(requestFn: ApiRequestFn = apiRequest): Promise<SystemTag[]> {
  const resp = await requestFn<{ system_tags: SystemTag[] }>(`${API_BASE}/unified-rules/system-tags`);
  return resp.system_tags ?? [];
}

export async function exportUnifiedRules(
  selection?: RuleExportSelection,
  requestFn: ApiRequestFn = apiRequest,
  scope?: string,
): Promise<RuleExportEnvelope> {
  const searchParams = new URLSearchParams();
  if (scope) {
    searchParams.set('scope', scope);
  }
  if (selection) {
    searchParams.set('include_rules', String(selection.include_rules));
    searchParams.set('include_detection_profiles', String(selection.include_detection_profiles));
  }
  const qs = searchParams.toString();
  return requestFn<RuleExportEnvelope>(`${API_BASE}/unified-rules/export${qs ? `?${qs}` : ''}`);
}

export async function previewUnifiedRulesImport(
  data: RuleImportPreviewRequest,
  requestFn: ApiRequestFn = apiRequest,
  scope?: string,
): Promise<RuleImportPreviewResponse> {
  const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  return requestFn<RuleImportPreviewResponse>(`${API_BASE}/unified-rules/import/preview${qs}`, {
    method: 'POST',
    body: data,
  });
}

export async function executeUnifiedRulesImport(
  data: RuleImportExecuteRequest,
  requestFn: ApiRequestFn = apiRequest,
  scope?: string,
): Promise<RuleImportExecuteResponse> {
  const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  return requestFn<RuleImportExecuteResponse>(`${API_BASE}/unified-rules/import${qs}`, {
    method: 'POST',
    body: data,
  });
}
