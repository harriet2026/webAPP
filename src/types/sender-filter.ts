import type { Rule } from './unified-rules';

export type SenderConfigType = 'individual' | 'domain' | 'group';
export type IPRangeType = 'all' | 'single' | 'range' | 'ipGroup';
export type ListType = 'blacklist' | 'whitelist';
export type WhitelistMode = 'bypass_content' | 'direct_deliver';

export type BlacklistAction = 'reject' | 'quarantine' | 'audit';
export type WhitelistAction = 'accept';
export type SenderFilterAction = BlacklistAction | WhitelistAction;

export interface SenderFilterSenderConfig {
  type: SenderConfigType;
  value: string;
}

export interface SenderFilterIPRange {
  type: IPRangeType;
  value?: string;
}

export interface SenderFilterMetadata {
  feature: 'sender_filter';
  sender_config: SenderFilterSenderConfig;
  ip_range: SenderFilterIPRange;
  list_type: ListType;
  whitelist_mode?: WhitelistMode;
}

export interface SenderFilterRuleView {
  rule: Rule;
  list_type: ListType;
  list_id_display: string;
  resolved: SenderFilterMetadata | null;
  is_complex: boolean;
}

export interface SenderFilterGroupOption {
  name: string;
  memberCount: number | null;
}

export interface SenderFilterGroups {
  senderGroups: SenderFilterGroupOption[];
  ipGroups: SenderFilterGroupOption[];
}

export interface SenderFilterFormData {
  name: string;
  description?: string;
  priority: number;
  is_active: boolean;
  valid_until?: string;
  list_type: ListType;
  action: SenderFilterAction;
  whitelist_mode?: WhitelistMode;
  sender_config: SenderFilterSenderConfig;
  ip_range: SenderFilterIPRange;
  // GT-11486: 复杂规则（resolved===null）经抽屉编辑时置 true——页面据此
  // 走"仅基础字段"的部分更新，绝不覆写原有 condition_tree/action/metadata。
  is_complex?: boolean;
}
