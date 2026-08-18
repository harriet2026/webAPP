import type { Rule } from './unified-rules';

export type ContentRuleMatchType = 'keyword' | 'regex' | 'content_group';
export type ContentRuleScope = 'subject' | 'header' | 'text_body' | 'html_body' | 'attachment_names' | 'attachment_types' | 'attachment_hash' | 'urls';
export type ContentRuleAction = 'reject' | 'quarantine' | 'audit' | 'accept' | 'discard';
export type ContentRuleUiAction = 'deliver' | 'tag_deliver' | 'isolate' | 'review' | 'block' | 'discard';

export interface AcceptHeaderEntry {
  name: string;
  value: string;
}

export interface MarkConfig {
  tag?: string;
  add_headers?: AcceptHeaderEntry[];
  notify_admin: boolean;
  notify_sender: boolean;
}

export interface BlockAlertConfig {
  alert_level?: 'low' | 'medium' | 'high';
  add_headers?: AcceptHeaderEntry[];
  notify_admin: boolean;
  notify_sender: boolean;
}

export interface ContentRuleDirectionConfig {
  enabled: boolean;
  action: ContentRuleAction;
}

export interface ContentRuleDirections {
  receive?: ContentRuleDirectionConfig;
  send?: ContentRuleDirectionConfig;
  internal?: ContentRuleDirectionConfig;
}

export interface ContentRulesMetadata {
  feature: 'content_rules';
  match_type: ContentRuleMatchType;
  match_content: string;
  scopes: ContentRuleScope[];
  directions: ContentRuleDirections;
  mark_config?: MarkConfig;
  block_alert_config?: BlockAlertConfig;
  source?: 'email_disposal_center';
  source_mail_log_id?: number;
  entity_kind?: 'domain' | 'url' | 'attachment_hash';
}

export interface ContentRuleRuleView {
  rule: Rule;
  resolved: ContentRulesMetadata | null;
  is_complex: boolean;
}

export interface ContentRuleFormData {
  name: string;
  description?: string;
  priority: number;
  is_active: boolean;
  valid_from?: string;
  valid_until?: string;
  match_type: ContentRuleMatchType;
  match_content: string;
  scopes: ContentRuleScope[];
  directions: ContentRuleDirections;
  mark_config?: MarkConfig;
  block_alert_config?: BlockAlertConfig;
  // Optional email_type override the rule applies when it wins the final
  // action (spec §6.2 "命中即覆盖"). Empty/undefined = not set.
  email_type?: string;
}
