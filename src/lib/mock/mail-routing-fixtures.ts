// 邮件路由 html_spec 对齐（design/implement/spec/2026-07-28-mail-routing-html-spec-alignment-design.md）
// + 接通真实后端（Task 13，design/implement/spec/2026-07-29-mail-routing-backend-design.md）——
// mock 基建：fixtures + 内存态 CRUD。
//
// 数据来源：design/origin/demo/components/admin/mail-routing/types.ts 的
// MOCK_DOMAINS / MOCK_RELAY_RULES / MOCK_PROXIES / MOCK_CHANNELS /
// MOCK_OUTBOUND_RULES / MOCK_AUTH_CONFIGS 六组常量，逐字段抄录；demo 的字符串 id
// （d1001/r2001/p3001/c4001/o5001/a6001 …）改用去掉前缀的数字（1001/2001/…），
// 但收信域改用 9001-9005（避免与下方 unified-rules 出站规则的数字 id 空间混淆，
// 呼应群组策略模块已用的 90xx 命名习惯）。
//
// 优先级换算（DEV-1）：demo 是"数值越小越优先"，本项目统一为"数值越大越优先"
// （见根 AGENTS.md）；转发规则与出站规则的换算结果由 brief 给出，直接落到
// 下面的字面量里，不在这里重新推导。
//
// Task 13 起，六组资源全部对应真实后端 API（准入规则/代理/通道分别取代旧
// relay-grants/mail-routing 虚拟 endpoint）：fixture 字段直接采用真实后端契约的
// snake_case 命名（internal/models/mail_admission.go、internal/models/proxysvr.go、
// internal/models/unified_rules.go RouteDecision），dispatcher 侧不再需要额外的
// mock-only 展示扩展位（mail_routing_ext / metadata.mr_ext）转换。

import type { TenantDomain, TenantDomainNexthop } from '@/types/tenant';
import type { Rule, RuleNode } from '@/types/unified-rules';
import type { MailAuthConfig } from '@/lib/api/mail-auth';

export type MrProbeStatus = 'normal' | 'abnormal' | 'unchecked' | 'partial';
export type MrEnableStatus = 'enabled' | 'disabled';
export type MrMatchKind = 'contains' | 'equals' | 'regex';
export type MrRouteRcptMatch = 'to' | 'cc' | 'bcc';
/** 后端 wire 值：plain|prefer|force|force_verify（RouteDecision.TLSLevel）。 */
export type MrTlsLevelWire = 'plain' | 'prefer' | 'force' | 'force_verify';
/** 后端 wire 值：1.0|1.1|1.2|1.3（ProxysvrEndpoint.TLSMinVersion）。 */
export type MrTlsMinVersion = '1.0' | '1.1' | '1.2' | '1.3';
export type MrCipherProfile = 'default' | 'high' | 'compatible';

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const isIPv4 = (v: string) =>
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(v.trim());

// ==================== 收信域（demo MOCK_DOMAINS）====================

export interface MrDomainFixture {
  id: number;
  domain: string;
  hosts: string[];
  port: number;
  status: MrProbeStatus;
  abnormal?: number;
  lastProbe: string | null;
}

export const mrMockDomains: MrDomainFixture[] = [
  { id: 9001, domain: 'example.cn', hosts: ['192.168.1.10', '192.168.1.11'], port: 25, status: 'normal', lastProbe: '2026-06-18 09:12:03' },
  { id: 9002, domain: 'mail.example.cn', hosts: ['192.168.1.20'], port: 25, status: 'normal', lastProbe: '2026-06-18 08:55:41' },
  { id: 9003, domain: 'corp.example.com', hosts: ['10.0.0.5', '10.0.0.6', '10.0.0.7', '10.0.0.8'], port: 587, status: 'partial', abnormal: 2, lastProbe: '2026-06-18 07:30:10' },
  { id: 9004, domain: 'legacy.example.net', hosts: ['172.16.0.30'], port: 25, status: 'abnormal', lastProbe: '2026-06-17 22:01:55' },
  { id: 9005, domain: 'newdomain.cn', hosts: ['192.168.2.1'], port: 25, status: 'unchecked', lastProbe: null },
];

function toTenantDomain(row: MrDomainFixture, tenantId: number): TenantDomain {
  const primaryHost = row.hosts[0] ?? '';
  const stamp = row.lastProbe ?? '2026-06-01 00:00:00';
  return {
    id: row.id,
    tenant_id: tenantId,
    domain: row.domain,
    next_hop_type: isIPv4(primaryHost) ? 'ip' : 'domain',
    next_hop_host: primaryHost,
    next_hop_port: row.port,
    is_active: true,
    mail_system_type: 'generic',
    mail_system_config: null,
    verify_status: 'verified',
    verified_by: 'manual',
    created_at: stamp,
    updated_at: stamp,
  };
}

