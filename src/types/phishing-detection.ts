import type { PhishEffectiveConfigSnapshot } from '@/types/phishing-config';

export type Disposition =
  | 'quarantine'
  | 'mark'
  | 'pass'
  | 'audit'
  | 'pending'
  | 'processing'
  | 'failed'
  | 'manual_hold'
  | 'unknown';

// deriveDetectionMode returns the run_mode from the investigation task's config
// snapshot: 'realtime' | 'observe' | '' (empty for rows without a task or legacy rows).
export type DetectionMode = 'realtime' | 'observe' | '';

export type RecallStatus =
  | 'none'
  | 'pending_processing'
  | 'pending_recall'
  | 'recalled'
  | 'recall_failed'
  | 'expanded';

export type RiskLevel = 'suspicious' | 'low' | 'medium' | 'high';

export type LegacyRiskLevel = 'critical' | 'none';

export interface UrlSummary {
  total: number;
  phishing: number;
  suspicious: number;
  normal: number;
}

export interface RecallRecord {
  receiver: string;
  operate_result: string;
}

// Mirrors internal/models.RecipientDisposition — the backend returns a struct
// array, NOT string[]. Rendering it as `string[].join(', ')` produced
// "[object Object]" (review P1-4). Only the fields the detail drawer reads are
// declared; the backend may send more (object_kind/dsn_status/…).
export interface RecipientDisposition {
  recipient: string;
  original_action?: string;
  final_action: string;
  status: string;
  reason?: string;
}

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
  risk_level?: RiskLevel | LegacyRiskLevel | '';
  confidence?: number | null;
  recalls: RecallRecord[];
  disposition_actions: string[];
  recipient_dispositions: RecipientDisposition[];
  processed_at?: string;
  /** 后端统一返回的处置中心 DisplayStatus；旧数据为空时使用前端兼容映射。 */
  display_status?: import('@/types/email-disposal').DisplayStatus;
  disposition: Disposition;
  detection_mode: DetectionMode;
  recall_status: RecallStatus;
  agent_rounds: number;
  url_summary: UrlSummary;
  result_truncated: boolean;
}

export interface InvestigationStep {
  name: string;
  status: string;
  message?: string;
  data?: Record<string, unknown>;
  started_at?: string;
  finished_at?: string;
}

export interface InvestigationEvidence {
  type: string;
  severity: string;
  title: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface UrlFindingAgent {
  verdict?: string;
  risk_level?: string;
}

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

export interface InvestigationResultDetails {
  url_findings?: UrlFinding[];
}

export interface InvestigationTask {
  id?: string;
  summary?: string;
  status?: string;
  risk_level?: string;
  error_message?: string;
  steps?: InvestigationStep[];
  result?: {
    verdict?: string;
    summary?: string;
    confidence?: number | null;
    evidence?: InvestigationEvidence[];
    details?: InvestigationResultDetails;
  };
  [key: string]: unknown;
}

export interface DetectionLogDetail {
  summary: DetectionLogItem;
  investigation: InvestigationTask;
  // A6 (Tab A): frozen effective-config snapshot taken at dispatch time.
  // Null when the task predates the snapshot column or had nothing recorded.
  config_snapshot?: PhishEffectiveConfigSnapshot | null;
}

export interface PhishingStats {
  today_detected: number;
  today_quarantined: number;
  pending_review: number;
  today_recalled: number;
  recall_success: number;
  accuracy: number | null;
}

export interface DetectionLogListResponse {
  items: DetectionLogItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface DetectionLogFilters {
  page?: number;
  page_size?: number;
  keyword?: string;
  disposition?: Disposition[];
  detection_mode?: DetectionMode[];
  recall_status?: RecallStatus[];
  risk_level?: RiskLevel[];
  // 「邮件状态」：由 disposition + recall_status 派生的处置中心同款状态
  // （见 mapPhishingDispositionToDisplayStatus）。真实后端接口目前没有该
  // 查询参数，此过滤仅在 Mock 模式下由 mockPhishingLogMatchesQuery 精确生效。
  mail_status?: string[];
  start?: string;
  end?: string;
  status?: string;
}

export interface BlockResponse {
  status: 'blocked' | 'already_blocked';
}

export interface ExemptResponse {
  status: 'exempted';
}
