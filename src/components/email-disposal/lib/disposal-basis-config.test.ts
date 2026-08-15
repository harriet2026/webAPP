import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  formatListReason,
  formatHitDetail,
  formatMultiBasisListReason,
  getModuleName,
  getActionLabel,
  getPolicyRoute,
  groupRecipientBasisByPolicy,
  pickPrimaryBasisGroup,
  sortBasisGroupsForTooltip,
  DISPOSAL_POLICY_MAP,
} from './disposal-basis-config';
import type { DisposalBasis } from '@/types/email-disposal';

describe('disposal-basis-config', () => {
  const basis: DisposalBasis = {
    policy_key: 'IPBL',
    rule_name: 'Spamhaus',
    rule_id: 'IPBL-1',
    action: 'quarantine',
    hit_values: { source_ip: '203.0.113.5', entry: 'spamhaus-X' },
  };

  it('formatListReason returns non-empty module-prefixed summary', () => {
    const list = formatListReason(basis, 'zh');
    expect(list).toBeTruthy();
    // Module name is rendered in the bracketed 「规则名」 segment.
    expect(list).toContain('IP黑白名单');
    expect(list).toContain('Spamhaus');
    // Source IP is interpolated into the summary tail.
    expect(list).toContain('203.0.113.5');
  });

  it('formatHitDetail returns non-empty detail string', () => {
    const detail = formatHitDetail(basis, 'zh');
    expect(detail).toBeTruthy();
    expect(detail).toContain('203.0.113.5');
    expect(detail).toContain('spamhaus-X');
  });

  it('list vs detail copy differ', () => {
    const list = formatListReason(basis, 'zh');
    const detail = formatHitDetail(basis, 'zh');
    expect(list).not.toEqual(detail);
  });

  it('falls back to zh for unknown language', () => {
    // Unknown langs default to zh; verify no throw and a non-empty string.
    const list = formatListReason(basis, 'fr' as never);
    expect(list).toBeTruthy();
  });

  it('returns empty for unknown policy_key', () => {
    const unknown: DisposalBasis = { policy_key: 'NOPE', rule_name: 'x', rule_id: 'y' };
    expect(formatListReason(unknown, 'zh')).toBe('');
    expect(formatHitDetail(unknown, 'en')).toBe('');
    expect(getModuleName('NOPE', 'zh')).toBe('');
  });

  it('handles missing hit_values gracefully', () => {
    const sparse: DisposalBasis = { policy_key: 'IPBL', rule_name: 'r', rule_id: 'i' };
    const list = formatListReason(sparse, 'zh');
    const detail = formatHitDetail(sparse, 'zh');
    // val() falls back to '-' for missing keys.
    expect(list).toContain('-');
    expect(detail).toContain('-');
  });

  it('getActionLabel translates known actions per language', () => {
    expect(getActionLabel('quarantine', 'zh')).toBe('隔离');
    expect(getActionLabel('quarantine', 'en')).toBe('Quarantine');
    expect(getActionLabel('discard', 'th')).toBe('ทิ้ง');
    expect(getActionLabel('recall', 'ru')).toBe('Отозвать');
    // Unknown action falls back to the raw value.
    expect(getActionLabel('foobar', 'zh')).toBe('foobar');
  });

  // G4 regression: disposal_basis.action commonly carries "audit" (see
  // internal/models/outbound.go ActionAudit, actionSeverity in
  // internal/antispam/milter.go) -- it must localize like every other
  // action, not fall back to the raw untranslated string.
  it('getActionLabel translates "audit" and the other raw backend action values', () => {
    expect(getActionLabel('audit', 'zh')).toBe('审核');
    expect(getActionLabel('audit', 'en')).toBe('Audit');
    expect(getActionLabel('reject', 'zh')).toBe('拒收');
    expect(getActionLabel('bounce', 'zh')).toBe('退信');
    expect(getActionLabel('sideline', 'zh')).toBe('旁路');
    expect(getActionLabel('accept', 'zh')).toBe('放行');
  });

  it('DISPOSAL_POLICY_MAP carries 4 langs for every entry', () => {
    const keys = Object.keys(DISPOSAL_POLICY_MAP);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      const meta = DISPOSAL_POLICY_MAP[k];
      expect(meta.moduleZh).toBeTruthy();
      expect(meta.moduleEn).toBeTruthy();
      expect(meta.moduleTh).toBeTruthy();
      expect(meta.moduleRu).toBeTruthy();
    }
  });

  it('renders all 4 langs with non-empty hitDetail', () => {
    const langs = ['zh', 'en', 'th', 'ru'] as const;
    for (const lang of langs) {
      const detail = formatHitDetail(basis, lang);
      expect(detail).toBeTruthy();
      expect(detail).toContain('203.0.113.5');
    }
  });

  // GT-12214（复开）：IPBL 同时承载黑/白名单，非中文模块名不再自称 Blacklist。
  it('getModuleName returns localized name', () => {
    expect(getModuleName('IPBL', 'zh')).toBe('IP黑白名单');
    expect(getModuleName('IPBL', 'en')).toBe('IP Allow/Block List');
    expect(getModuleName('IPBL', 'th')).toBe('บัญชีขาว/ดำ IP');
    expect(getModuleName('IPBL', 'ru')).toBe('Белый/чёрный список IP');
  });

  // GT-12192: the mail-disposal output for the stage-5 advanced-filter-rules
  // module (ACF) must use the canonical module name "高级过滤规则", not the
  // legacy "高级内容过滤" carried over from the demo. Names must match the
  // pipeline label (pipeline.advancedRules) across locales.
  it('ACF module name matches the canonical advanced-filter-rules naming', () => {
    expect(getModuleName('ACF', 'zh')).toBe('高级过滤规则');
    expect(getModuleName('ACF', 'en')).toBe('Advanced Filter Rules');
    expect(getModuleName('ACF', 'th')).toBe('กฎการกรองขั้นสูง');
    expect(getModuleName('ACF', 'ru')).toBe('Расширенные правила фильтрации');
  });
});

