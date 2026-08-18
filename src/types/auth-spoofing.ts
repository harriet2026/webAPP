export type AuthSpoofingAction = 'accept' | 'reject' | 'quarantine' | 'audit' | 'mark-delivery' | 'discard';

export interface CheckItem {
  enabled: boolean;
  action: AuthSpoofingAction;
  observe_mode: boolean;
  /** 以下字段仅在 action === 'mark-delivery' 时生效，为可选的附加标记策略 */
  tag_subject_enabled?: boolean;
  tag_subject_position?: 'prefix' | 'suffix';
  tag_subject_content?: string;
  tag_header_enabled?: boolean;
  tag_header_name?: string;
  tag_header_value?: string;
  tag_body_enabled?: boolean;
  tag_body_content?: string;
}

export interface FormatChecksConfig {
  mailfrom_empty: CheckItem;
  mailfrom_invalid: CheckItem;
  envelope_header_mismatch: CheckItem;
}

export type Template = 'loose' | 'standard' | 'strict' | 'custom';

export interface ProtocolChecksConfig {
  template: Template;
  observe_mode: boolean;
  spf:   Record<string, CheckItem>;
  dkim:  Record<string, CheckItem>;
  dmarc: Record<string, CheckItem>;
  ptr:   Record<string, CheckItem>;
  ptr_readonly?: boolean;
}

export interface SimilarDomainConfig {
  enabled: boolean;
  action: AuthSpoofingAction;
  observe_mode: boolean;
  threshold: number;
  protected_domains: string[];
  /** 以下字段仅在 action === 'mark-delivery' 时生效，为可选的附加标记策略 */
  tag_subject_enabled?: boolean;
  tag_subject_position?: 'prefix' | 'suffix';
  tag_subject_content?: string;
  tag_header_enabled?: boolean;
  tag_header_name?: string;
  tag_header_value?: string;
  tag_body_enabled?: boolean;
  tag_body_content?: string;
}

export interface InternalUser {
  name: string;
  match_mode: 'exact' | 'substring';
}

export interface DisplayNameSpoofConfig {
  inbound:  CheckItem;
  outbound: CheckItem;
  internal: CheckItem;
  internal_users: InternalUser[];
}

export interface AuthSpoofingConfig {
  format_checks:     FormatChecksConfig;
  protocol_checks:   ProtocolChecksConfig;
  similar_domain:    SimilarDomainConfig;
  display_name_spoof:DisplayNameSpoofConfig;
}

export interface ObserveStatPoint {
  rule_name: string;
  subfeature: string;
  subkey: string;
  day: string;
  hits: number;
}

export interface ProbeRequest {
  client_ip: string;
  sender: string;
  from_header?: string;
  recipients?: string[];
  spf_result: string;
  dkim_result: string;
  dmarc_result: string;
  ptr_result: string;
}

export interface ProbeHit {
  rule_id: number;
  rule_name: string;
  action: string;
  observed: boolean;
  subfeature: string;
  subkey: string;
}

export interface ProbeResponse {
  hits: ProbeHit[];
  final_action: string;
}
