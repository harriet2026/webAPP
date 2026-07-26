export type RuleClass = 'tag' | 'action' | 'route';
export type StageType = 'onconnect' | 'mail' | 'rcpt' | 'header' | 'data' | 'sideline';
export type RuleAction = 'accept' | 'reject' | 'quarantine' | 'sideline' | 'audit' | 'tempfail' | 'disconnect';

export interface RuleNode {
  type: 'AND' | 'OR' | 'NOT' | 'condition';
  children?: RuleNode[];
  field?: string;
  map_key?: string;
  operator?: string;
  value?: string;
  // Optional UI-side hint carrying the V3 catalogue conditionKey so fields that
  // back multiple catalogue entries (e.g. urls ← url/urlDomain) can be
  // disambiguated on reload. The engine ignores this field.
  note?: string;
}

export interface Rule {
  id: number;
  name: string;
  description?: string;
  tenant_id?: number;
  tenant_name?: string;
  page?: string;
  is_system?: boolean;
  rule_class: RuleClass;
  stage: StageType;
  priority: number;
  condition_tree: string;
  tags?: string[];
  action?: string;
  metadata?: string;
  is_active: boolean;
  observe_mode?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  email_type?: string;
  created_at: string;
  updated_at: string;
  keywords?: string[];
  hit_stats?: {
    hit_count_7d: number;
    last_hit_at: string | null;
  };
}

export interface CreateRuleRequest {
  name: string;
  description?: string;
  // number = create under an explicit tenant (system_admin cross-tenant
  // authoring / import). `null` is sent explicitly by sender-actions.tsx's
  // "全系统" (global) scope option; the backend's `*int` field treats a JSON
  // `null` the same as an omitted key (Go's `omitempty` on a nil pointer), so
  // this only actually yields a platform-global rule when the caller has no
  // active tenant-impersonation context (see createRuleTenantID in
  // internal/api/unified_rules.go) -- see disposal-detail-api.ts's
  // addSenderFilterRule doc comment for the full caveat.
  tenant_id?: number | null;
  page?: string;
  rule_class: RuleClass;
  stage: StageType;
  priority?: number;
  condition_tree: RuleNode;
  tags?: string[];
  action?: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  observe_mode?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  email_type?: string;
}

export interface UpdateRuleRequest {
  name?: string;
  description?: string;
  page?: string;
  priority?: number;
  stage?: StageType;
  condition_tree?: RuleNode;
  tags?: string[];
  action?: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  observe_mode?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  expected_updated_at?: string | null;
  email_type?: string;
}

export interface DetectionProfile {
  id: number;
  config_type: 'rbl' | 'exec_impersonation' | 'domain_lookalike';
  name: string;
  value?: string;
  tenant_id?: number;
  tenant_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcceptHeaderEntry {
  name: string;
  value: string;
}

export interface RuleMetadata {
  max_check_time?: number;
  timeout_minutes?: number;
  subject_prefix?: string;
  add_headers?: AcceptHeaderEntry[];
  next_hop_type?: 'ip' | 'domain';
  next_hop_host?: string;
  next_hop_port?: number;
  channel?: 'smtp' | 'proxysvr';
  proxysvr_group_id?: number;
  [key: string]: unknown;
}

export interface FieldDef {
  label: string;
  type: string;
  min_stage: string;
  operators: string[];
  map_keys_source?: string;
  availability?: string;
  produced_by?: string;
  supported: boolean;
  // The following fields are emitted by the backend (models.FieldDef) and are
  // needed by the V3 UI for sub-grouping and "(needs config)" hints. They are
  // optional because older snapshots may omit them.
  category?: string;
  requires_config?: boolean;
  available?: boolean;
  active_resource_count?: number;
  pages?: string[];
}

export interface SidelineCheckMeta {
  type: string;
  label: string;
  default: boolean;
  control_tag: string;
  control_mode: string;
}

export interface FieldDefinitionsResponse {
  fields: Record<string, FieldDef>;
}

export interface SystemTag {
  key: string;
  label: string;
  description: string;
}

// BounceDSNSetting describes rows carried in the rule export/import payload
// (RuleExportData). Its admin page and CRUD API client were removed;
// /rules/export and /rules/import read this table server-side, so this
// shape is all the frontend still needs.
export interface BounceDSNSetting {
  id: number;
  tenant_id: number;
  domain: string;
  enabled: boolean;
  language: 'zh' | 'en' | 'th' | 'ru';
  include_original_headers: boolean;
  created_at: string;
  updated_at: string;
}

export const ADVANCED_RULE_FIELDS: Record<string, FieldDef> = {};
