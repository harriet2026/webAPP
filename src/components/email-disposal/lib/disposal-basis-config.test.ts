import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  formatListReason,
  formatHitDetail,
  getModuleName,
  getActionLabel,
  getPolicyRoute,
  formatMultiBasisListReason,
  groupDispositionBasisByPolicy,
  groupEffectiveRecipientBasisByRule,
  groupRecipientBasisByPolicy,
  groupsFromSummaries,
  resolveHitModules,
  pickPrimaryBasisGroup,
  recipientBasisState,
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
    const unknown: DisposalBasis = {
      policy_key: 'NOPE',
      rule_name: 'x',
      rule_id: 'y',
    };
    expect(formatListReason(unknown, 'zh')).toBe('');
    expect(formatHitDetail(unknown, 'en')).toBe('');
    expect(getModuleName('NOPE', 'zh')).toBe('');
  });

  it('handles missing hit_values gracefully', () => {
    const sparse: DisposalBasis = {
      policy_key: 'IPBL',
      rule_name: 'r',
      rule_id: 'i',
    };
    const list = formatListReason(sparse, 'zh');
    const detail = formatHitDetail(sparse, 'zh');
    // val() falls back to '-' for missing keys.
    expect(list).toContain('-');
    expect(detail).toContain('-');
  });

  it('omits the INTENT confidence fragment when the backend did not provide a score', () => {
    const intent: DisposalBasis = {
      policy_key: 'INTENT',
      rule_name: 'sysrule:intent_engine:spam:receive',
      rule_id: 'INTENT-70',
      hit_values: { tag_id: 'Tag3', tag_label: '垃圾邮件' },
    };

    expect(formatHitDetail(intent, 'zh')).toBe('Tag3 判定为垃圾邮件');
    expect(formatHitDetail(intent, 'en')).not.toContain('confidence');
    expect(formatHitDetail(intent, 'zh')).not.toContain('-%');
  });

  it('keeps the INTENT confidence fragment when a score is present', () => {
    const intent: DisposalBasis = {
      policy_key: 'INTENT',
      rule_name: 'sysrule:intent_engine:spam:receive',
      rule_id: 'INTENT-70',
      hit_values: { tag_id: 'Tag3', tag_label: '垃圾邮件', confidence: '82' },
    };

    expect(formatHitDetail(intent, 'zh')).toBe('Tag3 判定为垃圾邮件（置信度：82%）');
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

  it('renders measured IP-frequency evidence and uses a neutral suspension fallback', () => {
    const measured: DisposalBasis = {
      policy_key: 'IPFREQ',
      rule_name: '窗口连接限制',
      rule_id: 'IPFREQ-8',
      hit_values: {
        source_ip: '203.0.113.8',
        trigger_type: 'window_connections',
        count: '6',
        limit: '5',
        time_window: '5m0s',
      },
    };
    expect(formatHitDetail(measured, 'zh')).toContain('窗口连接数');
    expect(formatHitDetail(measured, 'zh')).toContain('当前计数 6');
    expect(formatHitDetail(measured, 'zh')).toContain('阈值 5');

    const suspension: DisposalBasis = {
      policy_key: 'IPFREQ',
      rule_name: '挂起中的 IP',
      rule_id: 'IPFREQ-8',
      hit_values: { source_ip: '203.0.113.8' },
    };
    expect(formatHitDetail(suspension, 'zh')).toBe('IP 203.0.113.8 命中 IP 频率限制规则');
    expect(formatHitDetail(suspension, 'zh')).not.toContain('-');
  });

  it('renders measured sending-behavior evidence without inventing a detail', () => {
    const behavior: DisposalBasis = {
      policy_key: 'BEHAVIOR',
      rule_name: '收件人数限制',
      rule_id: 'BEHAVIOR-9',
      hit_values: {
        sender: 'sender@example.test',
        abnormal_type: 'recipient_count',
        count: '21',
        threshold: '20',
      },
    };
    const detail = formatHitDetail(behavior, 'zh');
    expect(detail).toContain('收件人数');
    expect(detail).toContain('当前计数 21');
    expect(detail).toContain('触发阈值 20');
  });

  it('keeps optional AI facts optional', () => {
    const phish = {
      policy_key: 'AI-PHISH',
      rule_name: '钓鱼检测智能体',
    } as DisposalBasis;
    const spoof = {
      policy_key: 'AI-SPOOF',
      rule_name: '仿冒检测智能体',
    } as DisposalBasis;
    expect(formatHitDetail(phish, 'zh')).toBe('AI 判定为钓鱼邮件');
    expect(formatHitDetail(phish, 'zh')).not.toContain('BEC');
    expect(formatHitDetail(phish, 'zh')).not.toContain('-%');
    expect(formatHitDetail(spoof, 'zh')).toBe('AI 判定为身份仿冒邮件');
    expect(formatHitDetail(spoof, 'zh')).not.toContain('显示名');
  });

  it('renders real threat-retro type and confidence from the assessment fact', () => {
    const trace: DisposalBasis = {
      policy_key: 'AI-TRACE',
      rule_name: '威胁回溯智能体',
      rule_id: 'AI-TRACE:run-20260821',
      hit_values: { threat_type: 'impersonation', confidence: '95' },
    };
    expect(formatListReason(trace, 'zh')).toContain('回溯发现身份仿冒风险');
    expect(formatHitDetail(trace, 'zh')).toBe(
      '威胁回溯发现已投递邮件存在身份仿冒风险（置信度：95%）',
    );

    const legacy: DisposalBasis = {
      policy_key: 'AI-TRACE',
      rule_name: '威胁回溯智能体',
    };
    expect(formatHitDetail(legacy, 'zh')).toBe('威胁回溯发现已投递邮件存在风险');
    expect(formatHitDetail(legacy, 'zh')).not.toContain('%');
  });

  it('reads ACF detection tags from the top-level field', () => {
    const acf: DisposalBasis = {
      policy_key: 'ACF',
      rule_name: '财务风险规则',
      rule_id: 'ACF-20',
      detection_tags: ['sys:invoice', 'risk:high'],
    };
    expect(formatHitDetail(acf, 'zh')).toBe(
      '高级过滤规则条件命中，关联检测标签：sys:invoice、risk:high',
    );
  });

  it('renders mail-marking processing hits without adding a security policy filter key', () => {
    const marking: DisposalBasis = {
      policy_key: 'MAIL-MARK',
      rule_name: '外部邮件标记',
      rule_id: 'MAIL-MARK-901',
      action: 'tag',
    };
    expect(getModuleName('MAIL-MARK', 'zh')).toBe('邮件标记与声明');
    expect(formatHitDetail(marking, 'zh')).toBe('命中规则已按配置应用邮件标记或免责声明');
  });
});

