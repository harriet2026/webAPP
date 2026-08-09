// DTO types for the Tab B "检测引擎配置" feature. Field names mirror the
// backend JSON tags (snake_case) so the API client can pass them through
// verbatim — see internal/models/investigation_config.go and
// internal/api/phishing_{admission,bands}.go.

export type PhishRunMode = 'realtime' | 'observe';
export type PhishObserveAction = 'deliver' | 'mark';
export type PhishProtectionLevel = 'standard' | 'strict' | 'custom';
export type PhishPresetVersion = '2026-08-01';
// Kept for the disposal-settings UI (Plan 5 C11: the timeout-temp-disposal
// knob lives on disposal-settings.Review, NOT on engine params — the sideline
// worker reads disposal_settings, not engine_config).
export type PhishTimeoutTempDisposal = 'deliver' | 'mark' | 'by_result';

export interface PhishEngineParams {
  trace_steps_budget_bytes: number;
  result_json_budget_bytes: number;
  tool_call_budget: number;
  netdisk_domain: boolean;
  netdisk_extract: boolean;
  netdisk_spoof: boolean;
  run_mode: PhishRunMode;
  observe_action: PhishObserveAction;
}

// Tenant-owned engine settings exposed by /phishing-agent/engine-config.
// Deployment-wide runtime limits are intentionally absent; they are managed
// only through apiserver.cf and the generic config-management override UI.
export interface PhishTenantEngineParams {
  netdisk_domain: boolean;
  netdisk_extract: boolean;
  netdisk_spoof: boolean;
  run_mode: PhishRunMode;
  observe_action: PhishObserveAction;
  protection_level: PhishProtectionLevel;
}

export interface PhishProtectionPreset {
  level: Exclude<PhishProtectionLevel, 'custom'>;
  version: PhishPresetVersion;
  bands: PhishBand[];
}

// Deployment-wide [phishing_agent] limits retained in effective task
// snapshots. They are not exposed by the tenant engine-config endpoint.
export interface PhishProfileParams {
  max_track_level: number;
  url_fetch_budget: number;
  max_llm_ranked_urls: number;
}

export interface PhishEngineConfigResponse {
  engine: PhishTenantEngineParams;
  version: number;
}

export interface PhishAdmissionRule {
  id?: number;
  name: string;
  directions: Array<'inbound' | 'outbound' | 'internal'>;
  recipient_tags?: string[];
  recipient_emails?: string[];
  // 组织通讯录「整体部门」筛选目标——完整部门路径（如 "研发部 / 后端组"），
  // 与 recipient_emails（组织树里单独勾选的个人）并列，OR 关系。前端新增字段，
  // 待后端契约确认（准入判断按方向匹配收/发信人 department_path 前缀）。
  recipient_dept_paths?: string[];
  filter_on?: boolean;
  require_url: boolean;
  max_size_mb?: number;
  sender_first_seen: boolean;
  require_qrcode: boolean;
  // 邮件内容风险信号：附件中含可点击链接/按钮（HTML 附件、可交互 PDF 等）。
  // 后端字段名与其余风险信号保持一致的 snake_case 约定。
  require_clickable_attachment: boolean;
  enabled: boolean;
  profile_id?: number | null;
  priority?: number;
}

export type BandDisposition = 'accept' | 'mark' | 'quarantine';

export interface PhishBand {
  min: number;
  max: number;
  disposition: BandDisposition;
  mark_positions?: string[];
  mark_text?: string;
}

// PhishEffectiveConfigSnapshot mirrors internal/models.PhishEffectiveConfig —
// the frozen "派发时生效配置" exposed as `config_snapshot` on the detection
// detail endpoint (Tab A A6).
export interface PhishTimeoutPolicySnapshot {
  total_timeout_minutes: number;
  timeout_action: PhishTimeoutTempDisposal;
}

export interface PhishEffectiveConfigSnapshot {
  profile_id?: number;
  profile: PhishProfileParams;
  engine: PhishEngineParams;
  protection_level?: PhishProtectionLevel;
  protection_preset_version?: PhishPresetVersion;
  bands?: PhishBand[];
  timeout_policy?: PhishTimeoutPolicySnapshot;
  matched_rule_id?: number;
}
