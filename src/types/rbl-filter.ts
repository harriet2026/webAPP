export type RBLFilterMatchMode = 'any' | 'specific';
export type RBLFilterProductAction = 'reject' | 'quarantine' | 'review' | 'discard' | 'greylist';

/**
 * 旧数据兼容：GT-12682 之前后端写入过的 product_action 取值。
 * 只出现在读路径（存量规则），写入一律用 RBLFilterProductAction。
 * rbl-config-serde.parseRblConfig 负责把它们映射到新枚举。
 */
export type RBLFilterLegacyProductAction = 'block' | 'mark';

export interface RBLGreylistConfig {
  mode: 'delay' | 'rateLimit';
  delay_seconds: number;
  window_seconds: number;
  max_requests: number;
  whitelist_ttl: number;
  exempt_authenticated?: boolean;
  exempt_whitelisted?: boolean;
  exempt_internal?: boolean;
}

export interface RBLFilterRulePayload {
  name: string;
  description?: string;
  match_mode: RBLFilterMatchMode;
  match_servers?: string[];
  product_action: RBLFilterProductAction;
  greylist?: RBLGreylistConfig;
  priority: number;
  is_active?: boolean;
  valid_from?: string;
  valid_until?: string;
}

export interface RBLFilterRuleView {
  id: number;
  name: string;
  description: string;
  match_mode: RBLFilterMatchMode;
  match_servers: string[];
  product_action: RBLFilterProductAction | RBLFilterLegacyProductAction;
  action: string;
  greylist?: RBLGreylistConfig;
  priority: number;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  is_expired: boolean;
}

export interface RBLProbeResult {
  server: string;
  query_domain: string;
  dns_result: string | null;
  response_ms: number;
  error: string | null;
  hit: boolean;
}

export interface RBLProbeResponse {
  results: RBLProbeResult[];
}

export interface RBLFilterRuleTestRequest {
  match_mode: RBLFilterMatchMode;
  match_servers?: string[];
  product_action: RBLFilterProductAction;
  greylist?: RBLGreylistConfig;
  hit_servers?: string[];
}

export interface RBLFilterRuleTestResponse {
  matched: boolean;
  condition_tree: string;
  action: string;
}

export const RBLProductActionLabels: Record<RBLFilterProductAction, string> = {
  reject: 'rblFilter.actionReject',
  quarantine: 'rblFilter.actionQuarantine',
  review: 'rblFilter.actionReview',
  discard: 'rblFilter.actionDiscard',
  greylist: 'rblFilter.actionGreylist',
};