// GT-12214: 发信人黑白名单共用 policy_key "SBL"，命中白名单时处置依据曾显示
// "命中黑名单"（模块名 moduleEn 也写死 Sender Blacklist），误导运维与审计。
// 现按 hit_values.list_type 区分；缺失时保持黑名单渲染以兼容历史数据。
describe('SBL allow/block list rendering (GT-12214)', () => {
  const mk = (listType?: string) =>
    ({
      policy_key: 'SBL',
      rule_name: 'r',
      rule_id: 'SBL-1',
      hit_values: {
        sender: 'a@b.com',
        match_type: '域名',
        ...(listType ? { list_type: listType } : {}),
      },
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

  it('renders an individual sender rule as 个人邮箱黑名单', () => {
    const basis = {
      policy_key: 'SBL',
      rule_name: '个人邮箱黑名单',
      rule_id: 'SBL-94',
      hit_values: {
        sender: 'a@b.com',
        list_type: 'blacklist',
        match_type: 'individual',
      },
    } as never;
    expect(formatHitDetail(basis, 'zh')).toBe('发件人 a@b.com 命中个人邮箱黑名单');
    expect(formatHitDetail(basis, 'en')).toContain('individual email address blocklist');
  });

  it.each([
    ['domain', '域名'],
    ['group', '发件人组'],
  ])('localizes the %s sender match type', (matchType, expectedLabel) => {
    const basis = {
      policy_key: 'SBL',
      rule_name: '发件人黑名单',
      rule_id: 'SBL-95',
      hit_values: {
        sender: 'a@b.com',
        list_type: 'blacklist',
        match_type: matchType,
      },
    } as never;
    expect(formatHitDetail(basis, 'zh')).toBe(`发件人 a@b.com 命中${expectedLabel}黑名单`);
  });

  it('does not invent a domain match when legacy rows have no match_type', () => {
    const basis = {
      policy_key: 'SBL',
      rule_name: '个人邮箱黑名单',
      rule_id: 'SBL-94',
      hit_values: { sender: 'a@b.com', list_type: 'blacklist' },
    } as never;
    expect(formatHitDetail(basis, 'zh')).toBe('发件人 a@b.com 命中黑名单');
    expect(formatHitDetail(basis, 'zh')).not.toContain('域名');
  });
});

// GT-12214（复开）：IP 黑白名单（IPBL）与用户黑白名单（UBL）与 SBL 同构——
// 都是一个 policy_key 同时承载黑/白名单，文案却写死"黑名单"。命中白名单时
// 同样会显示成"命中黑名单"，误导运维与审计。按 SBL 同一模式收口。
describe('IPBL / UBL allow-block list rendering (GT-12214 复开)', () => {
  const mkIP = (listType?: string) =>
    ({
      policy_key: 'IPBL',
      rule_name: 'r',
      rule_id: 'IPBL-1',
      hit_values: {
        source_ip: '203.0.113.9',
        entry: 'e1',
        ...(listType ? { list_type: listType } : {}),
      },
    }) as never;
  const mkUser = (listType?: string) =>
    ({
      policy_key: 'UBL',
      rule_name: 'r',
      rule_id: 'UBL-1',
      hit_values: {
        user: 'u@b.com',
        ...(listType ? { list_type: listType } : {}),
      },
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

describe('multi-recipient disposal basis grouping (GT-12935)', () => {
  const basis: DisposalBasis = {
    policy_key: 'CR',
    rule_name: '正文规则',
    rule_id: 'CR-66',
    modules: [
      {
        policy_key: 'CR',
        rule_name: '正文规则',
        rule_id: 'CR-66',
        action: 'quarantine',
        recipients: ['a@example.com', 'b@example.com'],
        effective_for: ['b@example.com'],
        hit_values: { match_position: 'subject', matched_content: '发票' },
      },
      {
        policy_key: 'IPBL',
        rule_name: '来源黑名单',
        rule_id: 'IPBL-11',
        action: 'reject',
        recipients: ['a@example.com'],
        effective_for: [],
        hit_values: { source_ip: '203.0.113.7' },
      },
    ],
  };

  it('groups formal modules by policy while preserving effective tri-state counts', () => {
    const groups = groupRecipientBasisByPolicy(basis);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      policyKey: 'CR',
      recipientCount: 2,
      effectiveCount: 1,
      effectiveKnown: true,
    });
    expect(groups[1]).toMatchObject({
      policyKey: 'IPBL',
      recipientCount: 1,
      effectiveCount: 0,
      effectiveKnown: true,
    });
  });

  it('does not label sideline feature processing without security ownership as hit-only', () => {
    const marking = JSON.parse(`{
      "policy_key":"MAIL-MARK",
      "rule_name":"接收标记",
      "rule_id":"MAIL-MARK-104",
      "action":"tag",
      "recipients":["a@example.com"]
    }`) as DisposalBasis;

    expect(recipientBasisState(marking, 'a@example.com')).toBe('unknown');
  });

  it('groups only effective rules for the origin-style recipient split cards', () => {
    const groups = groupEffectiveRecipientBasisByRule(basis);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      policyKey: 'CR',
      recipients: ['b@example.com'],
      entry: { rule_id: 'CR-66', action: 'quarantine' },
    });
  });

  it('keeps AUTH proceed in hit modules but out of disposition basis', () => {
    const proceedOnly = {
      modules: [
        {
          policy_key: 'AUTH',
          rule_name: 'sysrule:auth_spoofing_spf_none',
          rule_id: 'AUTH-22',
          action: 'proceed',
          recipients: ['qfliu@dm163.cacter.com'],
          effective_for: [],
        },
      ],
    };
    expect(resolveHitModules(proceedOnly)).toHaveLength(1);
    expect(groupEffectiveRecipientBasisByRule(proceedOnly)).toEqual([]);
    expect(groupsFromSummaries(proceedOnly, undefined)).toEqual([]);
    expect(getActionLabel('proceed', 'zh')).toBe('进行下一步');
  });

  it('filters hit-only and legacy AUTH proceed entries from persisted list summaries', () => {
    expect(
      groupsFromSummaries({ policy_key: 'AUTH', action: 'accept' }, [
        {
          policy_key: 'AUTH',
          recipient_count: 1,
          effective_count: 0,
          effective_known: false,
          entries: [
            {
              action: 'accept',
              recipient_count: 1,
              effective_count: 0,
              effective_known: false,
            },
          ],
        },
      ]),
    ).toEqual([]);
    expect(
      groupsFromSummaries(undefined, [
        {
          policy_key: 'IPBL',
          recipient_count: 1,
          effective_count: 0,
          effective_known: true,
          entries: [
            {
              action: 'reject',
              recipient_count: 1,
              effective_count: 0,
              effective_known: true,
            },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it('recomputes persisted group counts after removing proceed entries', () => {
    const groups = groupsFromSummaries(undefined, [
      {
        policy_key: 'AI-PHISH',
        recipient_count: 3,
        effective_count: 1,
        effective_known: true,
        entries: [
          {
            rule_name: 'phish_policy_decision',
            action: 'proceed',
            recipient_count: 2,
            effective_count: 0,
            effective_known: true,
          },
          {
            rule_name: 'agent_verdict',
            action: 'quarantine',
            recipient_count: 1,
            effective_count: 1,
            effective_known: true,
          },
        ],
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      recipientCount: 1,
      effectiveCount: 1,
      effectiveKnown: true,
    });
  });

  it('deduplicates final recipient counts across multiple rules in one policy', () => {
    const groups = groupDispositionBasisByPolicy({
      modules: [
        {
          policy_key: 'CR',
          rule_id: 'CR-1',
          action: 'quarantine',
          recipients: ['A@example.com'],
          effective_for: ['A@example.com'],
        },
        {
          policy_key: 'CR',
          rule_id: 'CR-2',
          action: 'quarantine',
          recipients: ['a@example.com'],
          effective_for: ['a@example.com'],
        },
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ recipientCount: 1, effectiveCount: 1 });
  });

  it('keeps a matching recipientless early-stage final root without promoting recipient hits', () => {
    const early = {
      policy_key: 'IPBL',
      rule_id: 'IPBL-11',
      action: 'reject',
      modules: [{ policy_key: 'IPBL', rule_id: 'IPBL-11', action: 'reject' }],
    };
    expect(groupEffectiveRecipientBasisByRule(early)).toHaveLength(1);

    early.modules[0] = {
      ...early.modules[0],
      recipients: ['a@example.com'],
    } as never;
    expect(groupEffectiveRecipientBasisByRule(early)).toEqual([]);
  });

  it('keeps legacy per-recipient winners without fabricating effective ownership', () => {
    const groups = groupEffectiveRecipientBasisByRule({
      policy_key: 'CR',
      per_recipient: [
        {
          policy_key: 'CR',
          rule_id: 'CR-1',
          action: 'quarantine',
          recipient: 'a@example.com',
        },
        {
          policy_key: 'ACF',
          rule_id: 'ACF-2',
          action: 'reject',
          recipient: 'b@example.com',
        },
      ],
    });
    expect(
      groups.map((group) => ({
        policyKey: group.policyKey,
        recipients: group.recipients,
      })),
    ).toEqual([
      { policyKey: 'CR', recipients: ['a@example.com'] },
      { policyKey: 'ACF', recipients: ['b@example.com'] },
    ]);
  });

  it('uses the lightweight list summaries without fabricating recipient addresses', () => {
    const groups = groupsFromSummaries(basis, [
      {
        policy_key: 'CR',
        recipient_count: 2,
        effective_count: 1,
        effective_known: true,
        entries: [
          {
            rule_name: '正文规则',
            rule_id: 'CR-66',
            action: 'quarantine',
            recipient_count: 2,
            effective_count: 1,
            effective_known: true,
          },
        ],
      },
      {
        policy_key: 'IPBL',
        recipient_count: 1,
        effective_count: 0,
        effective_known: true,
        entries: [
          {
            rule_name: '来源黑名单',
            rule_id: 'IPBL-11',
            action: 'reject',
            recipient_count: 1,
            effective_count: 0,
            effective_known: true,
          },
        ],
      },
    ]);
    expect(groups[0].entries[0].recipients).toBeUndefined();
    expect(groups[0].recipientCount).toBe(2);
  });

  it('prioritizes the active rule filter in both the cell label and tooltip order', () => {
    const groups = groupRecipientBasisByPolicy(basis);
    expect(pickPrimaryBasisGroup(groups, undefined, ['IPBL-11'])?.policyKey).toBe('IPBL');
    expect(sortBasisGroupsForTooltip(groups, undefined, ['IPBL-11'])[0].policyKey).toBe('IPBL');
    expect(formatMultiBasisListReason(groups, 'zh', undefined, ['IPBL-11'])).toContain(
      'IP黑白名单',
    );
  });

  it('prioritizes the matching entry when several rules share one policy group', () => {
    const samePolicyGroups = groupRecipientBasisByPolicy({
      policy_key: 'CR',
      modules: [
        {
          policy_key: 'CR',
          rule_id: 'CR-66',
          rule_name: '正文规则',
          action: 'quarantine',
        },
        {
          policy_key: 'CR',
          rule_id: 'CR-77',
          rule_name: '付款规则',
          action: 'audit',
        },
      ],
    });

    expect(formatMultiBasisListReason(samePolicyGroups, 'zh', undefined, ['CR-77'])).toContain(
      '付款规则',
    );
  });
});
