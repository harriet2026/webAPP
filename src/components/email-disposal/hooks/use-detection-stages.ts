import { useMemo } from 'react';
import type {
  MailLogDetail, DetectionStage, DetectionCheckItem, CheckStatus, FinalVerdict,
  RecipientRuleGroup, MatchedRulesByStage,
} from '@/types/email-disposal-detail';

const STAGE_DEFS: { stage: number; key: string; checks: { key: string; pages: string[] }[] }[] = [
  { stage: 1, key: 'connection', checks: [
    { key: 'ipRateLimit',       pages: ['ip_frequency'] },
    { key: 'ipFilter',          pages: ['ip_filter'] },
    { key: 'rblFilter',         pages: ['rbl_filter'] },
    { key: 'overseasDetection', pages: ['overseas_mail'] },
  ]},
  { stage: 2, key: 'identity', checks: [
    { key: 'senderList',      pages: ['sender_filter'] },
    { key: 'authSpoofing',    pages: ['auth_spoofing'] },
    { key: 'behaviorControl', pages: ['behavior_control'] },
    { key: 'recipientCheck',  pages: ['recipient_check'] },
    { key: 'personalList',    pages: ['user_list'] },
  ]},
  { stage: 3, key: 'content', checks: [
    { key: 'attachmentSecurity', pages: ['attachment_security'] },
    { key: 'urlProtection',      pages: ['url_protection'] },
    { key: 'contentRules',       pages: ['content_rules'] },
  ]},
  // GT-12575: 阶段4/5 顺序与安全策略流水线对齐（阶段4=智能分析、阶段5=综合，
  // 见 policyPipeline.stages 与 disposal-basis-config 的 stage 赋值）。非 AI
  // 形态过滤掉 ai 阶段后由消费方重编号（综合显示为阶段4），与策略页 F10 的
  // 「综合是阶段4还是阶段5取决于智能分析层是否展示」语义一致。
  { stage: 4, key: 'ai', checks: [
    { key: 'senderBehaviorAgent',     pages: [] },
    { key: 'intentRecognitionAgent',  pages: [] },
    { key: 'marketingEmailAgent',     pages: [] },
    { key: 'phishingDetectionAgent',  pages: [] },
    { key: 'retrospectiveAgent',      pages: [] },
  ]},
  { stage: 5, key: 'comprehensive', checks: [
    { key: 'intentEngine',        pages: ['intent_engine'] },
    { key: 'similarityDetection', pages: ['similar_detection'] },
    { key: 'advancedRules',       pages: ['advanced_rules'] },
  ]},
];

function rulesForPages(
  buckets: Record<string, Record<string, number[]>> | undefined,
  pages: string[],
): number[] {
  if (!buckets) return [];
  const ids: number[] = [];
  for (const stage of Object.keys(buckets)) {
    for (const page of pages) {
      const arr = buckets[stage]?.[page];
      if (arr) ids.push(...arr);
    }
  }
  return ids;
}

// 群发邮件多依据支撑：某个 check 命中的规则集合（ruleIds，已按 page 过滤）
// 在不同收件人之间可能不一致。matched_action_rules/matched_tag_rules 是
// stage → recipient → ruleId[] 的持久化原始索引（与 page 投影是同一份底层
// 数据的两种索引方式），交叉引用即可推导"谁命中了这个 check 里的哪些规
// 则"——ruleId 全局唯一，不会因为交叉引用而误标到不相关的收件人。
// 按"命中规则集合完全相同"对收件人分组；只有一组时代表该 check 内所有收
// 件人结果一致，与非群发场景等价。
function recipientGroupsForRuleIds(
  buckets: MatchedRulesByStage | undefined,
  ruleIds: number[],
): RecipientRuleGroup[] {
  if (!buckets || ruleIds.length === 0) return [];
  const ruleIdSet = new Set(ruleIds);
  const recipientToRules = new Map<string, Set<number>>();
  for (const stageKey of Object.keys(buckets)) {
    const recipientMap = buckets[stageKey] ?? {};
    for (const recipient of Object.keys(recipientMap)) {
      const hits = (recipientMap[recipient] ?? []).filter((id) => ruleIdSet.has(id));
      if (hits.length === 0) continue;
      const existing = recipientToRules.get(recipient);
      if (existing) {
        for (const id of hits) existing.add(id);
      } else {
        recipientToRules.set(recipient, new Set(hits));
      }
    }
  }
  const groupsByKey = new Map<string, RecipientRuleGroup>();
  for (const [recipient, rules] of recipientToRules) {
    const sortedIds = [...rules].sort((a, b) => a - b);
    const key = sortedIds.join(',');
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.recipients.push(recipient);
    } else {
      groupsByKey.set(key, { recipients: [recipient], ruleIds: sortedIds });
    }
  }
  return [...groupsByKey.values()];
}

