import { useMemo } from 'react';
import type {
  MailLogDetail, DetectionStage, DetectionCheckItem, CheckStatus, FinalVerdict,
} from '@/types/email-disposal-detail';
import {
  AGENT_PRESENTATIONS,
  AGENT_PRESENTATION_ORDER,
} from '@/lib/agent-center/presentation';

const AI_AGENT_CHECKS = AGENT_PRESENTATION_ORDER.map((moduleKey) => ({
  key: AGENT_PRESENTATIONS[moduleKey].pipelineKey,
  pages: AGENT_PRESENTATIONS[moduleKey].requiredPages.map((item) => item.page),
  moduleKey,
}));

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
    { key: 'urlProtection',      pages: ['link_attachment_security'] },
    { key: 'contentRules',       pages: ['content_rules'] },
    { key: 'intentEngine',       pages: ['intent_engine'] },
  ]},
  // GT-12575: 阶段4/5 顺序与安全策略流水线对齐（阶段4=智能分析、阶段5=综合，
  // 见 policyPipeline.stages 与 disposal-basis-config 的 stage 赋值）。非 AI
  // 形态过滤掉 ai 阶段后由消费方重编号（综合显示为阶段4），与策略页 F10 的
  // 「综合是阶段4还是阶段5取决于智能分析层是否展示」语义一致。
  // Keep the detail pipeline on the same three-agent catalog as Agent Center
  // and the security-policy pipeline. The former five-item prototype list
  // included agents that do not exist in the product and omitted spoofing.
  { stage: 4, key: 'ai', checks: AI_AGENT_CHECKS },
  { stage: 5, key: 'comprehensive', checks: [
    { key: 'similarityDetection', pages: ['similar_detection'] },
    { key: 'advancedRules',       pages: ['advanced_rules'] },
    { key: 'mailMarking',         pages: ['mail_marking'] },
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

function basisActionForPolicy(ml: MailLogDetail, policyKey: string): string | undefined {
  if (ml.disposal_basis?.policy_key === policyKey) return ml.disposal_basis.action;
  return ml.disposal_basis?.modules?.find((module) => module.policy_key === policyKey)?.action;
}

function aiCheckStatus(ml: MailLogDetail, key: string, pages: string[]): { status: CheckStatus; ruleIds: number[] } {
  const projected = checkStatus(ml, pages);
  if (projected.ruleIds.length > 0) return projected;

  const policyKey = key === 'phishingAgent' ? 'AI-PHISH'
    : key === 'spoofingAgent' ? 'AI-SPOOF'
      : key === 'threatRetroAgent' ? 'AI-TRACE' : '';
  const basisAction = policyKey ? basisActionForPolicy(ml, policyKey) : undefined;
  if (basisAction !== undefined) {
    return { status: basisAction === 'accept' ? 'pass' : 'threat', ruleIds: [] };
  }
  if (key === 'phishingAgent' && ml.phish_agent_check) {
    if (ml.phish_agent_check.status === 'pending' || ml.phish_agent_check.status === 'running') {
      return { status: 'processing', ruleIds: [] };
    }
    if (ml.phish_agent_check.checked) {
      const verdict = (ml.phish_agent_check.verdict ?? '').toLowerCase();
      const risk = (ml.phish_agent_check.risk_level ?? '').toLowerCase();
      return { status: verdict.includes('phish') || verdict === 'suspicious' || risk === 'high' ? 'threat' : 'pass', ruleIds: [] };
    }
  }
  return { status: 'skipped', ruleIds: [] };
}

function mailMarkingStatus(ml: MailLogDetail, pages: string[]): { status: CheckStatus; ruleIds: number[] } {
  const actionIds = rulesForPages(ml.matched_action_rule_pages, pages);
  const tagIds = rulesForPages(ml.matched_tag_rule_pages, pages);
  if (actionIds.length > 0) return { status: 'pass', ruleIds: actionIds };
  if (tagIds.length > 0) return { status: 'pass', ruleIds: tagIds };
  return { status: 'pass', ruleIds: [] };
}

function aggregate(checks: DetectionCheckItem[]): CheckStatus {
  if (checks.some((c) => c.status === 'threat')) return 'threat';
  if (checks.some((c) => c.status === 'suspicious')) return 'suspicious';
  if (checks.some((c) => c.status === 'processing')) return 'processing';
  if (checks.some((c) => c.status === 'pass')) return 'pass';
  return 'skipped';
}

export function buildDetectionStages(ml: MailLogDetail): DetectionStage[] {
  return STAGE_DEFS.map((def) => {
    const checks: DetectionCheckItem[] = def.checks.map((c) => {
      const { status, ruleIds } = def.key === 'ai'
        ? aiCheckStatus(ml, c.key, c.pages)
        : c.key === 'mailMarking' ? mailMarkingStatus(ml, c.pages) : checkStatus(ml, c.pages);
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