function toNexthops(row: MrDomainFixture): TenantDomainNexthop[] {
  const abnormalCount = row.status === 'partial' ? (row.abnormal ?? 0) : row.status === 'abnormal' ? row.hosts.length : 0;
  return row.hosts.map((host, idx) => ({
    id: row.id * 100 + idx + 1,
    tenant_domain_id: row.id,
    host,
    port: row.port,
    next_hop_type: isIPv4(host) ? 'ip' : 'domain',
    priority: idx,
    is_active: true,
    probe_status: row.status === 'unchecked' ? 'unchecked' : idx < abnormalCount ? 'abnormal' : 'normal',
    last_probe_time: row.lastProbe,
    created_at: row.lastProbe ?? '2026-06-01 00:00:00',
    updated_at: row.lastProbe ?? '2026-06-01 00:00:00',
  }));
}

let domainsState: TenantDomain[] = [];
let nexthopsState: TenantDomainNexthop[] = [];
let domainIdSeq = 9100;
let nexthopIdSeq = 950000;

function seedDomains() {
  domainsState = mrMockDomains.map((r) => toTenantDomain(r, 1));
  nexthopsState = mrMockDomains.flatMap((r) => toNexthops(r));
  domainIdSeq = 9100;
  nexthopIdSeq = 950000;
}

export function mockRoutingScope(): { mode: 'single'; tenant_id: number } {
  return { mode: 'single', tenant_id: 1 };
}

export function mockTenantDomainsList(tenantId: number): { items: TenantDomain[] } {
  return { items: domainsState.map((d) => ({ ...d, tenant_id: tenantId })) };
}

export function mockCreateTenantDomain(tenantId: number, body: unknown): TenantDomain {
  const b = (body ?? {}) as Partial<TenantDomain>;
  domainIdSeq += 1;
  const stamp = nowStamp();
  const created: TenantDomain = {
    id: domainIdSeq,
    tenant_id: tenantId,
    domain: String(b.domain ?? ''),
    next_hop_type: String(b.next_hop_type ?? (isIPv4(String(b.next_hop_host ?? '')) ? 'ip' : 'domain')),
    next_hop_host: String(b.next_hop_host ?? ''),
    next_hop_port: Number(b.next_hop_port ?? 25),
    is_active: true,
    mail_system_type: String(b.mail_system_type ?? 'generic'),
    mail_system_config: b.mail_system_config ?? null,
    verify_status: 'pending',
    created_at: stamp,
    updated_at: stamp,
  };
  domainsState.push(created);
  if (created.next_hop_host) {
    nexthopIdSeq += 1;
    nexthopsState.push({
      id: nexthopIdSeq,
      tenant_domain_id: created.id,
      host: created.next_hop_host,
      port: created.next_hop_port,
      next_hop_type: created.next_hop_type === 'ip' ? 'ip' : 'domain',
      priority: 0,
      is_active: true,
      probe_status: 'unchecked',
      last_probe_time: null,
      created_at: stamp,
      updated_at: stamp,
    });
  }
  return created;
}

export function mockUpdateTenantDomain(domainId: number, body: unknown): TenantDomain | null {
  const idx = domainsState.findIndex((d) => d.id === domainId);
  if (idx < 0) return null;
  const b = (body ?? {}) as Partial<TenantDomain>;
  domainsState[idx] = { ...domainsState[idx], ...b, id: domainId, updated_at: nowStamp() };
  return domainsState[idx];
}

export function mockDeleteTenantDomain(domainId: number): boolean {
  const idx = domainsState.findIndex((d) => d.id === domainId);
  if (idx < 0) return false;
  domainsState.splice(idx, 1);
  nexthopsState = nexthopsState.filter((n) => n.tenant_domain_id !== domainId);
  return true;
}

export function mockNexthopsList(domainId: number): { items: TenantDomainNexthop[] } {
  return { items: nexthopsState.filter((n) => n.tenant_domain_id === domainId) };
}

export function mockCreateNexthop(domainId: number, body: unknown): TenantDomainNexthop {
  const b = (body ?? {}) as Partial<TenantDomainNexthop>;
  nexthopIdSeq += 1;
  const stamp = nowStamp();
  const created: TenantDomainNexthop = {
    id: nexthopIdSeq,
    tenant_domain_id: domainId,
    host: String(b.host ?? ''),
    port: Number(b.port ?? 25),
    next_hop_type: b.next_hop_type === 'ip' ? 'ip' : 'domain',
    priority: Number(b.priority ?? 0),
    is_active: b.is_active ?? true,
    probe_status: 'unchecked',
    last_probe_time: null,
    created_at: stamp,
    updated_at: stamp,
  };
  nexthopsState.push(created);
  return created;
}

export function mockUpdateNexthop(nexthopId: number, body: unknown): TenantDomainNexthop | null {
  const idx = nexthopsState.findIndex((n) => n.id === nexthopId);
  if (idx < 0) return null;
  const b = (body ?? {}) as Partial<TenantDomainNexthop>;
  nexthopsState[idx] = { ...nexthopsState[idx], ...b, id: nexthopId, updated_at: nowStamp() };
  return nexthopsState[idx];
}

export function mockDeleteNexthop(nexthopId: number): boolean {
  const idx = nexthopsState.findIndex((n) => n.id === nexthopId);
  if (idx < 0) return false;
  nexthopsState.splice(idx, 1);
  return true;
}

