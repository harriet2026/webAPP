import type { DisplayStatusEntry as DisposalDisplayStatusEntry } from '@/types/email-disposal';
import type { RecipientDisposition as DisposalRecipientDisposition } from '@/types/email-disposal-detail';

export type Disposition = 'quarantine' | 'mark' | 'pass' | 'audit' | 'pending' | 'processing' | 'failed' | 'manual_hold' | 'unknown';
export type DetectionMode = 'realtime' | 'observe' | '';
export type RecallStatus = 'none' | 'pending_processing' | 'pending_recall' | 'recalled' | 'recall_failed' | 'expanded';
export type RiskLevel = 'suspicious' | 'low' | 'medium' | 'high';
export type PolicyDisposition = 'proceed' | 'audit' | 'quarantine' | 'discard';
export type PhishTaskStatus = 'submitting' | 'pending' | 'processing' | 'completed' | 'failed' | 'expired' | '';

export type DisplayStatusEntry = DisposalDisplayStatusEntry;
export interface UrlSummary { total: number; phishing: number; suspicious: number; normal: number }
export interface RecallRecord { receiver: string; operate_result: string }
export type RecipientDisposition = DisposalRecipientDisposition;

export interface DetectionLogItem {
  sideline_id: string;
  message_id: string;
  sender: string;
  subject: string;
  recipients: string[];
  direction: string;
  status: string;
  sidelined_at: string;
  investigation_id?: string;
  verdict?: string;
  risk_level?: RiskLevel | null;
  policy_disposition?: PolicyDisposition | null;
  task_status: PhishTaskStatus;
  failure_reason: string | null;
  confidence?: number | null;
  recalls?: RecallRecord[];
  disposition_actions?: string[];
  recipient_dispositions: RecipientDisposition[];
  processed_at?: string;
  mail_log_id: number | null;
  display_statuses: DisplayStatusEntry[];
  disposition: Disposition;
  detection_mode: DetectionMode;
  recall_status: RecallStatus;
  agent_rounds: number;
  url_summary: UrlSummary;
  result_truncated: boolean;
}

export interface InvestigationStep {
  name: string; status: string; message?: string; data?: Record<string, unknown>; started_at?: string; finished_at?: string;
}
export interface InvestigationEvidence {
  type: string; severity: string; title: string; detail: string; data?: Record<string, unknown>;
}
export interface UrlFindingAgent { verdict?: string; risk_level?: string }
export interface UrlFinding {
  url?: string;
  final_url?: string;
  risk_level?: string;
  analyze_url?: Record<string, unknown>;
  redirect_chain?: Record<string, unknown>;
  cert?: Record<string, unknown>;
  threat_intel?: Record<string, unknown>;
  screenshot_ref?: { storage_node?: string; key?: string };
  agent?: UrlFindingAgent;
}
export interface InvestigationResultDetails { url_findings?: UrlFinding[] }
export interface InvestigationTask {
  id?: string;
  summary?: string;
  status?: string;
  risk_level?: string;
  error_message?: string;
  steps?: InvestigationStep[];
  result?: { verdict?: string; summary?: string; confidence?: number | null; evidence?: InvestigationEvidence[]; details?: InvestigationResultDetails };
  [key: string]: unknown;
}
export interface DetectionLogDetail {
  summary: DetectionLogItem;
  investigation: InvestigationTask | null;
  config_snapshot?: Record<string, unknown> | null;
}
export interface PhishingStats {
  today_detected: number;
  today_quarantined: number;
  pending_review: number;
  today_recalled: number;
  recall_success: number;
}
export interface DetectionLogListResponse { items: DetectionLogItem[]; total: number; page: number; page_size: number }
export interface DetectionLogFilters {
  page?: number;
  page_size?: number;
  keyword?: string;
  disposition?: Disposition[];
  detection_mode?: DetectionMode[];
  recall_status?: RecallStatus[];
  risk_level?: RiskLevel[];
  mail_status?: import('@/types/email-disposal').DisplayStatus[];
  start?: string;
  end?: string;
  status?: string;
}
