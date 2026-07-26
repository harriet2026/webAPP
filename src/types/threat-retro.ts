// Mirrors the Phase-4 /threat-retro-agent/* JSON shapes. Field names align
// with the actual backend response shapes (internal/api/threat_retro_*.go +
// internal/storage/repo_threat_retro.go ThreatRetroStats), not the plan's
// draft shapes — see plan-5 Task 1 deviations in the final report.

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type RecallStatus = 'recalled' | 'pending_recall' | 'recall_failed' | 'no_need';
export type ThreatType = 'phishing' | 'malware' | 'impersonation' | 'unknown';
export type RiskLevel = 'high' | 'medium' | 'low';
export type LeakDisposition = 'pending_recall' | 'recalled' | 'alert_only' | 'false_positive';
export type DetectMode = 'realtime' | 'deep';
export type DecisionMode = 'conservative' | 'auto' | 'semi_auto';
export type RecallPolicy = 'recall' | 'notify';

export interface ThreatRetroRun {
  run_id: string;
  strategy_name: string;
  trigger_type: string; // scheduled | manual | finding
  window_start: string;
  window_end: string;
  status: string; // backend returns an English token (running|completed|failed|cancelled); UI localizes via i18n
  confidence?: number | null;
  agent_rounds: number;
  leak_count: number;
  affected_users: number;
  recall_status: string; // recalled | pending_recall | recall_failed | no_need (UI localizes via i18n)
  circuit_breaker_tripped?: boolean;
  target_count: number;
  failed_target_count: number;
  failed_child_count: number;
  error_message?: string;
  risk_level: string;
  is_test: boolean;
  disposition_summary: 'no_need' | LeakDisposition | 'multiple';
  disposition_counts: Record<string, number>;
  basis_summary: string;
  basis_count: number;
  created_at: string;
}

export interface ThreatRetroLeakMail {
  mail_log_id: number;
  message_uuid: string;
  sender: string;
  subject: string;
  orig_disposition: string;
  orig_confidence: number;
  recheck_confidence: number;
  threat_type: ThreatType;
  disposition: LeakDisposition;
  pending_deadline_at?: string;
  recall_status: RecallStatus | string;
  rationale: string;
  // Gateway-released ∩ delivered recipients — the exact recall target set
  // (spec §4.0/§7.1.1). Server-side recall uses the persisted value; surfaced
  // here for display.
  released_recipients?: string[];
}

export interface ThreatRetroRunDetail {
  run: ThreatRetroRun;
  leak_mails: ThreatRetroLeakMail[];
  recall_policy: { unread_policy: RecallPolicy; read_policy: RecallPolicy };
}

// ThreatRetroStats mirrors internal/storage.ThreatRetroStats JSON tags
// (in_progress / total_leaks / pending_recall / recalled_today / detection_rate).
export interface ThreatRetroStats {
  snapshot: { in_progress: number; pending_recall: number };
  range: {
    start: string;
    end: string;
    scanned_count: number;
    leaks_found: number;
    recall_succeeded: number;
    recall_failed: number;
    detection_rate: number | null;
  };
}

export interface RunListFilters {
  page?: number;
  page_size?: number;
  keyword?: string;
  start?: string;
  end?: string;
	 time_preset?: 'today';
  status?: RunStatus[];
  recall_status?: RecallStatus[];
  risk_level?: RiskLevel[];
  leak_disposition?: LeakDisposition | 'has_leaks';
  time_basis?: 'run_created' | 'recall_result';
  recall_outcome?: 'succeeded' | 'failed';
}

export interface RunListResponse {
  items: ThreatRetroRun[];
  total: number;
  page: number;
  page_size: number;
}

export interface AffectedRecipient {
  address: string;
  is_read?: boolean | null;
  department?: string;
}

export interface ThreatRetroAgentState {
  enabled: boolean;
  default_max_tool_calls: number;
  default_max_url_fetches: number;
}

// Model-info: backend returns { api_url, model } (model, NOT model_name —
// internal/api/threat_retro_model_info.go).
export interface ThreatRetroModelInfo {
  api_url: string;
  model: string;
}

// Strategy metadata mirrors spec §3.2 rules.metadata for page='threat_retro_strategy'.
export interface StrategySchedule {
  run_times: string[];
  weekdays: number[];
  month_days: number[];
}
export interface StrategyRealtime {
  listen_sources: string[];
  confidence_threshold: number;
  cooldown_minutes: number;
  fixed_lookback_minutes: number; // 1440, read-only
}
export interface StrategyResourceLimits {
  max_tool_calls: number;
  max_url_fetches: number;
}
export interface StrategyExclusions {
  exclude_rcpt_sys_tags: string[];
  exclude_email_list: string[];
}
export interface StrategyNotify {
  enabled: boolean;
  recipients: string[];
  high: { enabled: boolean };
  medium: { enabled: boolean; min_confidence: number };
  low: { enabled: boolean; digest_time: string };
}
export interface StrategyDisposition {
  decision_mode: DecisionMode;
  auto_confidence_threshold: number;
  decision_timeout_hours: number;
  recall_actions: ['soft_delete'];
  unread_policy: RecallPolicy;
  read_policy: RecallPolicy;
  circuit_breaker_threshold: number;
  max_recall_per_run: number;
}
export interface ThreatRetroStrategy {
  id?: number;
  name: string;
  feature: 'threat_retro_strategy';
  mode: DetectMode;
  status: 'enabled' | 'disabled';
  color_dot: string;
  schedule: StrategySchedule;
  lookback_window_minutes: number;
  realtime: StrategyRealtime;
  resource_limits: StrategyResourceLimits;
  disposition: StrategyDisposition;
  exclusions: StrategyExclusions;
  notify: StrategyNotify;
  // read-only run stats from backend
  stats?: { triggers: number; leaks_found: number; recalled: number };
  next_run?: string | null;
}

export interface ThreatRetroNotificationPreview {
  subject: string;
  html: string;
}

export interface ThreatRetroBulkResult {
  requested: number;
  cancelled: number;
  skipped: number;
  failed: number;
  results: Array<{ id: string; status: 'cancelled' | 'already_cancelled' | 'already_terminal' | 'failed'; error?: string }>;
}