export interface MrDomainProbeResult {
  probe_status: 'normal' | 'abnormal' | 'partial' | 'unchecked';
  last_probe_time: string;
  nexthops: Array<{ id: number; host: string; port: number; probe_status: 'normal' | 'abnormal' | 'unchecked' }>;
}

// demo probeRow 语义（receiving-domain-tab.tsx）：随机三态，r>0.6 正常
// (40%)，r>0.3 部分异常 (30%)，否则全部异常 (30%)；部分异常时异常路数取
// max(1, floor(路数/2))。
export function mockProbeDomain(domainId: number): MrDomainProbeResult | null {
  const nhs = nexthopsState.filter((n) => n.tenant_domain_id === domainId && n.is_active);
  if (nhs.length === 0) return null;
  const r = Math.random();
  const status: 'normal' | 'abnormal' | 'partial' = r > 0.6 ? 'normal' : r > 0.3 ? 'partial' : 'abnormal';
  const abnormalCount = status === 'normal' ? 0 : status === 'abnormal' ? nhs.length : Math.max(1, Math.floor(nhs.length / 2));
  const stamp = nowStamp();
  nhs.forEach((n, idx) => {
    n.probe_status = idx < abnormalCount ? 'abnormal' : 'normal';
    n.last_probe_time = stamp;
    n.updated_at = stamp;
  });
  return {
    probe_status: status,
    last_probe_time: stamp,
    nexthops: nhs.map((n) => ({ id: n.id, host: n.host, port: n.port, probe_status: (n.probe_status ?? 'unchecked') as 'normal' | 'abnormal' | 'unchecked' })),
  };
}

// ==================== 转发设置 / 未认证放行（mail-admission-rules，取代旧 relay-grants）====================
// Task 13：优先级/HELO/收信域名+匹配方式现在是真实后端列（internal/models/mail_admission.go），
// 不再是 mock-only mail_routing_ext 扩展位。优先级换算（demo 10/50/999 → 990/950/1）已在字面量
// 里体现，无需再转换。

export interface MrAdmissionRule {
  id: number;
  tenant_id: number;
  tenant_domain_id: number | null;
  client_cidr: string;
  use_spf: boolean;
  privileged: boolean;
  allow_null_sender: boolean;
  skip_antispam: boolean;
  rate_limit_per_hour: number | null;
  priority: number;
  helo_pattern: string;
  helo_match: MrMatchKind;
  rcpt_domain: string;
  rcpt_match: MrMatchKind;
  is_active: boolean;
  expires_at: string | null;
  note: string;
  sender_domain: string;
  created_at: string;
  updated_at: string;
}

export const mrMockAdmissionRules: MrAdmissionRule[] = [
  {
    id: 8001, tenant_id: 1, tenant_domain_id: null, note: '内网放行', client_cidr: '192.168.0.0/16', use_spf: false,
    privileged: false, allow_null_sender: false, skip_antispam: true, rate_limit_per_hour: null, is_active: true,
    expires_at: null, sender_domain: 'example.cn', created_at: '2026-06-18 09:00:00', updated_at: '2026-06-18 09:00:00',
    priority: 990, helo_pattern: '', helo_match: 'contains', rcpt_domain: 'example.cn', rcpt_match: 'equals',
  },
  {
    id: 8002, tenant_id: 1, tenant_domain_id: null, note: '合作伙伴转发', client_cidr: '203.0.113.5,203.0.113.6', use_spf: true,
    privileged: false, allow_null_sender: false, skip_antispam: false, rate_limit_per_hour: null, is_active: true,
    expires_at: null, sender_domain: 'partner.com', created_at: '2026-06-17 18:22:30', updated_at: '2026-06-17 18:22:30',
    priority: 950, helo_pattern: 'partner.com', helo_match: 'contains', rcpt_domain: 'example.cn', rcpt_match: 'contains',
  },
  {
    id: 8003, tenant_id: 1, tenant_domain_id: null, note: '兜底拒绝', client_cidr: '', use_spf: false,
    privileged: false, allow_null_sender: false, skip_antispam: false, rate_limit_per_hour: null, is_active: false,
    // demo 原值 fromDomain 是 ""（无限定发信域），不是 null——sender_domain 类型为 string
    // （"ANY 发信域" 由 tenant_domain_id: null 表达），这里照 demo 真实值取空串。
    expires_at: null, sender_domain: '', created_at: '2026-06-15 11:05:12', updated_at: '2026-06-15 11:05:12',
    priority: 1, helo_pattern: '', helo_match: 'contains', rcpt_domain: '', rcpt_match: 'contains',
  },
];

let admissionRulesState: MrAdmissionRule[] = [];
let admissionRuleIdSeq = 8003;
let admissionPolicyState = {
  enabled: true,
  trusted_cidrs: ['192.168.0.0/16', '10.0.0.0/8'],
  min_prefix_len_v4: 24,
  min_prefix_len_v6: 64,
  can_privilege: true,
};

