// Phishing deep-module DTOs. Field names mirror the versioned server contract
// exactly; UI drafts do not translate or invent defaults for these domains.

export type PhishRunMode = 'realtime' | 'observe';
export type PhishObserveAction = 'accept';

export type PhishRiskLevel = 'suspicious' | 'low' | 'medium' | 'high';
export type PhishPolicyDisposition = 'proceed' | 'audit' | 'quarantine' | 'discard';
export type PhishMarkPosition = 'subject_prefix' | 'header';

export interface PhishRiskBandPolicy {
  base_disposition: PhishPolicyDisposition;
  mark_positions?: PhishMarkPosition[];
  mark_text?: string;
}

export interface PhishRiskPolicy {
  cutoffs: { low: number; medium: number; high: number };
  policies: Record<PhishRiskLevel, PhishRiskBandPolicy>;
}

export interface PhishRiskPolicyView extends PhishRiskPolicy {
  version: number;
  updated_at: string;
}

export interface PhishRuntimePolicy {
  run_mode: PhishRunMode;
  observe_action: PhishObserveAction;
  observe_mark_enabled: boolean;
  timeout_minutes: number;
  max_recheck_minutes: number;
  timeout_async_enabled: boolean;
}

export interface PhishRuntimePolicyView extends PhishRuntimePolicy {
  version: number;
  updated_at: string;
}

export interface PhishAgentConfig {
  risk_policy: PhishRiskPolicyView;
  runtime_policy: PhishRuntimePolicyView;
}

export interface PhishAgentConfigPutRequest {
  risk_policy: PhishRiskPolicy & { expected_version: number };
  runtime_policy: PhishRuntimePolicy & { expected_version: number };
}

export interface PhishConfigConflictResponse extends PhishAgentConfig {
  error: {
    code: string;
    message: string;
    params: { conflict_domains: Array<'risk_policy' | 'runtime_policy'> };
  };
}

export interface PhishAnalysisConfig {
  netdisk_domain: boolean;
  netdisk_extract: boolean;
  netdisk_spoof: boolean;
  version: number;
  updated_at: string;
}

export interface PhishAnalysisConfigPutRequest {
  netdisk_domain: boolean;
  netdisk_extract: boolean;
  netdisk_spoof: boolean;
  expected_version: number;
}

export interface PhishAgentControl {
  enabled: boolean;
  desired_state: 'enabled' | 'disabled';
  runtime_state: 'unspecified' | 'running' | 'draining' | 'stopped';
  revision: number;
  updated_at?: string;
}

export interface PhishAgentControlPutRequest {
  enabled: boolean;
  expected_revision: number;
  operation_id?: string;
}
export interface PhishAdmissionRule {
  id?: number;
  rule_uid?: string;
  revision?: string;
  name: string;
  directions: Array<'inbound' | 'outbound' | 'internal'>;
  recipient_groups?: string[];
  recipient_depts?: string[];
  recipient_emails?: string[];
  sender_groups?: string[];
  sender_depts?: string[];
  sender_emails?: string[];
  filter_on?: boolean;
  require_url: boolean;
  max_size_mb?: number;
  sender_first_seen: boolean;
  require_qrcode: boolean;
  require_executable?: boolean;
  enabled: boolean;
}

export type PhishAdmissionRuleWrite = Omit<PhishAdmissionRule, 'id' | 'rule_uid' | 'revision'>;
export type PhishAdmissionRuleUpdate = PhishAdmissionRuleWrite & { expected_revision: string };
