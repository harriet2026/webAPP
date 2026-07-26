// webapp/src/types/alerts.ts
export type AlertSeverity = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';
export type AlertStatus = 'unconfirmed' | 'confirmed' | 'processing' | 'resolved';
export type ResolvedReason = 'manual' | 'auto' | 'rule_updated';

export interface AlertEvent {
  id: number;
  rule_id: number;
  rule_name: string;
  metric_key: string;
  module: string;
  node: string | null;
  source: string;
  fingerprint: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  metric_value: number;
  threshold: number;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolved_reason: ResolvedReason | null;
  created_at: string;
  updated_at: string;
}

export interface AlertListResp {
  items: AlertEvent[];
  total: number;
  page: number;
  page_size: number;
}

export interface AlertStats {
  total: number;
  unconfirmed: number;
  processing: number;
  resolved: number;
  critical: number;
  major: number;
}

export type DurationType = 'time' | 'samples';
export type RuleOperator = 'gt' | 'lt' | 'ge' | 'le' | 'eq';

export interface TargetScope {
  node: string | null;
}

export interface AlertRule {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  severity: AlertSeverity;
  metric_key: string;
  module: string;
  aggregation: string;
  operator: RuleOperator;
  threshold_warn: number | null;
  threshold_crit: number | null;
  dual_threshold: boolean;
  target_scope: TargetScope;
  duration_type: DurationType;
  duration_seconds: number;
  sample_count: number;
  notify_email_enabled: boolean;
  notify_recipients: string[];
  recovery_notify: boolean;
  convergence_window_seconds: number;
  effective_period: Record<string, unknown> | null;
  combined_conditions: unknown | null;
  escalation: unknown | null;
  suppress_interval_seconds: number | null;
  silence_period: unknown | null;
  created_at: string;
  updated_at: string;
}

export type AlertRulePayload = Omit<AlertRule, 'id' | 'created_at' | 'updated_at'>;

export interface MetricDef {
  key: string;
  module: string;
  source: 'tdengine' | 'reldb' | 'dbprovider';
  unit: string;
  default_warn: number | null;
  default_crit: number | null;
  available: boolean;
  node_scoped: boolean;
}
export interface MetricsResp {
  items: MetricDef[];
}

export interface AlertTemplate {
  key: string;
  name: string;
  description: string;
  module: string;
  metric_key: string;
  aggregation: string;
  operator: RuleOperator;
  threshold_warn: number | null;
  threshold_crit: number | null;
  dual_threshold: boolean;
  duration_type: DurationType;
  duration_seconds: number;
  severity: AlertSeverity;
}
export interface TemplatesResp {
  items: AlertTemplate[];
}

export type SmtpEncryption = 'none' | 'starttls' | 'ssl';
export type SmtpAuthMethod = 'none' | 'plain' | 'login';

export interface SmtpConfig {
  use_internal_postfix: boolean;
  server: string;
  port: number;
  encryption: SmtpEncryption;
  auth_method: SmtpAuthMethod;
  username: string;
  password_configured: boolean;
  password_masked: string;
  sender_email: string;
  sender_name: string;
  connect_timeout_seconds: number;
  send_timeout_seconds: number;
  enc_key_ready: boolean;
}

export interface SmtpConfigPayload extends Omit<SmtpConfig, 'password_configured' | 'password_masked' | 'enc_key_ready'> {
  password?: string;
}

export interface SmtpTestResult {
  success: boolean;
  message: string;
}

export interface BatchAlertsResult {
  success: number;
  failed: number;
  failed_ids?: number[];
}