function seedAdmissionRules() {
  admissionRulesState = mrMockAdmissionRules.map((r) => ({ ...r }));
  admissionRuleIdSeq = 8003;
  admissionPolicyState = {
    enabled: true,
    trusted_cidrs: ['192.168.0.0/16', '10.0.0.0/8'],
    min_prefix_len_v4: 24,
    min_prefix_len_v6: 64,
    can_privilege: true,
  };
}

export function mockMailAdmissionRulesList(): { items: MrAdmissionRule[] } {
  return { items: admissionRulesState };
}

export function mockMailAdmissionPolicy() {
  return admissionPolicyState;
}

export function mockSetMailAdmissionPolicy(body: unknown) {
  const b = (body ?? {}) as { enabled?: boolean };
  admissionPolicyState = { ...admissionPolicyState, enabled: b.enabled ?? admissionPolicyState.enabled };
  return admissionPolicyState;
}

export function mockCreateMailAdmissionRule(body: unknown): MrAdmissionRule {
  const b = (body ?? {}) as Partial<MrAdmissionRule>;
  admissionRuleIdSeq += 1;
  const stamp = nowStamp();
  const created: MrAdmissionRule = {
    id: admissionRuleIdSeq,
    tenant_id: 1,
    tenant_domain_id: b.tenant_domain_id ?? null,
    client_cidr: b.client_cidr ?? '',
    use_spf: b.use_spf ?? false,
    privileged: b.privileged ?? false,
    allow_null_sender: b.allow_null_sender ?? false,
    skip_antispam: b.skip_antispam ?? false,
    rate_limit_per_hour: b.rate_limit_per_hour ?? null,
    priority: b.priority ?? 0,
    helo_pattern: b.helo_pattern ?? '',
    helo_match: b.helo_match ?? 'contains',
    rcpt_domain: b.rcpt_domain ?? '',
    rcpt_match: b.rcpt_match ?? 'contains',
    is_active: b.is_active ?? true,
    expires_at: b.expires_at ?? null,
    note: b.note ?? '',
    sender_domain: b.sender_domain ?? '',
    created_at: stamp,
    updated_at: stamp,
  };
  admissionRulesState.push(created);
  return created;
}

export function mockUpdateMailAdmissionRule(id: number, body: unknown): MrAdmissionRule | null {
  const idx = admissionRulesState.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const b = (body ?? {}) as Partial<MrAdmissionRule>;
  admissionRulesState[idx] = { ...admissionRulesState[idx], ...b, id, updated_at: nowStamp() };
  return admissionRulesState[idx];
}

export function mockDeleteMailAdmissionRule(id: number): boolean {
  const idx = admissionRulesState.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  admissionRulesState.splice(idx, 1);
  return true;
}

// ==================== 出站路由 - 代理 IP（proxysvr-endpoints，真实后端）====================
// Task 13：取代旧 mail-routing-mockonly.ts 虚拟 endpoint。字段对齐
// internal/models/proxysvr.go::ProxysvrEndpoint（lid/presend_code/license_present/use_tls
// 均为 Task 7/8/9 已交付的真实列）。

export interface MrProxysvrEndpoint {
  id: number;
  name: string;
  host: string;
  port: number;
  presend_code: number;
  lid: string;
  license_present: boolean;
  use_tls: boolean;
  is_active: boolean;
  egress_ip: string;
  helo_hostname: string;
  tls_min_version: MrTlsMinVersion;
  cipher_profile: MrCipherProfile;
  probe_status: MrProbeStatus;
  last_probe_time: string | null;
}

export const mrMockProxies: MrProxysvrEndpoint[] = [
  { id: 3001, name: '主出口-电信', host: '1.1.1.1', port: 6620, presend_code: 347, lid: 'lid-3001', license_present: false, use_tls: false, is_active: true, egress_ip: '132.148.32.1', helo_hostname: 'mail.test.com', tls_min_version: '1.2', cipher_profile: 'default', probe_status: 'normal', last_probe_time: '2026-06-18 09:10:00' },
  { id: 3002, name: '备出口-联通', host: '1.1.1.2', port: 6620, presend_code: 347, lid: 'lid-3002', license_present: false, use_tls: false, is_active: true, egress_ip: '132.148.32.2', helo_hostname: '', tls_min_version: '1.2', cipher_profile: 'default', probe_status: 'normal', last_probe_time: '2026-06-18 09:10:05' },
  { id: 3003, name: '高安全出口', host: '1.1.1.3', port: 6620, presend_code: 347, lid: 'lid-3003', license_present: true, use_tls: true, is_active: false, egress_ip: '132.148.32.3', helo_hostname: 'mail.secure.com', tls_min_version: '1.3', cipher_profile: 'high', probe_status: 'abnormal', last_probe_time: '2026-06-16 14:00:00' },
];

let proxiesState: MrProxysvrEndpoint[] = [];
let proxyIdSeq = 3003;

function seedProxies() {
  proxiesState = mrMockProxies.map((p) => ({ ...p }));
  proxyIdSeq = 3003;
}

export function mockProxysvrEndpointsList(): { items: MrProxysvrEndpoint[] } {
  return { items: proxiesState };
}