// GT-12214: 发信人黑白名单共用 policy_key "SBL"，命中白名单时处置依据曾显示
// "命中黑名单"（模块名 moduleEn 也写死 Sender Blacklist），误导运维与审计。
// 现按 hit_values.list_type 区分；缺失时保持黑名单渲染以兼容历史数据。
describe('SBL allow/block list rendering (GT-12214)', () => {
  const mk = (listType?: string) => ({
    policy_key: 'SBL',
    rule_name: 'r',
    rule_id: 'SBL-1',
    hit_values: { sender: 'a@b.com', match_type: '域名', ...(listType ? { list_type: listType } : {}) },
  }) as never;

  it('renders whitelist hits as 白名单, not 黑名单', () => {
    expect(formatListReason(mk('whitelist'), 'zh')).toContain('白名单');
    expect(formatListReason(mk('whitelist'), 'zh')).not.toContain('黑名单');
    expect(formatHitDetail(mk('whitelist'), 'zh')).toContain('白名单');
  });

  it('renders blacklist hits as 黑名单', () => {
    expect(formatListReason(mk('blacklist'), 'zh')).toContain('黑名单');
    expect(formatHitDetail(mk('blacklist'), 'zh')).toContain('黑名单');
  });

  it('falls back to 黑名单 when list_type is absent (legacy rows)', () => {
    expect(formatListReason(mk(), 'zh')).toContain('黑名单');
  });

  it('uses a neutral module name for the shared allow/block module', () => {
    expect(getModuleName('SBL', 'zh')).toBe('发件人黑白名单');
    expect(getModuleName('SBL', 'en')).not.toMatch(/blacklist/i);
  });

  it('localizes whitelist wording in en', () => {
    expect(formatListReason(mk('whitelist'), 'en')).toContain('allowlist');
    expect(formatListReason(mk('blacklist'), 'en')).toContain('blocklist');
  });
});