function checkStatus(
  ml: MailLogDetail,
  pages: string[],
): { status: CheckStatus; ruleIds: number[]; recipientGroups: RecipientRuleGroup[] } {
  if (pages.length === 0) return { status: 'skipped', ruleIds: [], recipientGroups: [] };
  // Persisted matched_*_rules are indexed by recipient, not page. The detail
  // API provides the page projections after resolving the matched rule IDs;
  // never fall back to scanning all recipient buckets or an unrelated match
  // would be mislabelled as this policy (GT-12194).
  const actionIds = rulesForPages(ml.matched_action_rule_pages, pages);
  const tagIds = rulesForPages(ml.matched_tag_rule_pages, pages);
  if (actionIds.length > 0) {
    const recipientGroups = recipientGroupsForRuleIds(ml.matched_action_rules, actionIds);
    // When the overall mail action is "accept", matched action rules are whitelist/accept
    // rules — do not flag them as threats.
    if (ml.action === 'accept') return { status: 'pass', ruleIds: actionIds, recipientGroups };
    return { status: 'threat', ruleIds: actionIds, recipientGroups };
  }
  if (tagIds.length > 0) {
    return {
      status: 'suspicious',
      ruleIds: tagIds,
      recipientGroups: recipientGroupsForRuleIds(ml.matched_tag_rules, tagIds),
    };
  }
  return { status: 'pass', ruleIds: [], recipientGroups: [] };
}

function aiCheckStatus(
  ml: MailLogDetail,
  key: string,
): { status: CheckStatus; ruleIds: number[]; recipientGroups: RecipientRuleGroup[] } {
  const tag = (ml.cac_result?.tag ?? '').toLowerCase();
  const intTag = ml.cac_result?.int_tag ?? 0;
  // AI 阶段没有 ruleIds（研判结论不是规则命中），天然没有分组归因。
  if (key === 'intentRecognitionAgent') {
    if (!ml.cac_result?.tag) return { status: 'skipped', ruleIds: [], recipientGroups: [] };
    if (intTag >= 5) return { status: 'threat', ruleIds: [], recipientGroups: [] };
    if (intTag >= 3) return { status: 'suspicious', ruleIds: [], recipientGroups: [] };
    return { status: 'pass', ruleIds: [], recipientGroups: [] };
  }
  if (key === 'phishingDetectionAgent') {
    if (!ml.cac_result?.tag) return { status: 'skipped', ruleIds: [], recipientGroups: [] };
    return { status: tag.includes('phish') ? 'threat' : 'pass', ruleIds: [], recipientGroups: [] };
  }
  return { status: 'skipped', ruleIds: [], recipientGroups: [] };
}

// 导出给 analysis-section.tsx 的"按收件人切换"视图复用——收件人被选中
// 且某个 check 内部按人分叉（recipientGroups.length > 1）时，需要用该收件
// 人专属的 checks 重新聚合出这个阶段对这个人而言的整体状态，不能直接沿用
// 全员合并视图算出的阶段状态。
export function aggregate(checks: DetectionCheckItem[]): CheckStatus {
  if (checks.some((c) => c.status === 'threat')) return 'threat';
  if (checks.some((c) => c.status === 'suspicious')) return 'suspicious';
  if (checks.some((c) => c.status === 'pass')) return 'pass';
  return 'skipped';
}

export function buildDetectionStages(ml: MailLogDetail): DetectionStage[] {
  return STAGE_DEFS.map((def) => {
    const checks: DetectionCheckItem[] = def.checks.map((c) => {
      const { status, ruleIds, recipientGroups } = def.key === 'ai'
        ? aiCheckStatus(ml, c.key)
        : checkStatus(ml, c.pages);
      return { key: c.key, status, ruleIds, recipientGroups };
    });
    if (def.key === 'identity') {
      const auth = checks.find((c) => c.key === 'authSpoofing');
      if (auth && auth.status === 'pass') {
        const bad = [ml.spf_valid, ml.dkim_valid, ml.dmarc_valid]
          .some((v) => v === 'fail' || v === 'softfail');
        if (bad) auth.status = 'suspicious';
      }
    }
    return {
      stage: def.stage,
      key: def.key,
      status: aggregate(checks),
      durationMs: ml.stage_timings?.[def.key],
      checks,
    };
  });
}

export function deriveFinalVerdict(stages: DetectionStage[]): FinalVerdict {
  if (stages.some((s) => s.status === 'threat')) return 'malicious';
  if (stages.some((s) => s.status === 'suspicious')) return 'suspicious';
  return 'safe';
}

export function useDetectionStages(ml: MailLogDetail | null): {
  stages: DetectionStage[];
  verdict: FinalVerdict;
} {
  return useMemo(() => {
    if (!ml) return { stages: [], verdict: 'safe' as FinalVerdict };
    const stages = buildDetectionStages(ml);
    return { stages, verdict: deriveFinalVerdict(stages) };
  }, [ml]);
}