export function mockCreateProxysvrEndpoint(body: unknown): MrProxysvrEndpoint {
  const b = (body ?? {}) as Partial<MrProxysvrEndpoint>;
  proxyIdSeq += 1;
  const created: MrProxysvrEndpoint = {
    id: proxyIdSeq,
    name: b.name ?? '',
    host: b.host ?? '',
    port: b.port ?? 6620,
    presend_code: b.presend_code ?? 347,
    lid: b.lid ?? '',
    // license 从不回显，只回报是否已配置（真实后端语义，proxysvrEndpointView）。
    license_present: !!(b as { license?: string }).license,
    use_tls: b.use_tls ?? false,
    is_active: b.is_active ?? true,
    egress_ip: b.egress_ip ?? '',
    helo_hostname: b.helo_hostname ?? '',
    tls_min_version: b.tls_min_version || '1.2',
    cipher_profile: b.cipher_profile || 'default',
    probe_status: 'unchecked',
    last_probe_time: null,
  };
  proxiesState.push(created);
  return created;
}

export function mockUpdateProxysvrEndpoint(id: number, body: unknown): MrProxysvrEndpoint | null {
  const idx = proxiesState.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const b = (body ?? {}) as Partial<MrProxysvrEndpoint> & { license?: string };
  const prev = proxiesState[idx];
  proxiesState[idx] = {
    ...prev,
    ...b,
    id,
    // 省略/空 license = 保持原值不变（真实后端语义）；非空才翻转 license_present。
    license_present: b.license ? true : prev.license_present,
  };
  return proxiesState[idx];
}

export function mockDeleteProxysvrEndpoint(id: number): boolean {
  const idx = proxiesState.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  proxiesState.splice(idx, 1);
  return true;
}

// POST /proxysvr-endpoints/:id/probe：真实后端做一次 TCP/TLS 探测（≤5s）并回写
// probe_status/last_probe_time；mock 端用同款 70%/30% 概率分布模拟（对齐旧
// proxy-step.tsx 行内探测的 demo 随机语义，浏览器体验一致）。
export function mockProbeProxysvrEndpoint(id: number): { probe_status: MrProbeStatus; last_probe_time: string } | null {
  const idx = proxiesState.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const status: MrProbeStatus = Math.random() > 0.3 ? 'normal' : 'abnormal';
  const stamp = nowStamp();
  proxiesState[idx] = { ...proxiesState[idx], probe_status: status, last_probe_time: stamp };
  return { probe_status: status, last_probe_time: stamp };
}

// ==================== 出站路由 - 投递通道（proxysvr-groups，真实后端）====================
// Task 13：取代旧 mail-routing-mockonly.ts 虚拟 endpoint。字段对齐
// internal/models/proxysvr.go::ProxysvrGroup（members 为有序 {endpoint_id, ord} 列表）。

export interface MrProxysvrGroupMember {
  endpoint_id: number;
  ord: number;
}

export interface MrProxysvrGroup {
  id: number;
  name: string;
  is_active: boolean;
  members: MrProxysvrGroupMember[];
}

export const mrMockChannels: MrProxysvrGroup[] = [
  { id: 4001, name: '测试通道', is_active: true, members: [{ endpoint_id: 3001, ord: 0 }, { endpoint_id: 3002, ord: 1 }] },
  { id: 4002, name: '高安全通道', is_active: true, members: [{ endpoint_id: 3003, ord: 0 }] },
];

let channelsState: MrProxysvrGroup[] = [];
let channelIdSeq = 4002;

function seedChannels() {
  channelsState = mrMockChannels.map((c) => ({ ...c, members: c.members.map((m) => ({ ...m })) }));
  channelIdSeq = 4002;
}

export function mockProxysvrGroupsList(): { items: MrProxysvrGroup[] } {
  return { items: channelsState };
}

// GET /proxysvr-groups/_meta/active：路由规则抽屉的通道下拉，只投影 is_active 的组
// （真实端点任意已认证管理员可读，服务端按 is_active 过滤，见 internal/api/proxysvr.go）。
export function mockActiveProxysvrGroups(): { items: MrProxysvrGroup[] } {
  return { items: channelsState.filter((c) => c.is_active) };
}

export function mockCreateProxysvrGroup(body: unknown): MrProxysvrGroup {
  const b = (body ?? {}) as Partial<MrProxysvrGroup>;
  channelIdSeq += 1;
  const created: MrProxysvrGroup = {
    id: channelIdSeq,
    name: b.name ?? '',
    is_active: b.is_active ?? true,
    members: b.members ?? [],
  };
  channelsState.push(created);
  return created;
}

export function mockUpdateProxysvrGroup(id: number, body: unknown): MrProxysvrGroup | null {
  const idx = channelsState.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  channelsState[idx] = { ...channelsState[idx], ...(body as Partial<MrProxysvrGroup>), id };
  return channelsState[idx];
}

// 通道被投递规则引用时删除会被服务端拦截（409，internal/api/proxysvr.go
// CountRouteRulesReferencingProxysvrGroup），不是旧 demo 语义的"放行+规则 fallback"。
export function mockDeleteProxysvrGroup(id: number): { ok: true } | { ok: false; referenced: true } {
  const idx = channelsState.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: true }; // 已不存在按幂等成功处理，同真实后端 404 由 dispatcher 另行区分
  const referenced = outboundRulesState.some((r) => r.channelId === id);
  if (referenced) return { ok: false, referenced: true };
  channelsState.splice(idx, 1);
  return { ok: true };
}

