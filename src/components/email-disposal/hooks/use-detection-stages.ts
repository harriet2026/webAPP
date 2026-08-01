import { useMemo } from 'react';
import type {
  MailLogDetail, DetectionStage, DetectionCheckItem, CheckStatus, FinalVerdict,
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

function checkStatus(ml: MailLogDetail, pages: string[]): { status: CheckStatus; ruleIds: number[] } {
  if (pages.length === 0) return { status: 'skipped', ruleIds: [] };
  // Persisted matched_*_rules are indexed by recipient, not page. The detail
  // API provides the page projections after resolving the matched rule IDs;
  // never fall back to scanning all recipient buckets or an unrelated match
  // would be mislabelled as this policy (GT-12194).
  const actionIds = rulesForPages(ml.matched_action_rule_pages, pages);
  const tagIds = rulesForPages(ml.matched_tag_rule_pages, pages);
  if (actionIds.length > 0) {
    // When the overall mail action is "accept", matched action rules are whitelist/accept
    // rules — do not flag them as threats.
    if (ml.action === 'accept') return { status: 'pass', ruleIds: actionIds };
    return { status: 'threat', ruleIds: actionIds };
  }
  if (tagIds.length > 0) return { status: 'suspicious', ruleIds: tagIds };
  return { status: 'pass', ruleIds: [] };
}

function aiCheckStatus(ml: MailLogDetail, key: string): { status: CheckStatus; ruleIds: number[] } {
  const tag = (ml.cac_result?.tag ?? '').toLowerCase();
  const intTag = ml.cac_result?.int_tag ?? 0;
  if (key === 'intentRecognitionAgent') {
    if (!ml.cac_result?.tag) return { status: 'skipped', ruleIds: [] };
    if (intTag >= 5) return { status: 'threat', ruleIds: [] };
    if (intTag >= 3) return { status: 'suspicious', ruleIds: [] };
    return { status: 'pass', ruleIds: [] };
  }
  if (key === 'phishingDetectionAgent') {
    if (!ml.cac_result?.tag) return { status: 'skipped', ruleIds: [] };
    return { status: tag.includes('phish') ? 'threat' : 'pass', ruleIds: [] };
  }
  return { status: 'skipped', ruleIds: [] };
}

function aggregate(checks: DetectionCheckItem[]): CheckStatus {
  if (checks.some((c) => c.status === 'threat')) return 'threat';
  if (checks.some((c) => c.status === 'suspicious')) return 'suspicious';
  if (checks.some((c) => c.status === 'pass')) return 'pass';
  return 'skipped';
}

export function buildDetectionStages(ml: MailLogDetail): DetectionStage[] {
  return STAGE_DEFS.map((def) => {
    const checks: DetectionCheckItem[] = def.checks.map((c) => {
      const { status, ruleIds } = def.key === 'ai'
        ? aiCheckStatus(ml, c.key)
        : checkStatus(ml, c.pages);
      return { key: c.key, status, ruleIds };
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
