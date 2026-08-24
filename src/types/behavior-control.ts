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
export type BehaviorProductAction = 'audit' | 'quarantine' | 'discard' | 'reject';
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

export interface BehaviorCondition {
  dim: BehaviorDimension;
  threshold: number;
}

export interface BehaviorControlMetadata {
  feature: 'behavior_control';
  direction: BehaviorDirection;
  /** GT-12707 多条件模型（1~4 条）。存在时为权威，旧 dim_a/dim_b 字段是其派生镜像 */
  conditions?: BehaviorCondition[];
  /** 条件关系：'or' 任一超限触发 / 'and' 全部超限触发。仅多条时有意义 */
  relation?: 'and' | 'or';
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
  /** 动态条件列表，最少 1 条最多 4 条，替代旧的 dim_a/threshold_a/or_enabled/dim_b/threshold_b 固定字段 */
  conditions: BehaviorCondition[];
  /** 条件关系：false = AND（所有条件同时触发），true = OR（任一条件触发） */
  or_enabled: boolean;
  /** @deprecated 保留供 API 映射层使用，由 conditions[0] 派生 */
  dim_a: BehaviorDimension;
  /** @deprecated 保留供 API 映射层使用，由 conditions[0] 派生 */
  threshold_a: number;
  /** @deprecated 保留供 API 映射层使用，由 conditions[1] 派生 */
  dim_b?: BehaviorDimension;
  /** @deprecated 保留供 API 映射层使用，由 conditions[1] 派生 */
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
  audit: 'audit',
  quarantine: 'quarantine',
  discard: 'discard',
  reject: 'reject',
};

export const BACKEND_TO_PRODUCT: Record<BehaviorBackendAction, BehaviorProductAction> = {
  audit: 'audit',
  quarantine: 'quarantine',
  discard: 'discard',
  reject: 'reject',
};