// ==================== 出站路由 - 路由规则（demo MOCK_OUTBOUND_RULES）====================
// 真实后端走 unified-rules（rule_class=route, stage=data, page=mail_routing_outbound）；
// TLS 等级现在写 metadata.tls_level（真实字段，取代旧 mr_ext.tlsLevel）；成功率现在是列表
// 响应顶层的 tls_success_rate（真实字段，取代旧 mr_ext.tlsSuccessRate，且只读——PUT/POST 不
// 接受该字段，由服务端从 outbound_delivery_stats 聚合计算，mock 端同样忽略客户端传入值）。
// 优先级换算（DEV-1）：demo 100/20 → 900/980（brief 给定，直接落字面量）。

export interface MrOutboundRuleFixture {
  id: number;
  ruleName: string;
  priority: number;
  sourceIp: string;
  fromDomain: string;
  fromUser: string;
  rcptDomain: string;
  rcptDomainMatch: MrMatchKind;
  rcptUser: string;
  rcptUserMatch: MrRouteRcptMatch;
  targetHost: string;
  targetPort: number;
  tlsLevel: MrTlsLevelWire;
  /** 0 = 默认通道（channel=smtp，直连 targetHost:targetPort）；非 0 = 引用的
   * proxysvr_groups.id（channel=proxysvr）。 */
  channelId: number;
  status: MrEnableStatus;
  tlsSuccessRate: number | null;
  /** PUT 写入的完整条件树覆盖（步骤三抽屉整树保存，见 mockUpdateOutboundRule）；
   * 存在时优先于上面五个 discrete 字段用于生成 condition_tree（未定义 = 用种子字段生成）。 */
  conditionTreeRaw?: RuleNode;
}

export const mrMockOutboundRules: MrOutboundRuleFixture[] = [
  { id: 5001, ruleName: '默认外发', priority: 900, sourceIp: '', fromDomain: 'example.cn', fromUser: '', rcptDomain: '', rcptDomainMatch: 'contains', rcptUser: '', rcptUserMatch: 'to', targetHost: '', targetPort: 25, tlsLevel: 'prefer', channelId: 4001, status: 'enabled', tlsSuccessRate: 98 },
  { id: 5002, ruleName: '金融合作方', priority: 980, sourceIp: '', fromDomain: 'example.cn', fromUser: 'finance', rcptDomain: 'bank.com', rcptDomainMatch: 'equals', rcptUser: '', rcptUserMatch: 'to', targetHost: '', targetPort: 25, tlsLevel: 'force_verify', channelId: 4002, status: 'enabled', tlsSuccessRate: 87 },
];

// 注：没有 id 生成计数器——桥接真实 unified-rules.ts 通用函数的 POST /unified-rules
// （无 id 可收窄，会与其它模块的规则创建撞路径）刻意不 mock，照 group-policy 模块
// 同类场景的既有取舍（见 group-policy-mock.test.ts 'POST /unified-rules' → false）：
// 新建请求放行到真实后端，列表仍来自本 fixture。
let outboundRulesState: MrOutboundRuleFixture[] = [];

function seedOutboundRules() {
  outboundRulesState = mrMockOutboundRules.map((r) => ({ ...r }));
}

// mail-routing 出站规则的 mock id 段（5000-5999）——`/unified-rules/:id` 无法
// 靠 query 区分模块归属（真实调用方走 src/lib/api/unified-rules.ts 的通用
// 函数，不带 scope query，见 task-2-brief），沿用群组策略模块已有的
// "id 命名空间收窄" 惯例，只拦截落在本模块 id 段内的写请求，其余数字 id
// 继续放行给既有路由（含放行到真实后端）。
export const MR_OUTBOUND_RULE_ID_PATTERN = /^\/unified-rules\/(5\d{3})(\/status)?$/;

// 条件树字段/算子必须落在真实 unified-rules 引擎的词表内（type: 'AND'|'condition' +
// field/operator/value，见 src/types/unified-rules.ts::RuleNode）。收信人字段的
// to/cc/bcc 由 rcptUserMatch 选择具体字段名（收件人=recipient）。
const RCPT_DOMAIN_OPERATOR: Record<MrMatchKind, string> = { contains: 'contain', equals: 'eq', regex: 'match' };

function buildOutboundConditionTree(row: MrOutboundRuleFixture): RuleNode {
  const children: RuleNode[] = [];
  if (row.sourceIp) children.push({ type: 'condition', field: 'client_ip', operator: 'cidr', value: row.sourceIp });
  if (row.fromDomain) children.push({ type: 'condition', field: 'senderdomain', operator: 'eq', value: row.fromDomain });
  if (row.fromUser) children.push({ type: 'condition', field: 'auth_user', operator: 'eq', value: row.fromUser });
  if (row.rcptDomain) {
    children.push({ type: 'condition', field: 'recipient_domain', operator: RCPT_DOMAIN_OPERATOR[row.rcptDomainMatch], value: row.rcptDomain });
  }
  if (row.rcptUser) {
    const field = row.rcptUserMatch === 'to' ? 'recipient' : row.rcptUserMatch;
    children.push({ type: 'condition', field, operator: 'contain', value: row.rcptUser });
  }
  return { type: 'AND', children };
}

