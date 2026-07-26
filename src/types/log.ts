export interface EmailLog {
  id: number;
  message_id?: string;
  message_uuid?: string;
  client_ip: string;
  sender: string;
  sender_name?: string;
  sender_domain?: string;
  recipients: string[];
  to_cc_details?: EmailRecipient[];
  bcc?: string[];

  smtp_user?: string;
  authenticated?: boolean;
  auth_type?: string;

  spf_valid?: string;
  spf_record?: string;
  spf_reason?: string;
  spf_ip_range?: string;
  dkim_valid?: string;
  dkim_domain?: string;
  dkim_selector?: string;
  dkim_reason?: string;
  // Outbound DKIM signing result (null for inbound / non-candidate mail).
  // Distinct from the inbound verification fields above.
  dkim_outbound_signed?: boolean | null;
  dkim_outbound_selector?: string | null;
  dkim_outbound_skip_reason?: string | null;
  dmarc_valid?: string;
  dmarc_domain?: string;
  dmarc_policy?: string;
  dmarc_spf_aligned?: boolean;
  dmarc_dkim_aligned?: boolean;
  dmarc_record?: string;
  dmarc_reason?: string;
  dmarc_from_domain?: string;
  cac_result?: Record<string, unknown>;
  ptr_valid?: boolean;
  ptr_domain?: string;
  cac_rules?: string;
  rcpttags?: Record<string, string[]>;

  geo_region?: string;
  geo_region_name?: string;
  geo_continent?: string;
  geo_city?: string;
  geo_asn?: number;
  geo_isp?: string;

  matched_tag_rules?: Record<string, Record<string, number[]>>;
  matched_action_rules?: Record<string, Record<string, number[]>>;
  matched_route_rules?: Record<string, Record<string, number[]>>;
  final_action_rule?: Record<string, FinalActionRuleDetail>;

  subject?: string;
  content?: string;
  html_content?: string;
  attachments?: MailAttachment[];
  urls?: string[];

  action: string;
  status?: string;
  reason?: string;

  queue_id?: string;
  delivery_status_summary?: string;
  workflow_outcome_summary?: string;
  delivery_attempts?: number;
  last_delivery_event_at?: string;
  delivery_error_summary?: string;
  delivery_recipients_summary?: DeliveryRecipientSummary[] | string;
  delivery_agg_version?: number;

  tenant_id?: number;
  tenant_name?: string;

  processing_time_ms?: number;
  parse_error?: string;
  storage_path?: string;
  storage_size?: number;
  priority?: number;
  retries?: number;
  session_id?: string;

  timestamp?: string;
  received_at?: string;
  processed_at?: string;
  delivered_at?: string;
  bounced_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface EmailRecipient {
  address?: string;
  name?: string;
  type?: string;
}

export interface MailAttachment {
  filename: string;
  size: number;
  md5sum?: string;
  content_type: string;
  inline: boolean;
  content_length?: number;
  url?: string;
}

export interface EmailLogListResponse {
  items: EmailLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages?: number;
}

export interface FinalActionRuleDetail {
  rule_id: number;
  action: string;
  metadata?: string;
}

export interface DeliveryRecipientSummary {
  recipient: string;
  status: string;
  count: number;
  attempts?: number;
  last_event_at?: string;
  delivered_at?: string;
  failed_at?: string;
  error?: string;
  dsn?: string;
  relay?: string;
}

export interface MailChildEvent {
  id: number;
  mail_log_id?: number;
  event_source: string;
  event_type: string;
  event_result: string;
  queue_id: string;
  parent_queue_id?: string;
  message_id?: string;
  session_id?: string;
  sender?: string;
  recipients?: string;
  recipient?: string;
  relay?: string;
  dsn?: string;
  smtp_status_code?: string;
  event_time: string;
  raw_payload?: string;
  raw_line?: string;
  correlation_status: string;
}

export interface MailLogEventsResponse {
  items: MailChildEvent[];
  total: number;
  page: number;
  page_size: number;
  total_pages?: number;
}

export interface EmailLogSearchParams {
  start_date?: string;
  end_date?: string;
  sender?: string;
  recipient?: string;
  recipient_domain?: string;
  subject?: string;
  action?: string;
  // 'true' = signed, 'false' = not signed, '' = all
  dkim_outbound_signed?: string;
  // 'matched' = similar_detection/same_subject_detection 任一命中；其余值后端静默忽略。
  similar?: string;
  page?: number;
  page_size?: number;
  advanced_filters?: string;
}

export interface SearchFieldDef {
  key: string;
  label: string;
  group: string;
  type: 'text' | 'number' | 'boolean' | 'enum';
  operators: SearchOperator[];
  enum_values?: { value: string; label: string }[];
}

export type SearchOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'regex' | 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'in' | 'not_in' | 'is_null' | 'is_not_null';

export interface FilterCondition {
  field: string;
  op: SearchOperator;
  value?: string | number | boolean | (string | number)[];
}

export interface FilterConditionGroup {
  not?: boolean;
  operator: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface AdvancedFilter {
  operator: 'AND' | 'OR';
  groups: FilterConditionGroup[];
}
