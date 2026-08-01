import type { DisplayStatus, DisposalBasis } from './email-disposal';
import type { MailChildEvent, MailLifecycleLog, MailLifecycleLogsResponse } from './log';

export interface CACResult {
  result_code?: string;
  tag?: string;
  tid?: string;
  int_tag?: number;
  repeat_count?: number;
  description?: string;
  prob?: string[];
  suspicious_urls?: string[];
}

// URLEntity mirrors internal/models.URLEntity (json tags url/domain/check_result/
// threat_type/verdict) -- entity_urls on MailLogDetail is the per-URL threat-intel
// enrichment for the overview module's link list (spec detail-drawer alignment).
export interface URLEntity {
  url: string;
  domain: string;
  check_result?: string;
  threat_type?: string;
  verdict?: string;
  // vt_score -- VirusTotal-style engine hit count string ("47/90"), rendered
  // by EntityDetection's 内容实体检测 link rows (spec html_spec §④ 右列). Absent
  // when the backend has no threat-intel engine score for this URL (graceful
  // no-render, not a fabricated value -- mock fixtures.ts supplies it for
  // demo-parity rows).
  vt_score?: string;
}

export interface AttachmentInfo {
  filename: string;
  size: number;
  md5sum?: string;
  content_type: string;
  inline: boolean;
  content_length: number;
  url?: string;
}

export interface AttachmentScanResult {
  scan_id: string;
  message_id: string;
  direction: string;
  antivirus_result?: string | null;
  encrypted_result?: string | null;
  image_detect_result?: string | null;
  final_disposition: string;
  is_encrypted: boolean;
  attachment_md5?: string | null;
  qr_code_count: number;
  qr_code_text?: string | null;
  is_zip_bomb: boolean;
  virus_name?: string | null;
  duration_ms: number;
}

export interface RecipientDisposition {
  recipient: string;
  original_action?: string;
  final_action: string;
  status: string;
  reason?: string;
  dsn_status?: string;
  object_kind?: string;
  object_id?: string;
}

export interface FinalActionRuleDetail {
  rule_id: number;
  action: string;
  metadata?: string;
}

export interface SimilarDetectionLog {
  matched: boolean;
  skipped: boolean;
  cluster_id?: string;
  similarity_pct?: number;
  action?: string;
  skip_reason?: string;
}

export type MatchedRulesByStage = Record<string, Record<string, number[]>>;

export interface MailLogDetail {
  id: number;
  message_id: string;
  message_uuid: string;
  client_ip: string;
  sender: string;
  sender_name?: string;
  sender_domain?: string;
  recipients: string[];
  bcc?: string[];
  authenticated: boolean;
  smtp_user?: string;

  spf_valid?: string;
  dkim_valid?: string;
  dmarc_valid?: string;
  dmarc_from_domain?: string;
  ptr_valid?: boolean;
  ptr_domain?: string;

  cac_tid?: string;
  cac_result?: CACResult;

  subject: string;
  content?: string;
  html_content?: string;
  attachments?: AttachmentInfo[];
  urls?: string[];

  action: string;
  status: string;
  reason?: string;
  email_type?: EmailType;
  email_type_overridden?: boolean;
  email_type_original?: EmailType;
  correction_source?: CorrectionSource;

  processing_time_ms?: number;
  stage_timings?: Record<string, number>;

  storage_node?: string;
  storage_path?: string;
  storage_size?: number;

  received_at: string;
  processed_at?: string;
  delivered_at?: string;

  geo_region?: string;
  geo_region_name?: string;
  geo_city?: string;
  geo_isp?: string;
  geo_asn?: number;

  return_path?: string;
  reply_to?: string;
  x_mailer?: string;
  sensitive_keyword_hit?: boolean;
  entity_urls?: URLEntity[];

  queue_id?: string;
  // milter 会话 ID（后端运行日志的 sid 字段），用于对应查询后端服务器日志。
  session_id?: string;
  delivery_status_summary?: string;
  workflow_outcome_summary?: string;
  delivery_error_summary?: string;

