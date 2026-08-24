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
  | 'proceed'
  | 'partial_skip';

export interface AntivirusConfig {
  host: string;
  port: string;
}

export interface AVStatusResponse {
  configured: boolean;
}

export interface AntivirusActionConfig {
  // 「发现病毒后的处置」不提供“拒收”动作，仅支持隔离/审核/丢弃等。
  virus_action: Exclude<AttachmentAction, 'proceed' | 'partial_skip' | 'reject'>;
  timeout_action: Exclude<AttachmentAction, 'partial_skip' | 'reject'>;
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
  qr_light_action: Exclude<AttachmentAction, 'proceed' | 'partial_skip' | 'reject'>;
  qr_deep_exceed_action: 'proceed' | 'quarantine';
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
  decrypt_fail_action: 'quarantine' | 'proceed' | 'audit';
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
