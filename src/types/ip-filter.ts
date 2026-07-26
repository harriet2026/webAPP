export type IPFilterListType = 'blacklist' | 'whitelist';
// GT-11464：expression（表达式）取代已废弃的 ipGroup（后端一直拒绝 ipGroup）。
export type IPFilterIPConfigType = 'single' | 'range' | 'expression';
export type IPFilterAction = 'accept' | 'reject' | 'quarantine' | 'sideline' | 'discard' | 'audit';

// demo(html_spec) 展示层动作词表 —— UI 用它，api 层映射到网关统一 IPFilterAction。
export type DemoBlacklistAction = 'block' | 'quarantine' | 'drop' | 'review';
export type DemoWhitelistAction = 'deliver' | 'tagDeliver';
export type DemoAction = DemoBlacklistAction | DemoWhitelistAction;

export interface HeaderKV {
  key: string;
  value: string;
}

// 全局 IP 组元信息（真实端点 GET /unified-rules/_meta/groups?type=ip）。
// id 形如 "grp:<名称>"；rule_id 是组规则的稳定数值 ID —— expression 的
// ip_groups 多选提交用 rule_id（组改名不失效）。
export interface IPGroupMeta {
  id: string;
  label: string;
  rule_id: number;
}

export interface IPFilterRulePayload {
  name: string;
  description?: string;
  list_type: IPFilterListType;
  ip_config_type: IPFilterIPConfigType;
  ip_value: string;
  action: IPFilterAction;
  priority: number;
  is_active?: boolean;
  valid_from?: string;
  valid_until?: string;
  add_headers?: HeaderKV[];
  // 仅 ip_config_type=expression 允许；组的数值规则 ID，≤20 个。
  ip_groups?: number[];
}

export interface IPFilterRuleView {
  id: number;
  name: string;
  description: string;
  list_type: IPFilterListType;
  ip_config_type: IPFilterIPConfigType;
  ip_value: string;
  action: IPFilterAction;
  priority: number;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  add_headers?: HeaderKV[];
  // expression 规则回显引用的组 ID（升序）；其余类型缺省。
  ip_groups?: number[];
  created_at: string;
  updated_at: string;
  is_expired: boolean;
}

export const IPFilterActionLabels: Record<IPFilterAction, string> = {
  accept: 'ipFilter.actionAccept',
  reject: 'ipFilter.actionReject',
  quarantine: 'ipFilter.actionQuarantine',
  sideline: 'ipFilter.actionSideline',
  discard: 'ipFilter.actionDiscard',
  audit: 'ipFilter.actionAudit',
};
