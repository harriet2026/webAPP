import type { Rule } from './unified-rules';

export type SenderConfigType = 'individual' | 'domain' | 'group';
export type IPRangeType = 'all' | 'single' | 'range' | 'ipGroup';
export type ListType = 'blacklist' | 'whitelist';
export type WhitelistMode = 'bypass_content' | 'direct_deliver';

export type BlacklistAction = 'reject' | 'quarantine' | 'audit' | 'discard';
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
  // 观察模式：本次为纯前端交付，暂无后端字段承载，由 SenderFilterPage 维护
  // 的本地态（mock）注入到每一行，不随规则的真实 CRUD 请求持久化。
  observe_mode: boolean;
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
  // 观察模式（mock）：暂无后端字段，页面把这个值落进本地态，不进 CRUD payload。
  observe_mode?: boolean;
}