  matched_tag_rules?: MatchedRulesByStage;
  matched_action_rules?: MatchedRulesByStage;
  // Detail API response-time projections: stage → rules.page → rule IDs.
  // The persisted maps above remain stage → recipient → IDs for recipient
  // attribution, so policy checks must use these fields rather than guessing.
  matched_tag_rule_pages?: MatchedRulesByStage;
  matched_action_rule_pages?: MatchedRulesByStage;
  matched_route_rules?: MatchedRulesByStage;
  final_action_rule?: Record<string, FinalActionRuleDetail>;
  similar_detection?: SimilarDetectionLog;
  recipient_dispositions?: RecipientDisposition[];

  scan_results?: AttachmentScanResult[];

  phish_agent_check?: PhishAgentCheck;

  // Earliest received_at for this exact Sender address (spec §5.3 "命中特征"
  // 首次出现) -- absent/undefined if the lookup failed or this message has
  // no sender.
  sender_first_seen_at?: string;

  // Sender domain registration age in days (spec html_spec §① 命中特征「域名
  // 年龄」badge, a newly-registered domain is a strong phishing/spoofing
  // signal). Absent when no whois/RDAP lookup is available -- the real
  // backend does not populate this yet; mock fixtures.ts supplies it for
  // demo-parity rows. deriveDomainAge() in lib/detail-helpers.ts is the
  // single accessor callers should use (it also applies the "worth alerting
  // on" threshold).
  domain_age_days?: number;

  // Disposal basis (拦截/处置依据) — structured hit metadata from the
  // milter decision path; rendered by analysis-section's "Disposal Basis"
  // block. Absent for messages with no recorded basis (e.g. pure accept
  // with no rule hit).
  disposal_basis?: DisposalBasis;
}

// PhishAgentCheck mirrors internal/models.PhishAgentCheckSummary — the
// sideline pipeline's phish_agent investigation result, looked up by
// message_uuid and attached to GetMailLog's response (spec §5.4 AI verdict
// block). Absent when the message never went through the sideline phish
// agent (delivered directly, or the check hasn't completed yet).
export interface PhishAgentCheck {
  status: string;
  task_id?: string;
  checked: boolean;
  verdict?: string;
  risk_level?: string;
  summary?: string;
  confidence?: number;
  details?: Record<string, unknown>;
  error?: string;
  // steps/recommended_actions mirror internal/models.InvestigationStep /
  // InvestigationRecommendedAction (spec §5.4 "威胁溯源时间线"/"处置建议") --
  // previously dropped by sideline.refreshPhishCheck before ever reaching
  // storage, so the AI verdict block had nothing to render regardless of
  // what the investigation task actually produced.
  steps?: PhishAgentStep[];
  recommended_actions?: PhishAgentRecommendedAction[];
}

export interface PhishAgentStep {
  name: string;
  status: string;
  message?: string;
  started_at?: string;
  finished_at?: string;
}

export interface PhishAgentRecommendedAction {
  type: string;
  scope?: string;
  target_count?: number;
  reason?: string;
}

export type { MailChildEvent };
export type { MailLifecycleLog, MailLifecycleLogsResponse };

export type CheckStatus = 'pass' | 'suspicious' | 'threat' | 'processing' | 'skipped';

export interface DetectionCheckItem {
  key: string;
  status: CheckStatus;
  ruleIds: number[];
}

export interface DetectionStage {
  stage: number;
  key: string;
  status: CheckStatus;
  durationMs?: number;
  checks: DetectionCheckItem[];
}

export type FinalVerdict = 'malicious' | 'suspicious' | 'safe';

export type EmailType =
  | 'normal' | 'subscription' | 'advertising' | 'spam' | 'harmful'
  | 'suspicious' | 'sensitive' | 'spoofing' | 'phishing' | 'virus'
  | 'account_compromised';

// user_retrieval is retained for backward compatibility with historical data
// (before quarantine release stopped auto-reclassifying in Task F1).
export type CorrectionSource = 'admin_release' | 'admin_recall' | 'user_retrieval';

export type ObjectDisposeStatus =
  | 'succeeded' | 'failed' | 'not_applicable'
  | 'unsupported_object_target' | 'forbidden_object_target';

export interface ObjectDisposeResult {
  mail_log_id: number;
  object_id: string;
  status: ObjectDisposeStatus;
  reason?: string;
  // Set when the dispose itself succeeded but the bundled final_type
  // reclassify failed afterward (spec §6.1 "已处置，但改判失败") -- the
  // dispose is NOT rolled back, this is purely an informational flag.
  reclassify_failed?: boolean;
}

export type { DisplayStatus };
