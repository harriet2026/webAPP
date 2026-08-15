import type { Rule } from './unified-rules';

export type ContentRuleMatchType = 'keyword' | 'regex' | 'content_group';
// 'attachment_hash' -- 附件哈希精确匹配（field='attachment_md5'，operator
// 固定为 'eq'，见 lib/api/content-rules.ts 的 buildContentMatchNode 特判）。
// 与 'urls'/'attachment_types' 一样只作为"兼容作用域"存在：简化编辑器的
// ApplyTo 勾选框不提供该选项，只能通过邮件处置中心的「附件哈希加黑」创建，
// 编辑时原样保留（ContentRuleDrawer 的 legacyScopesPreserved 提示）。
export type ContentRuleScope = 'subject' | 'header' | 'text_body' | 'html_body' | 'attachment_names' | 'attachment_types' | 'urls' | 'attachment_hash';
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
  // 规则创建来源标识。仅由邮件处置中心「域名加黑/URL加黑/哈希加黑」按钮
  // 写入，供 ContentRulesTable 展示"来源：邮件处置中心"标识，与手工创建的
  // 内容规则区分；手工创建的规则没有该字段。
  source?: 'email_disposal_center';
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
