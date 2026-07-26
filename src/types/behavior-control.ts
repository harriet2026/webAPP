import type { Rule } from './unified-rules';

export type BehaviorDirection = 'inbound' | 'outbound' | 'internal' | 'bidirectional';
export type BehaviorObjectType = 'global' | 'sender' | 'senderIp' | 'senderDomain';
export type BehaviorSenderSubType = 'individual' | 'group';
export type BehaviorIPSubType = 'single' | 'ipGroup';
export type BehaviorTimeWindow = '1min' | '5min' | '15min' | '1hour' | '6hour' | '24hour' | 'day';
export type BehaviorDimension =
  | 'mail_count'
  | 'ip_count'
  | 'recipient_count'
  | 'attachment_size';
export type BehaviorProductAction = 'review' | 'quarantine' | 'drop' | 'block';
export type BehaviorBackendAction = 'audit' | 'quarantine' | 'discard' | 'reject';
export type RecipientLimitMode = 'detailed' | 'merged';
export type RecipientLimitScope = 'local' | 'all';
export type RecipientLimitAction = 'reject' | 'quarantine' | 'audit' | 'discard';

export interface BehaviorControlObjectConfig {
  type: BehaviorObjectType;
  sub_type?: BehaviorSenderSubType | BehaviorIPSubType;
  value?: string;
}

export type BehaviorControlFormObjectConfig =
  | { type: 'global' }
  | { type: 'sender'; sub_type: 'individual' | 'group'; value: string }
  | { type: 'senderIp'; sub_type: 'single' | 'ipGroup'; value: string }
  | { type: 'senderDomain'; value: string };

export interface BehaviorControlMetadata {
  feature: 'behavior_control';
  direction: BehaviorDirection;
  object_config: BehaviorControlObjectConfig;
  time_window: BehaviorTimeWindow;
  dim_a: BehaviorDimension;
  threshold_a: number;
  or_enabled: boolean;
  dim_b?: BehaviorDimension;
  threshold_b?: number;
}

export interface BehaviorControlFormData {
  name: string;
  description?: string;
  priority: number;
  is_active: boolean;
  valid_from?: string;
  valid_until?: string;
  direction: BehaviorDirection;
  object_config: BehaviorControlFormObjectConfig;
  time_window: BehaviorTimeWindow;
  dim_a: BehaviorDimension;
  threshold_a: number;
  or_enabled: boolean;
  dim_b?: BehaviorDimension;
  threshold_b?: number;
  action: BehaviorProductAction;
}

export interface BehaviorControlRuleView {
  rule: Rule;
  meta: BehaviorControlMetadata | null;
  list_id_display: string;
  is_complex: boolean;
}

export interface RecipientLimitDirectionConfig {
  limit: number;
  scope?: RecipientLimitScope;
  action: RecipientLimitAction;
}

export interface RecipientLimitMergedConfig {
  limit: number;
  action: RecipientLimitAction;
}

export interface RecipientLimitConfig {
  mode: RecipientLimitMode;
  inbound_limit?: RecipientLimitDirectionConfig;
  outbound_limit?: RecipientLimitDirectionConfig;
  internal_limit?: RecipientLimitDirectionConfig;
  merged_limit?: RecipientLimitMergedConfig;
  is_active: boolean;
}

// 收件人检查的 API 组合视图：检测开关/阈值在 detection_profiles，动作由
// page=recipient_check 的统一规则承载并由后端回填。
export interface RecipientCheckConfig {
  existence_enabled: boolean; // 存在性验证策略开关
  existence_action: RecipientLimitAction; // 验证失败执行动作（仅接收方向生效）
}

export const PRODUCT_TO_BACKEND: Record<BehaviorProductAction, BehaviorBackendAction> = {
  review: 'audit',
  quarantine: 'quarantine',
  drop: 'discard',
  block: 'reject',
};

export const BACKEND_TO_PRODUCT: Record<BehaviorBackendAction, BehaviorProductAction> = {
  audit: 'review',
  quarantine: 'quarantine',
  discard: 'drop',
  reject: 'block',
};