// GT-12214（复开）：IP 黑白名单（IPBL）与用户黑白名单（UBL）与 SBL 同构——
// 都是一个 policy_key 同时承载黑/白名单，文案却写死"黑名单"。命中白名单时
// 同样会显示成"命中黑名单"，误导运维与审计。按 SBL 同一模式收口。
describe('IPBL / UBL allow-block list rendering (GT-12214 复开)', () => {
  const mkIP = (listType?: string) => ({
    policy_key: 'IPBL',
    rule_name: 'r',
    rule_id: 'IPBL-1',
    hit_values: { source_ip: '203.0.113.9', entry: 'e1', ...(listType ? { list_type: listType } : {}) },
  }) as never;
  const mkUser = (listType?: string) => ({
    policy_key: 'UBL',
    rule_name: 'r',
    rule_id: 'UBL-1',
    hit_values: { user: 'u@b.com', ...(listType ? { list_type: listType } : {}) },
  }) as never;

  it('IPBL 命中白名单渲染为白名单', () => {
    expect(formatListReason(mkIP('whitelist'), 'zh')).toContain('白名单');
    expect(formatListReason(mkIP('whitelist'), 'zh')).not.toContain('黑名单');
    expect(formatHitDetail(mkIP('whitelist'), 'zh')).toContain('白名单');
  });

  it('IPBL 命中黑名单仍渲染为黑名单', () => {
    expect(formatListReason(mkIP('blacklist'), 'zh')).toContain('黑名单');
    expect(formatHitDetail(mkIP('blacklist'), 'zh')).toContain('黑名单');
  });

  it('IPBL 缺 list_type 时回退黑名单（历史数据兼容）', () => {
    expect(formatListReason(mkIP(), 'zh')).toContain('黑名单');
  });

  it('UBL 命中白名单渲染为白名单', () => {
    expect(formatListReason(mkUser('whitelist'), 'zh')).toContain('白名单');
    expect(formatListReason(mkUser('whitelist'), 'zh')).not.toContain('黑名单');
    expect(formatHitDetail(mkUser('whitelist'), 'zh')).toContain('白名单');
  });

  it('UBL 命中黑名单仍渲染为黑名单', () => {
    expect(formatListReason(mkUser('blacklist'), 'zh')).toContain('黑名单');
  });

  it('两个模块名改为中性，不再自称 Blacklist', () => {
    expect(getModuleName('IPBL', 'en')).not.toMatch(/blacklist/i);
    expect(getModuleName('UBL', 'en')).not.toMatch(/blacklist/i);
    expect(getModuleName('IPBL', 'zh')).toBe('IP黑白名单');
    expect(getModuleName('UBL', 'zh')).toBe('用户黑白名单');
  });

  it('en 文案用 allowlist/blocklist', () => {
    expect(formatListReason(mkIP('whitelist'), 'en')).toContain('allowlist');
    expect(formatListReason(mkIP('blacklist'), 'en')).toContain('blocklist');
    expect(formatListReason(mkUser('whitelist'), 'en')).toContain('allowlist');
  });

  // GT-12583 防回归：处置依据规则名的跳转目标必须是 app router 里真实存在的
  // 页面。此前 STAGE_ROUTE 指向 demo 原型的 /filter-rules/*（webapp 从未有过
  // 这些路由），点击即 404——断言"路由对应的 page.tsx 文件存在"能直接拦住
  // 这类"跳转目标失联"的漂移。
  it('GT-12583: 每个 policy 的跳转路由都对应真实存在的 dashboard 页面', () => {
    const dashboardDir = join(__dirname, '../../../app/[locale]/(dashboard)');
    const routes = new Set(
      Object.keys(DISPOSAL_POLICY_MAP)
        .map((k) => getPolicyRoute(k))
        .filter((r): r is string => !!r),
    );
    expect(routes.size).toBeGreaterThan(0);
    for (const route of routes) {
      const pagePath = join(dashboardDir, route, 'page.tsx');
      expect(existsSync(pagePath), `route ${route} -> ${pagePath} 不存在`).toBe(true);
    }
  });
});

