import { useMemo } from 'react';
import type {
  MailLogDetail, DetectionStage, DetectionCheckItem, CheckStatus, FinalVerdict,
} from '@/types/email-disposal-detail';

interface StageCheckDef {
  key: string;
  pages: string[];
  // children -- 仅"附件安全检测"这一项非空，拆分为五个子引擎各自独立的
  // page key（GT-«阶段3附件安全检测子分组»）；父项不再直接判定，而是由
  // buildDetectionStages() 对 children 做 aggregate() 汇总。
  children?: StageCheckDef[];
}

const STAGE_DEFS: { stage: number; key: string; checks: StageCheckDef[] }[] = [
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
    { key: 'attachmentSecurity', pages: [], children: [
      { key: 'attachmentBasicLimit',   pages: ['attachment_basic_limit'] },
      { key: 'attachmentAntivirus',    pages: ['attachment_antivirus'] },
      { key: 'attachmentSandbox',      pages: ['attachment_sandbox'] },
      { key: 'attachmentImageDetect',  pages: ['attachment_image_detect'] },
      { key: 'attachmentEncrypted',    pages: ['attachment_encrypted'] },
    ]},
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

// attachmentSandboxStatus -- 附件沙箱检测专属判定：先看 sandbox_timeout
// （扫描超时未拿到结论，独立于 threat/suspicious/pass 的第三种终态），
// 其余情况沿用通用的 page 命中判定（checkStatus）。
function attachmentSandboxStatus(ml: MailLogDetail, pages: string[]): { status: CheckStatus; ruleIds: number[] } {
  if (ml.sandbox_timeout) return { status: 'timeout', ruleIds: [] };
  return checkStatus(ml, pages);
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

// aggregate -- threat > suspicious > timeout > pass > skipped。timeout（沙箱
// 扫描超时未拿到结论）语义上比"通过"更需要关注，但尚未坐实威胁/可疑，故
// 排在两者之间；用于父项"附件安全检测"汇总五个子引擎状态，以及既有的
// 阶段整体状态汇总。
function aggregate(checks: DetectionCheckItem[]): CheckStatus {
  if (checks.some((c) => c.status === 'threat')) return 'threat';
  if (checks.some((c) => c.status === 'suspicious')) return 'suspicious';
  if (checks.some((c) => c.status === 'timeout')) return 'timeout';
  if (checks.some((c) => c.status === 'pass')) return 'pass';
  return 'skipped';
}

// buildCheckItem -- 单个检测项判定，若定义了 children（目前仅"附件安全
// 检测"）则递归构建子项列表，父项状态由 aggregate(children) 得出而非
// 独立判定；否则走原有的单项判定逻辑（AI 阶段走 aiCheckStatus，附件沙箱
// 走 attachmentSandboxStatus，其余走通用 checkStatus）。
function buildCheckItem(ml: MailLogDetail, stageKey: string, def: StageCheckDef): DetectionCheckItem {
  if (def.children) {
    const children = def.children.map((child) => buildCheckItem(ml, stageKey, child));
    return { key: def.key, status: aggregate(children), ruleIds: [], children };
  }
  const { status, ruleIds } = stageKey === 'ai'
    ? aiCheckStatus(ml, def.key)
    : def.key === 'attachmentSandbox'
      ? attachmentSandboxStatus(ml, def.pages)
      : checkStatus(ml, def.pages);
  return { key: def.key, status, ruleIds };
}

export function buildDetectionStages(ml: MailLogDetail): DetectionStage[] {
  return STAGE_DEFS.map((def) => {
    const checks: DetectionCheckItem[] = def.checks.map((c) => buildCheckItem(ml, def.key, c));
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
