export interface BasicLimitConfig {
  attachment_count_max: number;
  attachment_size_max_kb: number;
  nested_zip_count_max: number;
	nested_file_count_max: number;
	nested_level_max: number;
	scan_timeout_sec: number;
	exceed_action: AttachmentAction;
	partial_skip: boolean;
	danger_ext_enabled: boolean;
	danger_ext_list: string;
	mime_mismatch_check: boolean;
}

export type Direction = 'receive' | 'send' | 'internal';

export type AttachmentAction =
  | 'quarantine'
  | 'audit'
  | 'reject'
  | 'discard'
  | 'accept'
  | 'partial_skip';

export interface AntivirusConfig {
  host: string;
  port: string;
}

export interface AVStatusResponse {
  configured: boolean;
}

export interface AntivirusActionConfig {
  virus_action: Exclude<AttachmentAction, 'accept' | 'partial_skip'>;
  timeout_action: Exclude<AttachmentAction, 'partial_skip'>;
}

export interface ImageDetectConfig {
  ocr_mode: 'none' | 'light';
  ocr_max_count: number;
  qr_mode: 'none' | 'light' | 'deep';
  qr_max_count: number;
}

export interface QrDeepRoutesConfig {
  url_check: boolean;
  url_unshorten: boolean;
  keyword_filter: boolean;
  keyword_scope_url: boolean;
  keyword_scope_text: boolean;
  intent_engine: boolean;
  intent_high: boolean;
  intent_medium: boolean;
  intent_low: boolean;
  advanced_rules: boolean;
}

export interface ImageDetectActionConfig {
  qr_light_action: Exclude<AttachmentAction, 'accept' | 'partial_skip'>;
  qr_deep_exceed_action: 'accept' | 'quarantine';
  qr_deep_exceed_warn: boolean;
}

export interface EncryptedConfig {
  detect_mode: 'none' | 'detect_only' | 'decrypt';
  extract_password_from_body: boolean;
  extract_password_from_filename: boolean;
  use_password_book: boolean;
  recursive_detect: boolean;
  max_password_attempts: number;
  mark_suspicious: boolean;
}

export interface EncryptedActionConfig {
  decrypt_fail_action: 'quarantine' | 'accept' | 'audit';
}

export interface PasswordBookEntry {
  id: number;
  password: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface ActiveContentConfig {
  vba_enabled: boolean;
  vba_to_keyword: boolean;
  pdf_js_enabled: boolean;
  lnk_enabled: boolean;
  lnk_to_url: boolean;
  tnef_unwrap: boolean;
}

/** 沙箱判定风险等级：低危 / 中危 / 高危三档，分别独立配置处置动作。 */
export type SandboxRiskLevel = 'low' | 'medium' | 'high';

/** 风险等级处置动作：隔离 / 审核 / 丢弃，或不设置（none）。不含 accept，
 * 风险判定结果不应默认放行。 */
export type SandboxRiskAction = 'quarantine' | 'audit' | 'discard' | 'none';

/** 附加策略：对命中风险的附件本身进行标记，或直接丢弃该附件，或不设置
 * （none）。与执行动作（隔离/审核/丢弃整封邮件）互为独立维度，可同时生效。 */
export type SandboxAttachmentPolicy = 'mark' | 'discard' | 'none';

/** 标记生效位置，仅在附加策略为“标记”时有效，可任意组合勾选（含 0 项）。 */
export type SandboxMarkLocation = 'subject' | 'header' | 'body_start';

/** 超时/引擎不可用后的处置动作，三者可任意组合勾选。 */
export type SandboxTimeoutActionType = 'recall' | 'notify_admin' | 'notify_recipient';

/** 单个风险等级的处置配置：执行动作 + 附加策略两个独立维度，附加策略为
 * “标记”时可再选择标记生效位置。执行动作与附加策略至少设置一个（不可同
 * 时为 none）。 */
export interface SandboxRiskLevelConfig {
  /** 执行动作：隔离 / 审核 / 丢弃 / 不设置（作用于整封邮件的处置）。 */
  action: SandboxRiskAction;
  /** 附加策略：标记 / 丢弃附件 / 不设置（作用于命中风险的附件本身）。 */
  attachment_policy: SandboxAttachmentPolicy;
  /** 标记生效位置，仅 attachment_policy 为 'mark' 时生效。 */
  mark_locations: SandboxMarkLocation[];
}

/** 三级风险各自独立的处置动作配置。 */
export interface SandboxRiskActionConfig {
  low: SandboxRiskLevelConfig;
  medium: SandboxRiskLevelConfig;
  high: SandboxRiskLevelConfig;
}

/** 超时处置配置：超时阈值 + 可组合的超时动作集合。通知收件人使用系统默认
 * 通知模板，不在本模块内配置模板内容。 */
export interface SandboxTimeoutConfig {
  timeout_sec: number;
  actions: SandboxTimeoutActionType[];
}

/** 附件沙箱检测规则：按方向/文件类型命中后送入沙箱动态执行，依风险等级或
 * 超时结果分别处置。规则列表按 created_at 升序排列，即创建越早优先级越高，
 * 一个附件命中的第一条已启用规则生效，不叠加匹配多条。 */
export interface SandboxRule {
  id?: number;
  name: string;
  enabled: boolean;
  /** 检测范围方向，支持多选（接收/外发/域内可任意组合）。 */
  direction: Direction[];
  /** 特定收发信人筛选开关，关闭时该条件不参与匹配。 */
  sender_recipient_filter_enabled: boolean;
  /** 预置文件类型分类 key，如 ['office', 'script', 'exec']。 */
  file_type_categories: string[];
  /** 自定义扩展名，如 ['.iso']，需以 '.' 开头。 */
  custom_extensions: string[];
  /** 单文件送检大小上限（MB），超过则跳过送检，按基础限制的超限处置处理。 */
  max_file_size_mb: number;
  risk_actions: SandboxRiskActionConfig;
  timeout: SandboxTimeoutConfig;
  created_at: string;
  updated_at: string;
}
