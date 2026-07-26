export interface TenantRoutingProgress {
  receiving: boolean;
  relay: boolean;
  outbound: boolean;
  auth: boolean;
}

export type TenantStatus = 'pending' | 'active' | 'suspended';
export type TenantAccessStatus = 'pending' | 'configured';
export type TenantLanguage = 'zh' | 'en' | 'th' | 'ru';

export const TENANT_LANGUAGES: TenantLanguage[] = ['zh', 'en', 'th', 'ru'];

export const TENANT_LANGUAGE_LABELS: Record<TenantLanguage, string> = {
  zh: '中文',
  en: 'English',
  th: 'ไทย',
  ru: 'Русский',
};

export function normalizeTenantLanguage(raw?: string | null): TenantLanguage {
  if (!raw) return 'zh';
  const s = raw.toLowerCase().trim();
  if (s.startsWith('zh')) return 'zh';
  if (s.startsWith('en')) return 'en';
  if (s.startsWith('th')) return 'th';
  if (s.startsWith('ru')) return 'ru';
  return 'zh';
}

export interface Tenant {
  id: number;
  name: string;
  description: string;
  language: TenantLanguage;
  code: string;
  status: TenantStatus;
  expire_at?: string | null;
  capability_flags: string[];
  routing_progress: TenantRoutingProgress;
  expired: boolean;
  access_status: TenantAccessStatus;
  domain_count: number;
  // Populated only by the routing-overview endpoint (GT-11952 / Spec 2B §F7);
  // the 租户管理 list payload omits it and shows domain_count instead.
  domains?: string[];
  // Mirrors models.Tenant.ForceTwoFactor / TwoFactorEnabled (internal/models/tenant.go).
  // The backend serializes both without `omitempty`, so they are always on the
  // wire; declared optional so existing Tenant literals (fixtures, tests) stay
  // valid. force_two_factor = the platform forcing 2FA on THIS tenant;
  // two_factor_enabled = the tenant's own self-toggle.
  force_two_factor?: boolean;
  two_factor_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantStats {
  total: number;
  active: number;
  pending: number;
  awaitingRouting: number;
}

export interface TenantDomainError {
  domain: string;
  reason: string;
}

export interface CreateTenantResponse {
  tenant: Tenant;
  domain_errors: TenantDomainError[];
}

export interface TenantDomain {
  id: number;
  tenant_id: number;
  domain: string;
  next_hop_type: string;
  next_hop_host: string;
  next_hop_port: number;
  is_active: boolean;
  mail_system_type: string;
  mail_system_config?: Record<string, unknown> | null;
  verify_status: 'pending' | 'verified';
  verify_token?: string;
  verified_at?: string;
  verified_by?: 'auto' | 'dns' | 'manual';
  verified_by_user?: string;
  created_at: string;
  updated_at: string;
}

export interface DomainVerifyResult {
  verify_status: 'pending' | 'verified';
  verified_by?: 'auto' | 'dns' | 'manual';
}

export interface CreateTenantRequest {
  code: string;
  name: string;
  description?: string;
  language?: TenantLanguage;
  expire_at?: string | null;
  capability_flags?: string[];
  domains?: Array<{
    domain: string;
    next_hop_type?: string;
    next_hop_host?: string;
    next_hop_port?: number;
    mail_system_type?: string;
    mail_system_config?: Record<string, unknown> | null;
  }>;
}

export interface UpdateTenantRequest {
  code?: string;
  name?: string;
  description?: string;
  language?: TenantLanguage;
  expire_at?: string | null;
  capability_flags?: string[];
  updated_at?: string;
}

export interface CreateTenantDomainRequest {
  domain: string;
  next_hop_type: string;
  next_hop_host: string;
  next_hop_port: number;
  tenant_id?: number;
  mail_system_type?: string;
  mail_system_config?: Record<string, unknown> | null;
}

export interface UpdateTenantDomainRequest {
  domain?: string;
  next_hop_type?: string;
  next_hop_host?: string;
  next_hop_port?: number;
  is_active?: boolean;
  mail_system_type?: string;
  mail_system_config?: Record<string, unknown> | null;
}

export interface TenantLLMSetting {
  tenant_id: number;
  base_url: string;
  model: string;
  enabled: boolean;
  insecure_skip_verify: boolean;
}

export interface UpsertTenantLLMRequest {
  base_url: string;
  model: string;
  // GT-11771 P2: api_key optional on update — omit to keep existing key
  // (used when admin edits other fields without re-entering the key).
  api_key?: string;
  enabled: boolean;
  insecure_skip_verify: boolean;
}

export interface TenantLLMSettingResponse {
  setting: TenantLLMSetting | null;
}

export interface TenantListResponse {
  items: Tenant[];
  total: number;
  page: number;
  page_size: number;
}

export interface TenantDomainListResponse {
  items: TenantDomain[];
}

export type NextHopType = 'domain' | 'ip';

export interface TenantDomainNexthop {
  id: number;
  tenant_domain_id: number;
  host: string;
  port: number;
  next_hop_type: NextHopType;
  priority: number;
  is_active: boolean;
  probe_status?: 'normal' | 'abnormal' | 'unchecked';
  last_probe_time?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantNexthopRequest {
  host: string;
  port: number;
  next_hop_type?: NextHopType;
  priority?: number;
  is_active?: boolean;
}

export interface UpdateTenantNexthopRequest {
  host: string;
  port: number;
  next_hop_type?: NextHopType;
  priority?: number;
  is_active?: boolean;
}

export interface TenantEgressBinding {
  id: number;
  tenant_domain_id: number;
  egress_name: string;
  is_active: boolean;
  sender_domain?: string;
  tenant_id?: number;
}

export interface CreateTenantEgressBindingRequest {
  tenant_domain_id: number;
  egress_name: string;
}

export interface UpdateTenantEgressBindingRequest {
  tenant_domain_id: number;
  egress_name: string;
}

export interface TenantNexthopListResponse {
  items: TenantDomainNexthop[];
}

export interface TenantEgressBindingListResponse {
  items: TenantEgressBinding[];
}

export interface TenantRoutingCounts {
  receiving_domains: number;
  active_egress_names: string[];
  outbound_rules: number;
  smtp_credentials: number;
  active_dkim_keys: number;
}

export interface TenantRoutingSummary {
  tenant_id: number;
  routing_progress: TenantRoutingProgress;
  access_status: TenantAccessStatus;
  counts: TenantRoutingCounts;
}
