// Types mirror the P3 /spoofing-agent/* JSON contracts (snake_case json tags).
// confidence_threshold is 0-100 (UI scale); detection-log confidence is 0-1.

export type SpoofMatchType = 'exact' | 'wildcard' | 'regex';
export type SpoofDispositionMode = 'observe' | 'standard' | 'strict' | 'custom';
export type SpoofDispositionAction = 'mark' | 'quarantine' | 'reject' | 'discard';
export type SpoofMarkPosition = 'subject' | 'header' | 'banner';
export type SpoofProtectionLevel = 'high' | 'medium' | 'low';
export type SpoofSensitivity = 60 | 75 | 85 | 95;
export type SpoofPersonCategory =
  | 'executive' | 'finance' | 'business' | 'hr' | 'tech' | 'custom';

export interface SpoofLegitEmail {
  email: string;
  match_type: SpoofMatchType;
}

export interface SpoofDisposition {
  mode: SpoofDispositionMode;
  action: SpoofDispositionAction;
  mark_style: SpoofMarkPosition[];
  mark_text?: string;
  notify: boolean;
  admin_emails?: string[];
}

export interface SpoofPersonConfig {
  display_name: string;
  category: SpoofPersonCategory;
  protection_level: SpoofProtectionLevel;
  sensitivity: SpoofSensitivity;
  confidence_threshold: number; // 0-100
  legit_emails: SpoofLegitEmail[];
  disposition: SpoofDisposition;
  enabled: boolean;
  observe_mode: boolean;
}

// Backend embeds SpoofPersonConfig into the DTO → flat JSON (id+name+config fields).
export interface SpoofPersonDTO extends SpoofPersonConfig {
  id: number;
  name: string; // synthetic stable key (spoof_person:<uuid>), read-only
  read_only: boolean; // inherited global profile in a tenant view
}

export interface SpoofProtectedDomain {
  domain: string;
  edit_distance_threshold: number; // default 3
}

export interface SpoofBrandConfig {
  brand_name: string;
  protected_domains: SpoofProtectedDomain[];
  keywords: string[]; // LLM context only — "仅供 AI 研判参考，不参与命中"
  confidence_threshold: number; // 0-100
  disposition: SpoofDisposition;
  enabled: boolean;
  observe_mode: boolean;
}

export interface SpoofBrandDTO extends SpoofBrandConfig {
  id: number;
  name: string; // spoof_brand:<uuid>, read-only
  read_only: boolean; // inherited global profile in a tenant view
}

export interface SpoofNotificationPreviewSample {
  language?: 'zh' | 'en' | 'th' | 'ru';
  sample_sender?: string;
  sample_subject?: string;
  sample_confidence?: number;
}

export interface SpoofNotificationPreviewResponse {
  from: string;
  to: string;
  subject: string;
  text: string;
  mime: string;
  content_type: string;
}

export interface SpoofWhitelistDTO {
  id: number;
  value: string; // normalized email or domain
  match_type: 'email' | 'domain';
}

export interface SpoofEngineCaps {
  max_persons: number;
  max_brands: number;
  max_legit_emails_per_person: number;
  max_domains_per_brand: number;
  max_whitelist_entries: number;
}

export interface SpoofEngineParams {
  enabled: boolean;
  run_mode: 'realtime' | 'observe';
  default_mark_style: { positions: SpoofMarkPosition[]; text?: string };
  caps: SpoofEngineCaps;
  // safety rails passed through verbatim; not all are rendered.
  [key: string]: unknown;
}

export interface SpoofingStats {
  today_detected: number;
  today_intercepted: number;
  pending_review: number;
  displayname_hits: number;
  brand_hits: number;
}

export interface SpoofingLogItem {
  id: string; // "sideline:<id>" | "task:<id>"
  kind: 'sideline' | 'task';
  message_id: string;
  sender: string;
  subject: string;
  recipients: string[];
  direction: string;
  sidelined_at: string;
  verdict?: string;
  risk_level?: string;
  confidence?: number | null; // 0-1
  disposition: string;
  actionable: boolean; // task: (inline fallback) → false (no block/exempt)
  target_name?: string;
  target_type?: string; // person | brand
  spoof_methods?: string[];
}

export interface SpoofingLogListResponse {
  items: SpoofingLogItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface SpoofingLogDetail {
  summary: SpoofingLogItem;
  investigation: Record<string, unknown> | null;
  config_snapshot?: Record<string, unknown> | null;
}

export interface SpoofingLogFilters {
  page?: number;
  page_size?: number;
  keyword?: string;
  disposition?: string[];
  spoof_method?: string[];
  category?: string[];
  start?: string;
  end?: string;
}
