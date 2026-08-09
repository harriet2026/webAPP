// DTO types for the Tab B "检测引擎配置" feature. Field names mirror the
// backend JSON tags (snake_case) so the API client can pass them through
// verbatim — see internal/models/investigation_config.go and
// internal/api/phishing_{admission,bands}.go.

export type PhishRunMode = 'realtime' | 'observe';
export type PhishObserveAction = 'deliver' | 'mark';
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
  enabled: boolean;
  netdisk_domain: boolean;
  netdisk_extract: boolean;
  netdisk_spoof: boolean;
  run_mode: PhishRunMode;
  observe_action: PhishObserveAction;
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
  filter_on?: boolean;
  require_url: boolean;
  max_size_mb?: number;
  sender_first_seen: boolean;
  require_qrcode: boolean;
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
export interface PhishEffectiveConfigSnapshot {
  profile_id?: number;
  profile: PhishProfileParams;
  engine: PhishEngineParams;
  matched_rule_id?: number;
}
