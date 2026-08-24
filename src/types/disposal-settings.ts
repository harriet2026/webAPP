export type NotifyFrequency = 'daily' | 'never' | 'custom';
export type DurationMode = 'unlimited' | 'custom';
export type RecallPolicyValue = 'recall' | 'notify' | 'wait';
export type RecallNotifyFrequency = 'realtime' | 'hourly' | 'daily' | 'weekly';
export type TimeoutTempDisposal = 'accept';

// 顺序 = 后端 AllEmailTypes 顺序去掉 normal/subscription（这两类不进入隔离通知配置）。
export const DISPOSAL_CATEGORY_KEYS = [
  'advertising',
  'spam',
  'harmful',
  'suspicious',
  'sensitive',
  'spoofing',
  'phishing',
  'virus',
  'account_compromised',
] as const;
export type DisposalCategoryKey = (typeof DISPOSAL_CATEGORY_KEYS)[number];

// 恶意类（与后端「恶意」分组一致）：默认通知开启、min_score 默认更低（0.6 vs 灰邮件类的 0.7）。
export const MALICIOUS_CATEGORY_KEYS: ReadonlySet<string> = new Set([
  'phishing',
  'virus',
  'account_compromised',
  'spoofing',
  'harmful',
]);

// demo 页面的展示顺序（先灰邮件类，再恶意类），与 DISPOSAL_CATEGORY_KEYS 的语义顺序不同。
export const CATEGORY_DISPLAY_ORDER = [
  'spam',
  'advertising',
  'suspicious',
  'sensitive',
  'phishing',
  'virus',
  'account_compromised',
  'spoofing',
  'harmful',
] as const;

export const DISPOSAL_PERMISSION_KEYS = ['recall', 'preview', 'whitelist', 'blacklist'] as const;
export type DisposalPermissionKey = (typeof DISPOSAL_PERMISSION_KEYS)[number];

export interface DisposalPermission {
  enabled: boolean;
  valid_days: number;
}

// 分类通知条目：是否通知 + 引擎概率检测的分数区间（[min_score, max_score] ⊆ [0,1]）。
// 分数区间仅作用于引擎概率检测；命中黑名单/规则等确定性判定（无置信度分数）的邮件始终通知。
export interface CategoryNotifyEntry {
  enabled: boolean;
  min_score: number;
  max_score: number;
}

export interface DisposalQuarantineSettings {
  category_notify: Record<string, CategoryNotifyEntry>;
  notify_frequency: NotifyFrequency;
  custom_weekdays: number[];
  notify_times: string[];
  permissions: Record<string, DisposalPermission>;
  /**
   * Externally reachable base URL used to build the digest's retrieve/preview
   * links. Optional on the wire: the backend serializes it with
   * `json:"portal_base_url,omitempty"`, so GET omits the key entirely when
   * unset. It IS conditionally required (backend 400s when recall/preview is
   * enabled and this is empty), but that is enforced server-side, not by zod.
   */
  portal_base_url?: string;
  /** Notification scope: recipient group ids (int64) included in quarantine digest notifications. */
  recipient_group_ids: number[];
  /** Notification scope: org-directory department paths (self + descendants) included. */
  department_paths: string[];
}

export interface DisposalReviewSettings {
  duration_mode: DurationMode;
  custom_minutes: number;
  max_recheck_minutes: number;
  timeout_auto_deliver: boolean;
  sender_notify_on_queue: boolean;
  sender_notify_on_result: boolean;
  reviewer_emails: string[];
  reviewer_notify_interval_minutes: number;
  reviewer_active_start: string;
  reviewer_active_end: string;
  // Plan 5 C11: the timeout-temp-disposal knobs live here (not on engine
  // params) because the sideline Session worker reads disposal_settings.
  timeout_temp_disposal?: TimeoutTempDisposal;
  timeout_mark_enabled: boolean;
  timeout_mark_positions?: string[];
  timeout_mark_text?: string;
}

export interface DisposalRecallPolicy {
  read_policy: RecallPolicyValue;
  unread_policy: RecallPolicyValue;
}

export interface DisposalRecallSettings {
  task_timeout_seconds: number;
  threat_intel: DisposalRecallPolicy;
  ai_detection: DisposalRecallPolicy;
  notify_emails: string[];
  notify_frequency: RecallNotifyFrequency;
}

export interface DisposalSettings {
  quarantine: DisposalQuarantineSettings;
  review: DisposalReviewSettings;
  recall: DisposalRecallSettings;
  /**
   * IANA tz used to interpret quarantine notify_times; pinned non-empty on
   * save. Optional on the wire: GET omits it (json:"tz,omitempty") when empty.
   */
  tz?: string;
  /** Read-only: gateway server's resolved IANA tz (GET/PUT response only). */
  server_tz?: string;
}