function toUnifiedRule(row: MrOutboundRuleFixture): Rule {
  const conditionTree = row.conditionTreeRaw ?? buildOutboundConditionTree(row);
  const metadata =
    row.channelId !== 0
      ? { channel: 'proxysvr' as const, proxysvr_group_id: row.channelId, tls_level: row.tlsLevel }
      : {
          channel: 'smtp' as const,
          next_hop_type: isIPv4(row.targetHost) ? ('ip' as const) : ('domain' as const),
          next_hop_host: row.targetHost,
          next_hop_port: row.targetPort,
          target_host: row.targetHost,
          target_port: row.targetPort,
          tls_level: row.tlsLevel,
        };
  return {
    id: row.id,
    name: row.ruleName,
    page: 'mail_routing_outbound',
    rule_class: 'route',
    stage: 'data',
    priority: row.priority,
    condition_tree: JSON.stringify(conditionTree),
    action: 'route',
    metadata: JSON.stringify(metadata),
    is_active: row.status === 'enabled',
    tls_success_rate: row.tlsSuccessRate,
    created_at: '2026-06-18 09:00:00',
    updated_at: '2026-06-18 09:00:00',
  };
}

export function mockOutboundRulesUnifiedList(): { items: Rule[] } {
  return { items: outboundRulesState.map(toUnifiedRule) };
}

export function mockUpdateOutboundRule(id: number, body: unknown): Rule | null {
  const idx = outboundRulesState.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const b = (body ?? {}) as Partial<{ name: string; priority: number; is_active: boolean; metadata: unknown; condition_tree: unknown }>;
  let meta: { channel?: string; proxysvr_group_id?: number; target_host?: string; target_port?: number; tls_level?: MrTlsLevelWire } = {};
  if (b.metadata !== undefined) {
    try {
      meta = (typeof b.metadata === 'string' ? JSON.parse(b.metadata) : b.metadata) ?? {};
    } catch {
      // 忽略非法 metadata，保留原值
    }
  }
  const prev = outboundRulesState[idx];
  outboundRulesState[idx] = {
    ...prev,
    ruleName: b.name ?? prev.ruleName,
    priority: b.priority ?? prev.priority,
    status: b.is_active === undefined ? prev.status : b.is_active ? 'enabled' : 'disabled',
    tlsLevel: b.metadata !== undefined ? (meta.tls_level ?? prev.tlsLevel) : prev.tlsLevel,
    channelId: b.metadata !== undefined ? (meta.channel === 'proxysvr' ? (meta.proxysvr_group_id ?? 0) : 0) : prev.channelId,
    targetHost: b.metadata !== undefined ? (meta.target_host ?? prev.targetHost) : prev.targetHost,
    targetPort: b.metadata !== undefined ? (meta.target_port ?? prev.targetPort) : prev.targetPort,
    // tlsSuccessRate 是服务端只读聚合，客户端写请求不携带、也不应该改变它（真实后端语义）。
    // 整树覆盖（步骤三抽屉保存的完整 RuleNode，可能是字符串或对象——真实调用方
    // src/lib/api/unified-rules.ts::updateUnifiedRule 直接把 RuleNode 对象放进 JSON body）；
    // 未提交时保留原覆盖（不回退到 discrete 字段重新生成，避免丢失上一次的手工编辑）。
    conditionTreeRaw:
      b.condition_tree === undefined
        ? prev.conditionTreeRaw
        : ((typeof b.condition_tree === 'string' ? JSON.parse(b.condition_tree) : b.condition_tree) as RuleNode),
  };
  return toUnifiedRule(outboundRulesState[idx]);
}

export function mockSetOutboundRuleStatus(id: number, isActive: boolean): Rule | null {
  const idx = outboundRulesState.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  outboundRulesState[idx] = { ...outboundRulesState[idx], status: isActive ? 'enabled' : 'disabled' };
  return toUnifiedRule(outboundRulesState[idx]);
}

export function mockDeleteOutboundRule(id: number): boolean {
  const idx = outboundRulesState.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  outboundRulesState.splice(idx, 1);
  return true;
}

// ==================== 发信认证（demo MOCK_AUTH_CONFIGS）====================
// tlsMode（单选 off/prefer/force）+ verifyCert（布尔）在真实契约里拆成
// ssl_enabled（布尔）+ protocol_config.starttls/skip_verify，映射关系
// （spec §4.4）：off→ssl_enabled=false,starttls=false；
// prefer→ssl_enabled=false,starttls=true；force→ssl_enabled=true,starttls=false；
// skip_verify 恒为 !verifyCert。brief 已给出换算后的字面量，这里直接照抄。

export type MrMailAuthConfig = MailAuthConfig;

