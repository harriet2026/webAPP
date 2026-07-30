// 转发设置单表（Task 13，design/implement/spec/2026-07-29-mail-routing-backend-design.md）——
// MailAdmissionRule ⇄ RelayRuleRow 映射。
//
// 数据层落 mail-admission-rules API（取代 relay-grants）：来源 IP=client_cidr、SPF=use_spf、
// 发信域=sender_domain、垃圾过滤=!skip_antispam、启停=is_active、规则名=note、优先级=priority、
// HELO=helo_pattern、收信域名+匹配方式=rcpt_domain/rcpt_match——全部是后端真实列（替代旧
// mail_routing_ext mock-only 扩展位，见 doc/mail-routing.md §5）。
//
// 已知限制（未改后端，超出本次范围）：`sender_domain` 是 JOIN 派生的只读字段
// （internal/models/mail_admission.go `db:"-"`，来自 tenant_domain_id → tenant_domains.domain），
// 写请求走的是 tenant_domain_id 外键，没有可直接写的 sender_domain 字段——relay-tab.tsx 的保存
// 逻辑仍需把自由文本"发信域名"换算成已验证租户域名的 tenant_domain_id（沿用旧版行为）。

import type { MailAdmissionRule, MatchKind } from '@/lib/api/mail-admission';
import type { EnableStatus, RcptMatchType } from './mr-types';

export interface RelayRuleRow {
  id: number;
  ruleName: string;
  priority: number;
  /** 空 CIDR 在行/表单里统一显示为 'ALL'。 */
  sourceIp: string;
  useSpf: boolean;
  heloValue: string;
  fromDomain: string;
  rcptDomain: string;
  rcptMatchType: RcptMatchType;
  spamFilter: boolean;
  status: EnableStatus;
  updatedAt: string;
}

/** 新建草稿。
 *
 * GT-12329 review Important I9：spamFilter 默认必须是 true（新建规则默认开启反
 * 垃圾/skip_antispam=false），与后端 mail_admission_rules.skip_antispam 的零值
 * 默认（INT NOT NULL DEFAULT 0，即 false=不跳过反垃圾）保持一致。此前默认
 * false → rowToRulePayload 算出 skip_antispam=true，等于新建规则默认对匹配到
 * 的邮件关闭反垃圾——与后端安全默认相反，运营者不显式勾选就会静默放行未经检测
 * 的邮件。
 */
export function emptyRelayRow(): RelayRuleRow {
  return {
    id: 0,
    ruleName: '',
    priority: 100,
    sourceIp: 'ALL',
    useSpf: false,
    heloValue: '',
    fromDomain: '',
    rcptDomain: '',
    rcptMatchType: 'contains',
    spamFilter: true,
    status: 'enabled',
    updatedAt: '',
  };
}

const MATCH_KIND_TO_RCPT: Record<MatchKind, RcptMatchType> = {
  contains: 'contains',
  equals: 'equals',
  regex: 'regex',
};

export function ruleToRow(r: MailAdmissionRule): RelayRuleRow {
  return {
    id: r.id,
    ruleName: r.note,
    priority: r.priority,
    sourceIp: r.client_cidr === '' ? 'ALL' : r.client_cidr,
    useSpf: r.use_spf,
    heloValue: r.helo_pattern,
    fromDomain: r.sender_domain,
    rcptDomain: r.rcpt_domain,
    rcptMatchType: MATCH_KIND_TO_RCPT[r.rcpt_match] ?? 'contains',
    spamFilter: !r.skip_antispam,
    status: r.is_active ? 'enabled' : 'disabled',
    updatedAt: r.updated_at,
  };
}

export interface RelayRulePayload {
  client_cidr: string;
  use_spf: boolean;
  sender_domain: string | null;
  skip_antispam: boolean;
  is_active: boolean;
  note: string;
  priority: number;
  helo_pattern: string;
  rcpt_domain: string;
  rcpt_match: MatchKind;
}

export function rowToRulePayload(row: RelayRuleRow): RelayRulePayload {
  const cidr = row.sourceIp.trim();
  const fromDomain = row.fromDomain.trim();
  return {
    client_cidr: cidr === '' || cidr.toUpperCase() === 'ALL' ? '' : cidr,
    use_spf: row.useSpf,
    sender_domain: fromDomain === '' ? null : fromDomain,
    skip_antispam: !row.spamFilter,
    is_active: row.status === 'enabled',
    note: row.ruleName,
    priority: row.priority,
    helo_pattern: row.heloValue,
    rcpt_domain: row.rcptDomain,
    rcpt_match: row.rcptMatchType,
  };
}

/** 列表排序：优先级降序（数值越大越优先），按 id 兜底稳定排序。 */
export function sortRelayRows(rows: RelayRuleRow[]): RelayRuleRow[] {
  return [...rows].sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.id - b.id));
}