// GT-12946：群发邮件多处置依据支撑——按 policy_key 分组、优先桶选取、
// Tooltip 排序、多桶主文案拼接。
describe('multi-recipient disposal basis grouping (GT-12946)', () => {
  const ipfreq: DisposalBasis = {
    policy_key: 'IPFREQ',
    rule_name: '默认频率规则',
    rule_id: 'IPFREQ-1',
    action: 'discard',
    recipient: 'user1@company.com',
  };
  const ipbl: DisposalBasis = {
    policy_key: 'IPBL',
    rule_name: 'Spamhaus',
    rule_id: 'IPBL-1',
    action: 'quarantine',
    recipient: 'user2@company.com',
    hit_values: { source_ip: '203.0.113.5', entry: 'spamhaus-X' },
  };
  const ipbl2: DisposalBasis = {
    policy_key: 'IPBL',
    rule_name: 'Spamhaus',
    rule_id: 'IPBL-1',
    action: 'quarantine',
    recipient: 'user3@company.com',
    hit_values: { source_ip: '203.0.113.5', entry: 'spamhaus-X' },
  };
  const mixedBasis: DisposalBasis = {
    policy_key: ipfreq.policy_key,
    rule_name: ipfreq.rule_name,
    rule_id: ipfreq.rule_id,
    per_recipient: [ipfreq, ipbl, ipbl2],
  };

  it('groupRecipientBasisByPolicy groups per_recipient entries by policy_key', () => {
    const groups = groupRecipientBasisByPolicy(mixedBasis);
    expect(groups).toHaveLength(2);
    const ipblGroup = groups.find((g) => g.policyKey === 'IPBL');
    expect(ipblGroup?.entries).toHaveLength(2);
    const ipfreqGroup = groups.find((g) => g.policyKey === 'IPFREQ');
    expect(ipfreqGroup?.entries).toHaveLength(1);
  });

  it('groupRecipientBasisByPolicy degrades to a single group without per_recipient', () => {
    const single: DisposalBasis = { policy_key: 'IPBL', rule_name: 'r', rule_id: 'IPBL-1' };
    const groups = groupRecipientBasisByPolicy(single);
    expect(groups).toHaveLength(1);
    expect(groups[0].policyKey).toBe('IPBL');
  });

  it('groupRecipientBasisByPolicy returns empty array for undefined/empty basis', () => {
    expect(groupRecipientBasisByPolicy(undefined)).toEqual([]);
    expect(groupRecipientBasisByPolicy({} as DisposalBasis)).toEqual([]);
  });

  it('pickPrimaryBasisGroup defaults to the first group in original order when unfiltered', () => {
    const groups = groupRecipientBasisByPolicy(mixedBasis);
    const primary = pickPrimaryBasisGroup(groups);
    expect(primary?.policyKey).toBe('IPFREQ');
  });

  it('pickPrimaryBasisGroup prioritizes the group matching an active policy-key filter', () => {
    const groups = groupRecipientBasisByPolicy(mixedBasis);
    const primary = pickPrimaryBasisGroup(groups, ['IPBL']);
    expect(primary?.policyKey).toBe('IPBL');
  });

  it('pickPrimaryBasisGroup prioritizes the group matching an active rule-id filter', () => {
    const groups = groupRecipientBasisByPolicy(mixedBasis);
    const primary = pickPrimaryBasisGroup(groups, undefined, ['IPBL-1']);
    expect(primary?.policyKey).toBe('IPBL');
  });

  it('sortBasisGroupsForTooltip is a no-op when no filter is active', () => {
    const groups = groupRecipientBasisByPolicy(mixedBasis);
    const sorted = sortBasisGroupsForTooltip(groups);
    expect(sorted.map((g) => g.policyKey)).toEqual(groups.map((g) => g.policyKey));
  });

  it('sortBasisGroupsForTooltip moves the highlighted group to the front', () => {
    const groups = groupRecipientBasisByPolicy(mixedBasis);
    const sorted = sortBasisGroupsForTooltip(groups, ['IPBL']);
    expect(sorted[0].policyKey).toBe('IPBL');
    expect(sorted).toHaveLength(groups.length);
  });

  it('formatMultiBasisListReason falls back to the plain summary for a single group', () => {
    const groups = groupRecipientBasisByPolicy({ policy_key: 'IPBL', rule_name: 'r', rule_id: 'IPBL-1' });
    const label = formatMultiBasisListReason(groups, 'zh');
    expect(label).toBe(formatListReason(groups[0].entries[0], 'zh'));
  });

  it('formatMultiBasisListReason appends the module count suffix for multiple groups', () => {
    const groups = groupRecipientBasisByPolicy(mixedBasis);
    const label = formatMultiBasisListReason(groups, 'zh');
    expect(label).toContain('等 2 项');
    expect(label).toContain(formatListReason(ipfreq, 'zh'));
  });

  it('formatMultiBasisListReason uses the highlighted group as the primary summary', () => {
    const groups = groupRecipientBasisByPolicy(mixedBasis);
    const label = formatMultiBasisListReason(groups, 'zh', ['IPBL']);
    expect(label).toContain(formatListReason(ipbl, 'zh'));
    expect(label).toContain('等 2 项');
  });

  it('formatMultiBasisListReason localizes the count suffix per language', () => {
    const groups = groupRecipientBasisByPolicy(mixedBasis);
    expect(formatMultiBasisListReason(groups, 'en')).toContain('and 2 more');
    expect(formatMultiBasisListReason(groups, 'th')).toContain('และอีก 2 รายการ');
    expect(formatMultiBasisListReason(groups, 'ru')).toContain('и еще 2');
  });
});
