import { apiRequest, type ApiRequestFn } from './client';

/**
 * 统一准入规则（GT-12329 / 邮件路由后端方案 B1，取代 relay-grants；
 * `internal/models/mail_admission.go` MailAdmissionRule，`internal/api/mail_admission.go`）。
 *
 * 来源认证同旧 RelayGrant：IP∈client_cidr 与 use_spf 为 OR 关系；命中后还需满足
 * HELO/收件域等附加条件（helo_pattern/helo_match、rcpt_domain/rcpt_match）。priority
 * 数值越大越优先（见根 AGENTS.md）。
 */
export type MatchKind = 'contains' | 'equals' | 'regex';

export interface MailAdmissionRule {
  id: number;
  tenant_id: number;
  /** null = ANY 发信域（真正的开放中继，仅 privileged）。 */
  tenant_domain_id: number | null;
  /** 空 CIDR 表示仅靠 use_spf 授权来源。 */
  client_cidr: string;
  use_spf: boolean;
  privileged: boolean;
  allow_null_sender: boolean;
  skip_antispam: boolean;
  rate_limit_per_hour: number | null;
  /** 数值越大越优先。 */
  priority: number;
  helo_pattern: string;
  helo_match: MatchKind;
  rcpt_domain: string;
  rcpt_match: MatchKind;
  is_active: boolean;
  expires_at: string | null;
  note: string;
  /** JOIN 派生只读字段（tenant_domain_id → tenant_domains.domain）。 */
  sender_domain: string;
  created_at: string;
  updated_at: string;
}

export interface MailAdmissionRulePayload {
  tenant_domain_id?: number | null;
  client_cidr: string;
  use_spf?: boolean;
  privileged?: boolean;
  allow_null_sender?: boolean;
  skip_antispam?: boolean;
  rate_limit_per_hour?: number | null;
  priority?: number;
  helo_pattern?: string;
  helo_match?: MatchKind | '';
  rcpt_domain?: string;
  rcpt_match?: MatchKind | '';
  is_active?: boolean;
  expires_at?: string | null;
  note?: string;
}

/** 系统级主开关，供表单预校验/解释拒绝原因。 */
export interface MailAdmissionPolicy {
  enabled: boolean;
  trusted_cidrs: string[];
  min_prefix_len_v4: number;
  min_prefix_len_v6: number;
  /** 只有 system_admin 才能创建"任意发信域"/池外授权的规则。 */
  can_privilege: boolean;
}

export async function getMailAdmissionRules(
  request: ApiRequestFn = apiRequest,
): Promise<MailAdmissionRule[]> {
  const res = await request<{ items: MailAdmissionRule[] }>('/mail-admission-rules');
  return res.items ?? [];
}

export async function getMailAdmissionPolicy(
  request: ApiRequestFn = apiRequest,
): Promise<MailAdmissionPolicy> {
  return request<MailAdmissionPolicy>('/mail-admission/_meta/policy');
}

/** 翻转系统级准入主开关（system_admin only，服务端校验）。 */
export async function setMailAdmissionPolicyEnabled(
  enabled: boolean,
  request: ApiRequestFn = apiRequest,
): Promise<MailAdmissionPolicy> {
  return request<MailAdmissionPolicy>('/mail-admission/_meta/policy', {
    method: 'PUT',
    body: { enabled },
  });
}

export async function createMailAdmissionRule(
  payload: MailAdmissionRulePayload,
  request: ApiRequestFn = apiRequest,
): Promise<MailAdmissionRule> {
  return request<MailAdmissionRule>('/mail-admission-rules', {
    method: 'POST',
    body: payload,
  });
}

export async function updateMailAdmissionRule(
  id: number,
  payload: MailAdmissionRulePayload,
  request: ApiRequestFn = apiRequest,
): Promise<MailAdmissionRule> {
  return request<MailAdmissionRule>(`/mail-admission-rules/${id}`, {
    method: 'PUT',
    body: payload,
  });
}

export async function deleteMailAdmissionRule(
  id: number,
  request: ApiRequestFn = apiRequest,
): Promise<void> {
  await request<void>(`/mail-admission-rules/${id}`, { method: 'DELETE' });
}
