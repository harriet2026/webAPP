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

/** 附件沙箱检测规则：按方向/后缀命中后送入沙箱动态执行，依结果或超时处置。 */
export interface SandboxRule {
  id?: number;
  name: string;
  enabled: boolean;
  directions: Direction[];
  /** 逗号分隔的送检后缀名列表，例如 .exe,.docm,.js。 */
  ext_list: string;
  /** 单个附件送检大小上限（MB），-1 表示不限制。 */
  max_size_mb: number;
  detect_action: Exclude<AttachmentAction, 'accept' | 'partial_skip'>;
  timeout_action: Exclude<AttachmentAction, 'partial_skip'>;
}