export const mrMockAuthConfigs: MrMailAuthConfig[] = [
  {
    id: 7001, tenant_id: 1, priority: 100, domain_scope: { all: true }, protocol: 'ldap',
    server_host: 'ldap.example.cn', server_port: 389, ssl_enabled: false, auth_timeout: 20,
    protocol_config: { starttls: false, skip_verify: false, bind_dn_template: 'uid=%s,ou=users,dc=example,dc=cn' },
    scenes: ['userspace'], is_active: true, created_at: '2026-06-18 09:00:00', updated_at: '2026-06-18 09:00:00',
  },
  {
    id: 7002, tenant_id: 1, priority: 150, domain_scope: { domains: ['example.cn'] }, protocol: 'smtp',
    server_host: 'smtp.example.cn', server_port: 465, ssl_enabled: true, auth_timeout: 30,
    protocol_config: { starttls: false, auth_mech: 'PLAIN', skip_verify: false },
    scenes: ['smtpsend'], is_active: true, created_at: '2026-06-17 16:30:00', updated_at: '2026-06-17 16:30:00',
  },
  {
    id: 7003, tenant_id: 1, priority: 120, domain_scope: { domains: ['mail.example.cn'] }, protocol: 'imap',
    server_host: 'imap.example.cn', server_port: 993, ssl_enabled: false, auth_timeout: 25,
    protocol_config: { starttls: true, skip_verify: true },
    scenes: ['mailsync'], is_active: true, created_at: '2026-06-16 10:15:00', updated_at: '2026-06-16 10:15:00',
  },
];

let authConfigsState: MrMailAuthConfig[] = [];
let authConfigIdSeq = 7003;

function seedAuthConfigs() {
  authConfigsState = mrMockAuthConfigs.map((c) => ({ ...c }));
  authConfigIdSeq = 7003;
}

export function mockMailAuthConfigsList(): { items: MrMailAuthConfig[]; total: number; page: number; page_size: number } {
  return { items: authConfigsState, total: authConfigsState.length, page: 1, page_size: 100 };
}

export function mockCreateMailAuthConfig(body: unknown): MrMailAuthConfig {
  const b = (body ?? {}) as Partial<MrMailAuthConfig>;
  authConfigIdSeq += 1;
  const stamp = nowStamp();
  const created: MrMailAuthConfig = {
    id: authConfigIdSeq,
    tenant_id: 1,
    priority: b.priority ?? 100,
    domain_scope: b.domain_scope ?? { all: true },
    protocol: b.protocol ?? 'smtp',
    server_host: b.server_host ?? '',
    server_port: b.server_port ?? 25,
    ssl_enabled: b.ssl_enabled ?? false,
    auth_timeout: b.auth_timeout ?? 20,
    protocol_config: b.protocol_config ?? {},
    scenes: b.scenes ?? [],
    is_active: b.is_active ?? true,
    created_at: stamp,
    updated_at: stamp,
  };
  authConfigsState.push(created);
  return created;
}

export function mockUpdateMailAuthConfig(id: number, body: unknown): MrMailAuthConfig | null {
  const idx = authConfigsState.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  authConfigsState[idx] = { ...authConfigsState[idx], ...(body as Partial<MrMailAuthConfig>), id, updated_at: nowStamp() };
  return authConfigsState[idx];
}

export function mockDeleteMailAuthConfig(id: number): boolean {
  const idx = authConfigsState.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  authConfigsState.splice(idx, 1);
  return true;
}

// ==================== 连通性 / 认证测试（demo 语义：900ms + 70% ok）====================
// dispatch() 是同步函数（见 dispatcher.ts 顶部注释），mock 层无法真的挂起
// 900ms；这里把 "900ms" 落到返回体的 latency_ms 上（900ms 附近的抖动），由
// 调用方决定是否用它模拟加载态，随机成功率照抄 demo 的 Math.random()>0.3。
//
// `/mail-routing/connectivity-test` 仍是收信域抽屉「测试连通性」按钮专用的 mock-only
// 虚拟 endpoint（receiving-tab.tsx，任意 host/port 组合的一次性连通性测试，真实后端没有
// 对应 API）；出站代理/通道的连通性测试在 Task 13 已改为真实 TCP/TLS 探测
// （见 mockProbeProxysvrEndpoint），不再复用这个端点。

export interface MrTestResult {
  success: boolean;
  message: string;
  latency_ms: number;
}

function mockDelayedTestResult(okMessage: string, failMessage: string): MrTestResult {
  const success = Math.random() > 0.3;
  return {
    success,
    message: success ? okMessage : failMessage,
    latency_ms: 850 + Math.floor(Math.random() * 100),
  };
}

export function mockMailAuthTest(): MrTestResult {
  return mockDelayedTestResult('连接成功', '连接失败，请检查服务器地址、端口与凭据');
}

export function mockConnectivityTest(): MrTestResult {
  return mockDelayedTestResult('连通性正常', '连接超时或被拒绝');
}

// ==================== 会话内状态复位（测试用）====================

export function __resetMailRoutingMock(): void {
  seedDomains();
  seedAdmissionRules();
  seedProxies();
  seedChannels();
  seedOutboundRules();
  seedAuthConfigs();
}

__resetMailRoutingMock();
