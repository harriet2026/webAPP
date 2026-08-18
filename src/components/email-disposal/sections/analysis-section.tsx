'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
// GT-12583：必须用 next-intl 的 locale-aware router——本项目 localePrefix 为
// 默认 always，next/navigation 的裸 push 会丢 /zh 前缀导致 404。
import { useRouter } from '@/i18n/navigation';
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, ChevronDown, Clock, ShieldAlert, ExternalLink, ArrowRight, User, RotateCcw, Loader2, Layers, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import type { MailLogAnalysis, MailLogDetail, CheckStatus, FinalVerdict, MailChildEvent } from '@/types/email-disposal-detail';
import { formatTimestamp } from '@/lib/format-time';
import { formatBytes, tidOf, deriveDirection } from '../lib/detail-helpers';
import {
  formatHitDetail,
  getModuleName,
  getActionLabel,
  getActionColor,
  groupEffectiveRecipientBasisByRule,
  getPolicyRoute,
  getPolicyMeta,
  getStageColor,
  isStage1Policy,
  resolveHitModules,
  type DisposalLang,
} from '../lib/disposal-basis-config';
import { beatsInCollapsedRow } from '../lib/recall-timeline';
import { useProductForm } from '@/contexts/product-form-context';

interface AnalysisSectionProps {
  detail: MailLogDetail;
  // Stage/check status is authored by GET /mail-logs/{id}/analysis. It is
  // optional only while the request is loading or has failed; this component
  // never recomputes recipient-specific security semantics in the browser.
  analysis?: MailLogAnalysis;
  analysisLoading?: boolean;
  analysisError?: boolean;
  onRetryAnalysis?: () => void;
  // Derived from capabilities.ai at the parent -- same convention as
  // overview-section.tsx's aiInterpretEnabled prop (DD-9). Gates the whole
  // AI-verdict detail AND, matching analysis-tab.tsx's pre-existing behavior,
  // hides stage 4 ("AI 智能分析") from the pipeline when off.
  aiEnabled?: boolean;
  // Mail child events (mail_child_events), threaded straight through from
  // detail-modal.tsx's eventsQ -- the same array OverviewSection consumes
  // for the recipient delivery-detail line. Powers the 事后处置时间线
  // subsection (v2 spec gap 2.5): real per-event rows, not mock data.
  events?: MailChildEvent[];
  // 「查看原始日志」的回调，由 detail-modal.tsx 注入，滚动至原始日志区段。
  // 有值时替代 notImplementedToast；无值时（如独立挂载 AnalysisSection 的测试）
  // 退回 toast，保持向后兼容。
  onViewRawLogs?: () => void;
}

const STATUS_ICON: Record<CheckStatus, React.ReactElement> = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  suspicious: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  threat: <XCircle className="h-4 w-4 text-red-500" />,
  processing: <Clock className="h-4 w-4 text-blue-500 animate-pulse" />,
  skipped: <MinusCircle className="h-4 w-4 text-gray-400" />,
};

// Larger variant for the stage-card centered icon (v2 spec: w-5 h-5).
const STATUS_ICON_LG: Record<CheckStatus, React.ReactElement> = {
  pass: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  suspicious: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  threat: <XCircle className="h-5 w-5 text-red-500" />,
  processing: <Clock className="h-5 w-5 text-blue-500 animate-pulse" />,
  skipped: <MinusCircle className="h-5 w-5 text-gray-400" />,
};

const STAGE_CARD_STYLE: Record<CheckStatus, string> = {
  pass: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20',
  suspicious: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20',
  threat: 'border-red-300 bg-red-50 ring-1 ring-red-400 dark:border-red-800 dark:bg-red-950/20',
  processing: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20',
  skipped: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50',
};

// 状态徽标（通过/威胁/…）配色。
const STAGE_BADGE_STYLE: Record<CheckStatus, string> = {
  pass: 'text-emerald-600 border-emerald-300',
  suspicious: 'text-amber-600 border-amber-300',
  threat: 'text-red-600 border-red-300',
  processing: 'text-blue-600 border-blue-300',
  skipped: 'text-gray-500 border-gray-300',
};

// 命中策略行 · 结果文案配色。
const CHECK_RESULT_COLOR: Record<CheckStatus, string> = {
  pass: 'text-emerald-600',
  suspicious: 'text-amber-600',
  threat: 'text-red-600',
  processing: 'text-blue-600',
  skipped: 'text-muted-foreground',
};

const VERDICT_ICON: Record<FinalVerdict, React.ReactElement> = {
  malicious: <XCircle className="h-5 w-5 text-red-500 shrink-0" />,
  suspicious: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />,
  safe: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />,
};

const VERDICT_CARD_STYLE: Record<FinalVerdict, string> = {
  malicious: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20',
  suspicious: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20',
  safe: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20',
};

const VERDICT_TEXT_STYLE: Record<FinalVerdict, string> = {
  malicious: 'text-red-600 dark:text-red-400',
  suspicious: 'text-amber-600 dark:text-amber-400',
  safe: 'text-emerald-600 dark:text-emerald-400',
};

// 检测流程连接线配色：命中阶段之前 emerald（已通过），命中阶段自身之后的
// 连接线 red（命中段），命中阶段之后其余连接线 gray（无威胁时全程 gray）。
function connectorLineClass(i: number, hitIndex: number): string {
  if (hitIndex === -1) return 'bg-gray-300 dark:bg-gray-600';
  if (i < hitIndex) return 'bg-emerald-400';
  if (i === hitIndex) return 'bg-red-400';
  return 'bg-gray-300 dark:bg-gray-600';
}
function connectorArrowClass(i: number, hitIndex: number): string {
  if (hitIndex === -1) return 'text-gray-300 dark:text-gray-600';
  if (i < hitIndex) return 'text-emerald-400';
  if (i === hitIndex) return 'text-red-400';
  return 'text-gray-300 dark:text-gray-600';
}

const ALL_STAGE_NUMBERS = [1, 2, 3, 4, 5];
const STAGE_KEY_TO_NUM: Record<string, number> = {
  connection: 1,
  identity: 2,
  content: 3,
  ai: 4,
  comprehensive: 5,
};

// 事后处置时间线的语义化圆点（bg 色 + 图标）。
//
// 判定依据是 event_source + event_result，**不是 event_type** —— workflow 族的
// event_type 恒为字面量 "workflow"（internal/storage/repo_delivery_events.go:15），
// 早期按 event_type 里是否含 recall/approve/release 取色的写法对真实数据一条都命中不了。
type EventDotInfo = {
  bg: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

// 失败/否定类结果优先（召回失败必须显示为失败，而不是被"召回"这一动作染成蓝色）。
const NEGATIVE_RESULTS = new Set(['failed', 'failure', 'rejected', 'discarded', 'deleted', 'bounced', 'expired']);
const POSITIVE_RESULTS = new Set(['released', 'approved', 'delivered', 'success', 'sent', 'timeout_released']);
const RECALL_SOURCES = new Set(['admin_api', 'threat_retro_agent', 'sideline_agent']);

function getEventDotInfo(ev: MailChildEvent): EventDotInfo {
  const src = ev.event_source ?? '';
  const r = ev.event_result?.toLowerCase() ?? '';
  if (NEGATIVE_RESULTS.has(r) || r.includes('fail') || r.includes('error')) return { bg: 'bg-red-500', Icon: XCircle };
  // 超时是「不知道结果」，不是失败：用告警色而不是红色，也不能落到下面的
  // RECALL_SOURCES 蓝色分支里被画成一次普通的召回动作。
  if (r === 'timeout') return { bg: 'bg-amber-500', Icon: AlertTriangle };
  if (RECALL_SOURCES.has(src)) return { bg: 'bg-blue-500', Icon: RotateCcw };
  if (POSITIVE_RESULTS.has(r)) return { bg: 'bg-emerald-500', Icon: CheckCircle2 };
  return { bg: 'bg-gray-500', Icon: User };
}

// 事后处置时间线的来源过滤：排除投递流程来源，其余一律视为处置动作。
//
// 这里刻意用黑名单而不是白名单。原型稿用的是白名单
// {admin_api, threat_retro_agent}，但后端从未把这两个值写进 event_source ——
// 真实取值只有 postfix、workflow.{quarantine,sideline,audit,bounce}
// （internal/models/delivery_events.go）以及 forwardworker / sideline_reinject
// （internal/api/ingest_dispositions.go）。白名单会让本时间线在生产环境恒为空，
// 只在 mock 数据下显得正常。黑名单则让后端真实的 workflow.* 处置事实
//（放行/审核/退信）继续可见，同时把投递流水挡在外面。
const DELIVERY_FLOW_SOURCES = new Set(['postfix', 'antispam']);

// ---- 「操作类型」/「执行结果」两栏的文案映射 ----
//
// 权威口径：design/implement/spec/2026-08-10-disposal-timeline-requirements.md 第六节
// （产品裁决：时间线 = 所有事后处置动作的流水；event_result 同时承载"做了什么"和
// "成功与否"两层语义，因此拆成两栏而不是合并成一句话）。
//
//   · 操作类型 ← event_source
//   · 执行结果 ← event_result（权威枚举见 internal/models/delivery_events.go:46-56）
//
// 旧版用 `event_source:event_type` 复合键，与后端真实产出零交集：workflow 族的
// event_type 是字面量常量 "workflow"（internal/storage/repo_delivery_events.go:15），
// 区分度全在 event_source + event_result 上。两张表未覆盖的取值一律 fallback 到
// 原始值，不留空白。

// event_source → i18n sub-key（emailDisposal.detail.analysis.operationType.*）
const OPERATION_TYPE_KEY_MAP: Record<string, string> = {
  'workflow.quarantine': 'quarantineDisposal',
  'workflow.sideline': 'sidelineDisposal',
  'workflow.audit': 'manualAudit',
  'workflow.bounce': 'bounce',
  sideline_reinject: 'reinject',
  forwardworker: 'forwardDelivery',
  // 召回事实由后端在管理员/智能体召回时额外写一条 kind='event'（spec 第六节 Q2），
  // event_result 按召回域词汇表 handling/success/failed 映射（internal/models/recall.go:12）。
  admin_api: 'adminRecall',
  threat_retro_agent: 'agentRecall',
  // sideline_agent 是后端 RecallInitiatorEventSource 的第三个发起方（旁路投递后召回，
  // internal/models/delivery_events.go）。产品裁决表只列了前两个，这条文案未经产品确认，
  // 补上是为了不让它以 `sideline_agent · recall` 的原始英文示人。
  sideline_agent: 'sidelineAgentRecall',
};

// event_result → i18n sub-key（emailDisposal.detail.analysis.eventResult.*）
const EVENT_RESULT_KEY_MAP: Record<string, string> = {
  released: 'released',
  discarded: 'discarded',
  deleted: 'deleted',
  approved: 'approved',
  rejected: 'rejected',
  bounced: 'bounced',
  delivered: 'delivered',
  failed: 'failed',
  success: 'success',
  // 召回发起事件的执行结果：已发起、尚无终态回调（internal/models/recall.go:12）。
  // 同样未经产品确认，见上面 sideline_agent 的注释。
  handling: 'handling',
  // 召回被 agent 展开成多条子请求（同一封信在多处命中）。终态之一，
  // 取值来源 internal/models 的 RecallTimelineEventResults。
  expanded: 'expanded',
  // 外发审核件超时自动放行（internal/api/outbound_audit.go:319 的
  // WorkflowOutcomeTimeoutReleased），经 RecordWorkflowReinject 落成
  // event_source='workflow.audit' 的 event_result。
  timeout_released: 'timeoutReleased',
  // 召回回调迟迟不来（对方服务挂了 / 网络断了 / 请求丢了）时由后端的召回超时
  // worker 补写，免得这一行永远停在「处置中」。刻意不与 failed 合并：failed 是
  // 对方明确拒绝，timeout 是我们不知道结果（internal/models/delivery_events.go
  // 的 EventResultRecallTimeout）。
  timeout: 'timeout',
};

// 同一个 event_result 在不同来源下业务含义不同：workflow.sideline 的 released 是
// 「旁路重投放行」，与隔离区的「已放行」不是一回事。按来源覆盖，其余落回上表。
const EVENT_RESULT_KEY_MAP_BY_SOURCE: Record<string, Record<string, string>> = {
  'workflow.sideline': { released: 'sidelineReleased' },
};

type TFn = (key: string) => string;

function getEventResultLabel(val: string | undefined, source: string | undefined, t: TFn): string {
  if (!val) return '—';
  const subKey = (source ? EVENT_RESULT_KEY_MAP_BY_SOURCE[source]?.[val] : undefined) ?? EVENT_RESULT_KEY_MAP[val];
  if (!subKey) return val;
  return t(`eventResult.${subKey}`);
}

function getOperationTypeLabel(source: string | undefined, type: string | undefined, t: TFn): string {
  const subKey = source ? OPERATION_TYPE_KEY_MAP[source] : undefined;
  if (subKey) return t(`operationType.${subKey}`);
  // fallback：未知来源展示原始值（带上 event_type 便于排查），不留空白。
  if (source && type) return `${source} · ${type}`;
  return source || type || '—';
}

// aiEnabled defaults to false (fail-closed): this is an entitlement gate for
// the AI verdict block (spec §5.4/§4.4 CapAI), so a future call site that
// forgets to pass it must not silently show AI-only content on the
// non-AI/传统版 tier -- the current call site (detail-modal.tsx) always
// passes an explicit value derived from capabilities.ai.
export function AnalysisSection({
  detail,
  analysis,
  analysisLoading = false,
  analysisError = false,
  onRetryAnalysis,
  aiEnabled = false,
  events = [],
  onViewRawLogs,
}: AnalysisSectionProps) {
  const t = useTranslations('emailDisposal.detail.analysis');
  const tFeatures = useTranslations('emailDisposal.detail.features');
  const { viewer, capabilities } = useProductForm();
  // Reuses §9-A's existing "暂未实现" copy (send-receive-context-card.tsx)
  // rather than adding a fourth duplicate translation of the same string.
  const tSenderActions = useTranslations('emailDisposal.detail.overview.senderActions');
  const rawLocale = useLocale();
  const router = useRouter();
  // Same locale mapping pattern as mail-list-table.tsx; the disposal-basis
  // dictionary only carries zh/en/th/ru, so unknown locales fall back to zh.
  const disposalLang: DisposalLang = (['zh', 'en', 'th', 'ru'] as const).includes(rawLocale as DisposalLang) ? (rawLocale as DisposalLang) : 'zh';

  // --- Step 1: 5-stage detection pipeline (ported from tabs/analysis-tab.tsx) ---
  const verdict = analysis?.final_verdict ?? 'safe';
  // GT-12575: 非 AI 形态滤掉 ai 阶段后重编号（综合显示为阶段4），与策略
  // 流水线的动态阶段号语义一致。
  const stages = useMemo(() => {
    const allStages = analysis?.stages ?? [];
    const base = aiEnabled ? allStages : allStages.filter((s) => s.key !== 'ai');
    return base.map((s, i) => ({ ...s, stage: i + 1 }));
  }, [analysis?.stages, aiEnabled]);
  // v2 spec gap 2.1: all 5 stage cards default EXPANDED (inline hit-strategy
  // detail rendered inside each card); clicking a card toggles its own
  // detail only. Initialize with every possible stage number -- harmless for
  // the stage(s) filtered out of `stages` when aiEnabled is false.
  const [expandedStages, setExpandedStages] = useState<number[]>(ALL_STAGE_NUMBERS);
  const toggleStage = (s: number) => setExpandedStages((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const hitIndex = stages.findIndex((s) => s.status === 'threat');

  // 总耗时（gap 2.3）：优先对各阶段 stage_timings 求和，为 0/缺失时落回
  // processing_time_ms。
  const totalElapsedMs = analysis?.total_elapsed_ms ?? 0;

  // --- 事后处置时间线（gap 2.5，两级展开）---
  // 默认展开：事后处置时间线是高频有效信息，优化前默认收起导致有事件也不可见。
  const [showTimeline, setShowTimeline] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const toggleEvent = (id: number) =>
    setExpandedEvents((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // 排除投递流程来源（postfix 投递状态、antispam 策略裁决），其余保留。
  const disposalEvents = useMemo(() => events.filter((ev) => !DELIVERY_FLOW_SOURCES.has(ev.event_source ?? '')), [events]);
  // 同一次业务动作只占一行：召回是异步的，后端会先写一条「处置中」的发起事件，
  // 终态回调到达后再写一条（事件溯源只追加，不改写历史，审计需要完整过程）。
  // 产品要求时间线上一次召回只显示一行——在途显示「处置中」，回调到达后同一行
  // 变成「成功 / 失败」。所以这里按后端下发的关联键 source_ref 分组、每组只留
  // 一条。source_ref 为空的事件（workflow 族等）各自独立，不参与合并。
  const collapsedEvents = useMemo(() => {
    const bestByRef = new Map<string, MailChildEvent>();
    const standalone: MailChildEvent[] = [];
    for (const ev of disposalEvents) {
      const ref = ev.source_ref ?? '';
      if (!ref) {
        standalone.push(ev);
        continue;
      }
      const prev = bestByRef.get(ref);
      if (!prev || beatsInCollapsedRow(ev, prev)) bestByRef.set(ref, ev);
    }
    return [...standalone, ...bestByRef.values()];
  }, [disposalEvents]);
  const sortedEvents = useMemo(() => [...collapsedEvents].sort((a, b) => (a.event_time || '').localeCompare(b.event_time || '')), [collapsedEvents]);

  // --- Step 2: content-layer expandable area (ported from tabs/features-tab.tsx) ---
  const [contentExpanded, setContentExpanded] = useState(false);
  const suspiciousUrls = new Set(detail.cac_result?.suspicious_urls ?? []);
  const scans = detail.scan_results ?? [];
  const direction = deriveDirection(detail.authenticated, detail.smtp_user);
  const ipLocation = [detail.geo_region_name, detail.geo_city].filter(Boolean).join(' / ') || '—';

  // GT-12936: the phishing-agent details live under the corresponding stage-4
  // check instead of a disconnected card at the bottom of the page.
  const [phishAgentDetailExpanded, setPhishAgentDetailExpanded] = useState(false);
  const phishAgent = detail.phish_agent_check;
  const hasPhishAgentData = !!phishAgent?.checked;
  const confidencePct = phishAgent?.confidence != null ? Math.round(phishAgent.confidence * 100) : null;
  const steps = phishAgent?.steps ?? [];
  const recommendedActions = phishAgent?.recommended_actions ?? [];

  // --- 处置依据（gap 2.7）---
  const basis = detail.disposal_basis;

  // GT-12727：命中模块清单。新行读 modules，老行回落 per_recipient（去重且
  // 不伪造 effective_for），口径统一收在 resolveHitModules 里。
  const hitModules = useMemo(() => resolveHitModules(basis), [basis]);
  const basisRuleGroups = useMemo(() => groupEffectiveRecipientBasisByRule(basis), [basis]);
  const isMultiBasis = basisRuleGroups.length > 1;
  const totalBasisRecipients = useMemo(() => {
    const recipients = new Set<string>();
    for (const group of basisRuleGroups) {
      for (const recipient of group.recipients) recipients.add(recipient.trim().toLowerCase());
    }
    return recipients.size;
  }, [basisRuleGroups]);
  // §7.10.1：租户可见性门必须**逐条**套用。若只看主基据，主基据是阶段 3
  // 内容规则时，清单里的阶段 1 平台策略
  // （IPBL/RBL/OVERSEAS）模块名与命中详情（含 source_ip）会照样暴露给租户
  // 管理员 —— 权限回退。
  const isTenantScoped = viewer === 'tenant' && capabilities?.multiTenant === true;
  const maskModule = (policyKey?: string) => isTenantScoped && isStage1Policy(policyKey);

  const renderDisposalBasisCard = (entry: NonNullable<MailLogDetail['disposal_basis']>, options?: { scope?: string[]; idSuffix?: string }) => {
    const masked = maskModule(entry.policy_key);
    const meta = entry.policy_key ? getPolicyMeta(entry.policy_key) : undefined;
    const route = entry.policy_key ? getPolicyRoute(entry.policy_key) : undefined;
    const hasRuleName = !!entry.rule_name && entry.rule_name !== '—';
    const ruleLabel = hasRuleName ? (entry.rule_id ? `${entry.rule_name}（${entry.rule_id}）` : entry.rule_name!) : entry.rule_id || '—';
    const suffix = options?.idSuffix ? `-${options.idSuffix}` : '';
    return (
      <div data-testid={`analysis-disposal-basis-card${suffix}`} className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="h-4 w-4 text-orange-600" />
          <h4 className="text-sm font-semibold">{tFeatures('disposalBasis')}</h4>
          {entry.action && (
            <span data-testid="analysis-disposal-basis-action" className={cn('text-xs font-medium px-2 py-0.5 rounded ml-auto', getActionColor(entry.action))}>
              {getActionLabel(entry.action, disposalLang)}
            </span>
          )}
        </div>
        {options?.scope && options.scope.length > 0 && (
          <div className="mb-3 flex items-start gap-3 text-sm" data-testid={`analysis-disposal-basis-scope${suffix}`}>
            <span className="w-[72px] shrink-0 text-muted-foreground">{tFeatures('basisScope')}</span>
            <span className="break-all text-muted-foreground">{t('recipientScopeLine', { recipients: options.scope.join('、'), count: options.scope.length })}</span>
          </div>
        )}
        <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2.5 text-sm">
          <span className="text-muted-foreground">{tFeatures('module')}</span>
          {masked ? (
            <span className="font-medium text-muted-foreground">{tFeatures('platformPolicyModule')}</span>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', getStageColor(meta?.stage ?? 0))} />
              <span className="font-medium">{entry.policy_key ? getModuleName(entry.policy_key, disposalLang) || '—' : '—'}</span>
            </div>
          )}
          <span className="text-muted-foreground">{tFeatures('ruleName')}</span>
          {masked ? (
            <span className="text-muted-foreground">{tFeatures('platformPolicyRuleName')}</span>
          ) : route && hasRuleName ? (
            <InteractiveSurface asChild variant="text" className="min-w-0 text-primary data-[hovered=true]:text-primary/80">
              <button
                type="button"
                data-testid="analysis-disposal-basis-rule-link"
                className="flex items-center gap-1.5 text-left"
                title={tFeatures('viewPolicyConfigTitle')}
                onClick={() => router.push(route)}
              >
                <span className="truncate">{ruleLabel}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity duration-[120ms] group-data-[hovered=true]/interactive:opacity-100 motion-reduce:transition-none" />
              </button>
            </InteractiveSurface>
          ) : (
            <span className="min-w-0 truncate">{ruleLabel}</span>
          )}
          <span className="text-muted-foreground">{tFeatures('hitDetail')}</span>
          <span className="whitespace-pre-line text-muted-foreground leading-relaxed">
            {masked ? tFeatures('platformPolicyHitDetail') : formatHitDetail(entry, disposalLang) || '—'}
          </span>
          {!masked && entry.detection_tags && entry.detection_tags.length > 0 && (
            <>
              <span className="text-muted-foreground">{tFeatures('detectionTags')}</span>
              <span className="flex flex-wrap gap-1">
                {entry.detection_tags.map((tag) => (
                  <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs">{tag}</span>
                ))}
              </span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* 检测流程：5 个阶段卡片，默认全部展开，命中策略明细内联在卡片内 */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h4 className="shrink-0 text-sm font-semibold">{t('detectionPipeline')}</h4>
          <span data-testid="analysis-total-elapsed" className="shrink-0 text-xs text-muted-foreground">
            {t('totalElapsed', { ms: totalElapsedMs })}
          </span>
        </div>
        {analysisLoading ? (
          <div data-testid="analysis-loading" className="flex min-h-32 items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('analysisLoading')}
          </div>
        ) : analysisError || !analysis ? (
          <div data-testid="analysis-error" className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span>{t('analysisLoadFailed')}</span>
            {onRetryAnalysis && (
              <Button type="button" variant="outline" size="sm" onClick={onRetryAnalysis}>
                {t('retry')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {isMultiBasis && totalBasisRecipients > 0 && (
              <div
                className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/20"
                data-testid="analysis-multi-basis-summary"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Users className="h-4 w-4 shrink-0 text-violet-600" />
                  {t('multiBasisSummaryLabel', { recipients: totalBasisRecipients, groups: basisRuleGroups.length })}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {basisRuleGroups.map((group, groupIndex) => group.entry.action && (
                    <span key={`${group.policyKey}-${group.entry.rule_id ?? groupIndex}`} className={cn('rounded px-2 py-0.5 text-xs font-medium', getActionColor(group.entry.action))}>
                      {getActionLabel(group.entry.action, disposalLang)}（{group.recipients.length}）
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-start gap-0 overflow-x-auto pb-2">
              {stages.map((st, i) => {
                const isExpanded = expandedStages.includes(st.stage);
                const maxCheckRecipientGroupCount = Math.max(0, ...st.checks.map((check) => check.recipientGroups?.length ?? 0));
                const stageBasisGroups = isMultiBasis
                  ? basisRuleGroups.filter((group) => getPolicyMeta(group.policyKey)?.stage === STAGE_KEY_TO_NUM[st.key])
                  : [];
                const recipientSplitCount = Math.max(maxCheckRecipientGroupCount, stageBasisGroups.length);
                const hasRecipientSplit = maxCheckRecipientGroupCount > 1 || stageBasisGroups.length > 0;
                return (
                  <div key={st.stage} className="flex items-start">
                    <InteractiveSurface
                      asChild
                      variant="card"
                      className={cn(
                        'relative rounded-lg border text-left',
                        st.key === 'ai' ? 'min-w-[300px] max-w-[360px]' : 'min-w-[180px] max-w-[200px]',
                        'data-[hovered=true]:shadow-md',
                        STAGE_CARD_STYLE[st.status],
                      )}
                    >
                      <div>
                        <button type="button" className="w-full p-3 text-left" data-testid={`analysis-stage-${st.stage}`} aria-expanded={isExpanded} onClick={() => toggleStage(st.stage)}>
                          {hasRecipientSplit && (
                            <span
                              data-testid={`analysis-stage-${st.stage}-recipient-split-badge`}
                              className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                            >
                              <Layers className="h-3 w-3" />
                              {t('recipientGroupsBadge', { n: recipientSplitCount })}
                            </span>
                          )}
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground mb-1">
                              {t('stage')} {st.stage}
                            </div>
                            {/* 阶段1 + 多租户租户视角：标题改为"平台管控" */}
                            <div className="font-medium text-sm mb-2">{isTenantScoped && st.key === 'connection' ? t('stageName.connectionPlatform') : t(`stageName.${st.key}`)}</div>
                            <div className="flex justify-center mb-2">{STATUS_ICON_LG[st.status]}</div>
                            <Badge variant="outline" className={cn('text-xs mb-1', STAGE_BADGE_STYLE[st.status])}>
                              {t(`status.${st.status}`)}
                            </Badge>
                            <div className="text-xs text-muted-foreground">{t('policyCount', { n: st.checks.length })}</div>
                            <div className="text-xs text-muted-foreground/70">{st.durationMs != null ? `${st.durationMs}ms` : '—'}</div>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="mx-3 border-t border-border/70 pb-3 pt-3 text-left" data-testid={`analysis-stage-${st.stage}-detail`}>
                            {isTenantScoped && st.key === 'connection' ? (
                              /* 阶段1 + 多租户租户视角：命中策略明细替换为说明文字 */
                              <p className="text-xs text-muted-foreground italic">{t('platformStageHint')}</p>
                            ) : (
                              <>
                                <div className="text-xs font-medium text-muted-foreground mb-2">{st.key === 'ai' ? t('agentJudgementLabel') : t('hitPolicyLabel')}</div>
                                <div className="space-y-1.5">
                                  {st.checks.map((check) => {
                                    const canExpandPhish = check.key === 'phishingAgent' && hasPhishAgentData;
                                    const recipientGroups = check.recipientGroups ?? [];
                                    const isSplit = recipientGroups.length > 1;
                                    const row = (
                                      <div className="flex items-center justify-between gap-2 text-xs">
                                        <div className="flex min-w-0 items-center gap-1">
                                          {STATUS_ICON[check.status]}
                                          <span className="truncate">{t(`check.${check.key}`)}</span>
                                        </div>
                                        <span className={cn('flex shrink-0 items-center gap-1 text-right', CHECK_RESULT_COLOR[check.status])}>
                                          {check.status === 'skipped' ? t('notIntegrated') : t(`status.${check.status}`)}
                                          {!isSplit && check.ruleIds.length > 0 && <span className="ml-1 text-muted-foreground">#{check.ruleIds.join(', #')}</span>}
                                          {canExpandPhish && confidencePct != null && (
                                            <span className="ml-1 text-muted-foreground">
                                              {t('aiVerdict.confidence', {
                                                pct: confidencePct,
                                              })}
                                            </span>
                                          )}
                                          {canExpandPhish && <ChevronDown className={cn('h-3 w-3 transition-transform', phishAgentDetailExpanded && 'rotate-180')} />}
                                        </span>
                                      </div>
                                    );
                                    return (
                                      <div key={check.key}>
                                        {canExpandPhish ? (
                                          <InteractiveSurface asChild variant="control" className="-mx-1 rounded px-1 py-1 data-[hovered=true]:bg-muted/40">
                                            <button
                                              type="button"
                                              className="w-full text-left"
                                              data-testid="analysis-ai-verdict-detail-toggle"
                                              aria-expanded={phishAgentDetailExpanded}
                                              onClick={() => setPhishAgentDetailExpanded((value) => !value)}
                                            >
                                              {row}
                                            </button>
                                          </InteractiveSurface>
                                        ) : (
                                          row
                                        )}
                                        {isSplit && (
                                          <div className="mt-1 space-y-1 rounded-md bg-background/60 p-1.5" data-testid={`analysis-check-${check.key}-recipient-groups`}>
                                            {recipientGroups.map((group, groupIndex) => (
                                              <div key={`${group.status}-${group.ruleIds.join('-')}-${groupIndex}`} className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
                                                <span className="min-w-0 break-all">
                                                  {t('recipientGroupLine', { recipients: group.recipients.join('、'), count: group.recipients.length })}
                                                </span>
                                                <span className={cn('shrink-0 text-right', CHECK_RESULT_COLOR[group.status])}>
                                                  {group.status === 'skipped' ? t('notIntegrated') : t(`status.${group.status}`)}
                                                  {group.ruleIds.length > 0 && <span className="ml-1 text-muted-foreground">#{group.ruleIds.join(', #')}</span>}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {canExpandPhish && phishAgentDetailExpanded && (
                                          <div data-testid="analysis-check-phishingAgent-detail" className="mt-2 space-y-3 rounded-md border bg-background/70 p-3">
                                            <KV label={t('aiVerdict.verdictLabel')} value={phishAgent!.verdict || '—'} />
                                            <KV label={t('aiVerdict.riskLevelLabel')} value={phishAgent!.risk_level || '—'} />
                                            {phishAgent!.summary && <div className="rounded border bg-card p-2.5 text-sm">{phishAgent!.summary}</div>}
                                            {phishAgent!.details && Object.keys(phishAgent!.details).length > 0 && (
                                              <div className="space-y-1">
                                                <p className="text-xs font-medium text-muted-foreground">{t('aiVerdict.detailsLabel')}</p>
                                                {Object.entries(phishAgent!.details).map(([key, value]) => (
                                                  <KV key={key} label={key} value={typeof value === 'string' ? value : JSON.stringify(value)} mono />
                                                ))}
                                              </div>
                                            )}
                                            <div className="space-y-1">
                                              <p className="text-xs font-medium text-muted-foreground">{t('aiVerdict.timelineLabel')}</p>
                                              {steps.length > 0 ? (
                                                <ol className="space-y-2 border-l-2 border-border pl-3">
                                                  {steps.map((step, stepIndex) => (
                                                    <li key={stepIndex} className="text-sm">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-medium">{step.name}</span>
                                                        <span className="text-xs text-muted-foreground">({step.status})</span>
                                                      </div>
                                                      {step.message && <p className="text-xs text-muted-foreground">{step.message}</p>}
                                                    </li>
                                                  ))}
                                                </ol>
                                              ) : (
                                                <p className="text-xs text-muted-foreground">{t('aiVerdict.noTimeline')}</p>
                                              )}
                                            </div>
                                            <div className="space-y-1">
                                              <p className="text-xs font-medium text-muted-foreground">{t('aiVerdict.recommendedActionsLabel')}</p>
                                              {recommendedActions.length > 0 ? (
                                                <ul className="space-y-1.5">
                                                  {recommendedActions.map((action, actionIndex) => (
                                                    <li key={actionIndex} className="rounded border bg-card p-2 text-sm">
                                                      <div className="flex items-center gap-1.5 font-medium">
                                                        <span>{action.type}</span>
                                                        {action.scope && (
                                                          <span className="text-xs text-muted-foreground">
                                                            ({action.scope}
                                                            {action.target_count != null ? ` × ${action.target_count}` : ''})
                                                          </span>
                                                        )}
                                                      </div>
                                                      {action.reason && <p className="text-xs text-muted-foreground">{action.reason}</p>}
                                                    </li>
                                                  ))}
                                                </ul>
                                              ) : (
                                                <p className="text-xs text-muted-foreground">{t('aiVerdict.noRecommendedActions')}</p>
                                              )}
                                            </div>
                                            {phishAgent!.error && <p className="text-xs text-destructive">{phishAgent!.error}</p>}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                {stageBasisGroups.length > 0 && (
                                  <div
                                    className="mt-2 space-y-1.5 rounded-md border border-violet-200 bg-violet-50/50 p-2 dark:border-violet-900 dark:bg-violet-950/20"
                                    data-testid={`analysis-stage-${st.stage}-basis-groups`}
                                  >
                                    {stageBasisGroups.map((group, groupIndex) => (
                                      <div key={`${group.policyKey}-${group.entry.rule_id ?? groupIndex}`} className="flex items-start justify-between gap-2 text-xs">
                                        <span className="min-w-0 break-all text-muted-foreground">
                                          {t('recipientGroupLine', { recipients: group.recipients.join('、'), count: group.recipients.length })}
                                          {group.entry.rule_name && group.entry.rule_name !== '—' && <span className="ml-1 text-foreground">「{group.entry.rule_name}」</span>}
                                        </span>
                                        {group.entry.action && (
                                          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', getActionColor(group.entry.action))}>
                                            {getActionLabel(group.entry.action, disposalLang)}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </InteractiveSurface>
                    {i < stages.length - 1 && (
                      <div className="flex items-center px-1 mt-12">
                        <div className={cn('w-4 h-0.5', connectorLineClass(i, hitIndex))} />
                        <ArrowRight className={cn('w-3 h-3 -ml-0.5', connectorArrowClass(i, hitIndex))} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 最终判定摘要（管线内尾部）：判定卡 + 耗时 + 「时间线」按钮 */}
            <div data-testid="analysis-verdict-card" className={cn('mt-4 p-3 rounded-lg border flex items-center justify-between', VERDICT_CARD_STYLE[verdict])}>
              <div className="flex items-center gap-2">
                {VERDICT_ICON[verdict]}
                <div>
                  <div className={cn('font-medium text-sm', VERDICT_TEXT_STYLE[verdict])}>
                    {t('finalVerdict')}：{t(`verdict.${verdict}`)}
                  </div>
                  <div className="text-xs text-muted-foreground">{t('elapsed', { ms: totalElapsedMs })}</div>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" data-testid="analysis-verdict-timeline-btn" onClick={() => setShowTimeline((v) => !v)}>
                {t('timeline')}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* GT-12578 / GT-12686：落地 spec
          design/implement/spec/2026-07-07-mail-disposal-investigation-center-design.md:168
          规定 disposal_basis 为 null 时回退 MailLog.Reason 自由文本；
          html-spec 对本卡片的规定也是「常显」。此前是硬门控整张卡片消失。 */}
      {!basis?.policy_key && detail.reason && (
        <div id="disposal-basis" data-testid="analysis-disposal-basis" className="rounded-lg border bg-card p-4 scroll-mt-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-orange-600" />
            <h4 className="text-sm font-semibold">{tFeatures('disposalBasis')}</h4>
          </div>
          <p className="break-all text-sm text-muted-foreground">{detail.reason}</p>
        </div>
      )}

      {/* origin GT-12946：单一依据保持一张卡；群发分叉时按最终生效的
          “模块 + 规则”组合渲染多张卡，并显示适用收件人。 */}
      {basis?.policy_key && (
        <div id="disposal-basis" data-testid={isMultiBasis ? 'analysis-disposal-basis-groups' : 'analysis-disposal-basis'} className="space-y-3 scroll-mt-4">
          {isMultiBasis
            ? basisRuleGroups.map((group, groupIndex) => renderDisposalBasisCard(group.entry, { scope: group.recipients, idSuffix: String(groupIndex) }))
            : renderDisposalBasisCard(basis)}
        </div>
      )}

      {/* GT-12727：本封邮件命中的模块清单。
          注意措辞纪律（spec §7.5）：这**不是**"全部命中模块"——因前序模块已产生
          决定性动作而从未被求值的规则不在其中，文案不得暗示这是穷尽列表。 */}
      {hitModules.length > 0 && (
        <div id="disposal-hit-modules" data-testid="analysis-hit-modules" className="rounded-lg border bg-card p-4 scroll-mt-4">
          <div className="mb-1 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">{tFeatures('hitModules')}</h4>
            <Badge variant="outline" className="text-xs">
              {hitModules.length}
            </Badge>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{tFeatures('hitModulesHint')}</p>
          <div className="space-y-2.5">
            {hitModules.map((m, i) => {
              const masked = maskModule(m.policy_key);
              const meta = m.policy_key ? getPolicyMeta(m.policy_key) : undefined;
              const ruleLabel = m.rule_name ? (m.rule_id ? `${m.rule_name}（${m.rule_id}）` : m.rule_name) : m.rule_id || '—';
              // §7.10.3：字段缺席/null = 无归属信息（连接/MAIL 阶段或老数据）→ 不打徽标；
              // [] = 确知未生效。两者不可混为一谈。用 Array.isArray 判定，
              // 后端把三态编码成「缺席 / [] / [...]」（*[]string + omitempty）。
              const effective = Array.isArray(m.effective_for) ? m.effective_for : undefined;
              const recips = m.recipients ?? [];
              const matchedOnly = effective ? recips.filter((r) => !effective.includes(r)) : [];
              return (
                <div key={`${m.policy_key ?? ''}-${m.rule_id ?? ''}-${m.action ?? ''}-${i}`} data-testid="analysis-hit-module-item" className="rounded border border-border/70 p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 阶段色点本身就泄露"这是阶段 1 平台策略"，masked 时不渲染
                        —— 与主基据块不展示色点的口径一致。 */}
                    {!masked && <span data-testid="analysis-hit-module-stage-dot" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', getStageColor(meta?.stage ?? 0))} />}
                    <span className="font-medium">{masked ? tFeatures('platformPolicyModule') : m.policy_key ? getModuleName(m.policy_key, disposalLang) || '—' : '—'}</span>
                    <span className="min-w-0 truncate text-muted-foreground">{masked ? tFeatures('platformPolicyRuleName') : ruleLabel}</span>
                    {m.action && <span className={cn('ml-auto rounded px-2 py-0.5 font-medium', getActionColor(m.action))}>{getActionLabel(m.action, disposalLang)}</span>}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line leading-relaxed text-muted-foreground">{masked ? tFeatures('platformPolicyHitDetail') : formatHitDetail(m, disposalLang) || '—'}</p>
                  {/* §7.10.2：逐收件人标注，不能用二元徽标——effective_for ⊊ recipients
                      （部分生效）时，只在全空才打"未生效"会让管理员把三个收件人
                      都理解成生效。 */}
                  {effective !== undefined && (effective.length > 0 || matchedOnly.length > 0) && (
                    <p className="mt-1 text-muted-foreground/90" data-testid="analysis-hit-module-attribution">
                      {effective.length > 0 && (
                        <span>
                          {tFeatures('effectiveFor', {
                            list: effective.join('、'),
                          })}
                        </span>
                      )}
                      {effective.length > 0 && matchedOnly.length > 0 && <span>　</span>}
                      {matchedOnly.length > 0 && (
                        <span>
                          {tFeatures('matchedOnlyFor', {
                            list: matchedOnly.join('、'),
                          })}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 事后处置时间线（gap 2.5，两级展开）*/}
      <div data-testid="analysis-post-detection-timeline">
        <InteractiveSurface asChild variant="control" className="mb-4 flex w-full items-center justify-between px-2 py-1 text-left data-[hovered=true]:bg-muted/50">
          <button type="button" data-testid="analysis-timeline-toggle" aria-expanded={showTimeline} onClick={() => setShowTimeline((v) => !v)}>
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {t('postDetectionTimeline')}
              <Badge variant="outline" className="text-xs">
                {t('eventCount', { n: sortedEvents.length })}
              </Badge>
            </h4>
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', !showTimeline && '-rotate-90')} />
          </button>
        </InteractiveSurface>
        {showTimeline &&
          (sortedEvents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground" data-testid="analysis-timeline-empty">
              {t('noEvents')}
            </p>
          ) : (
            <div className="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-4" data-testid="analysis-timeline-body">
              <div className="relative -ml-[25px]">
                <div className="absolute left-0 flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
                <div className="ml-6 text-xs text-muted-foreground">
                  {t('detectionComplete')} {formatTimestamp(detail.processed_at || detail.received_at) || detail.processed_at || detail.received_at}
                </div>
              </div>
              {sortedEvents.map((ev) => {
                const isOpen = expandedEvents.has(ev.id);
                // 优化三：语义化圆点 — 颜色和图标根据 event_type/event_result 派生。
                const { bg: dotBg, Icon: DotIcon } = getEventDotInfo(ev);
                return (
                  <div key={ev.id} className="relative -ml-[25px]">
                    <div className={cn('absolute left-0 flex h-4 w-4 items-center justify-center rounded-full', dotBg)}>
                      <DotIcon className="h-2.5 w-2.5 text-white" />
                    </div>
                    <InteractiveSurface asChild variant="row" className="ml-6 rounded-lg border bg-muted/30 p-3 data-[hovered=true]:border-foreground/20 data-[hovered=true]:bg-muted/50">
                      <div
                        role="button"
                        tabIndex={0}
                        data-testid={`analysis-timeline-event-${ev.id}`}
                        aria-expanded={isOpen}
                        onClick={() => toggleEvent(ev.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleEvent(ev.id);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 text-xs text-muted-foreground">{formatTimestamp(ev.event_time) || ev.event_time}</span>
                            {/* 一行摘要 = 操作类型（由 event_source 决定），与详情区
                                「操作类型」栏同一函数，口径一致。 */}
                            <span className="truncate text-sm font-medium">
                              {getOperationTypeLabel(ev.event_source, ev.event_type, t)}
                              {ev.recipient ? ` (${ev.recipient})` : ''}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {/* R3：行头 Badge 与详情「执行结果」栏必须同一函数 */}
                            <Badge variant="outline" className="text-xs">
                              {getEventResultLabel(ev.event_result || ev.correlation_status, ev.event_source, t)}
                            </Badge>
                            <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', !isOpen && '-rotate-90')} />
                          </div>
                        </div>
                        {isOpen && (
                          <div className="mt-3 space-y-2 border-t pt-3 text-sm" data-testid={`analysis-timeline-event-${ev.id}-detail`}>
                            <div className="flex items-start gap-2">
                              {/* 优化五：通用标签取代"召回范围" */}
                              <span className="w-20 shrink-0 text-muted-foreground">{t('recallScope')}:</span>
                              <span>{ev.recipient || ev.recipients || '—'}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="w-20 shrink-0 text-muted-foreground">{t('recallAction')}:</span>
                              <span>{getOperationTypeLabel(ev.event_source, ev.event_type, t)}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="w-20 shrink-0 text-muted-foreground">{t('executionResult')}:</span>
                              <span>
                                {getEventResultLabel(ev.event_result, ev.event_source, t)}
                                {ev.dsn ? `（${ev.dsn}）` : ''}
                              </span>
                            </div>
                            <div className="pt-1">
                              {/* 优化四：有 onViewRawLogs 时跳转原始日志区，否则退回 toast */}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                data-testid={`analysis-timeline-event-${ev.id}-view-log`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onViewRawLogs) {
                                    onViewRawLogs();
                                  } else {
                                    toast.info(tSenderActions('notImplementedToast'));
                                  }
                                }}
                              >
                                {t('viewRecallLog')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </InteractiveSurface>
                  </div>
                );
              })}
            </div>
          ))}
      </div>

      {/* Step 2: content-layer expandable area -- URL + attachment tables */}
      <div className="rounded-lg border overflow-hidden">
        <InteractiveSurface asChild variant="control" className="flex w-full items-center justify-between rounded-none p-3 data-[hovered=true]:bg-muted/50">
          <button type="button" aria-expanded={contentExpanded} onClick={() => setContentExpanded((v) => !v)}>
            <span className="font-medium">{t('contentDetails')}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', !contentExpanded && '-rotate-90')} />
          </button>
        </InteractiveSurface>
        {contentExpanded && (
          <div className="border-t p-4 space-y-4">
            <Section title={tFeatures('basicInfo')}>
              <KV label={tFeatures('tid')} value={tidOf(detail.message_uuid)} mono />
              <KV label={tFeatures('emailId')} value={detail.message_id || '—'} mono />
              {/* 完整关联键：用于在后端服务器日志中对应检索（GT-12651）。
                  message_uuid 贯穿组件 JSONL，session_id 是 milter 运行日志的
                  sid，queue_id 对应 Postfix mail.log。 */}
              <KV label={tFeatures('messageUuid')} value={detail.message_uuid || '—'} mono />
              <KV label={tFeatures('sessionId')} value={detail.session_id || '—'} mono />
              <KV label={tFeatures('queueId')} value={detail.queue_id || '—'} mono />
              <KV label={tFeatures('receiveTime')} value={detail.received_at} />
              <KV label={tFeatures('direction')} value={tFeatures(`directionValue.${direction}`)} />
              <KV label={tFeatures('emailSize')} value={formatBytes(detail.storage_size)} />
              <KV label={tFeatures('action')} value={detail.action} />
              <KV label={tFeatures('reason')} value={detail.reason || '—'} />
            </Section>

            <Section title={tFeatures('senderRecipientInfo')}>
              <KV label={tFeatures('envelopeFrom')} value={detail.sender} mono />
              <KV label={tFeatures('envelopeTo')} value={detail.recipients?.join(', ') || '—'} mono />
              <KV label={tFeatures('senderIp')} value={detail.client_ip || '—'} mono />
              <KV label={tFeatures('ipLocation')} value={ipLocation} />
              <KV label={tFeatures('senderDomain')} value={detail.sender_domain || '—'} />
            </Section>

            <Section title={tFeatures('urlDetection')}>
              {(detail.urls ?? []).length === 0 ? (
                <Empty text={tFeatures('noData')} />
              ) : (
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">{tFeatures('urlIndex')}</th>
                      <th className="px-2 py-1.5 text-left">{tFeatures('originalUrl')}</th>
                      <th className="px-2 py-1.5 text-left">{tFeatures('securityStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.urls ?? []).map((u, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-2 py-1.5">{i + 1}</td>
                        <td className="px-2 py-1.5 truncate max-w-lg">{u}</td>
                        <td className="px-2 py-1.5">
                          <span className={suspiciousUrls.has(u) ? 'rounded bg-red-100 px-2 py-0.5 text-red-700' : 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-700'}>
                            {suspiciousUrls.has(u) ? tFeatures('urlSuspicious') : tFeatures('urlSafe')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title={tFeatures('attachmentSecurity')}>
              {(detail.attachments ?? []).length === 0 ? (
                <Empty text={tFeatures('noData')} />
              ) : (
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">{tFeatures('attIndex')}</th>
                      <th className="px-2 py-1.5 text-left">{tFeatures('filename')}</th>
                      <th className="px-2 py-1.5 text-left">{tFeatures('contentType')}</th>
                      <th className="px-2 py-1.5 text-left">{tFeatures('size')}</th>
                      <th className="px-2 py-1.5 text-left">MD5</th>
                      <th className="px-2 py-1.5 text-left">{tFeatures('encrypted')}</th>
                      <th className="px-2 py-1.5 text-left">{tFeatures('containsQr')}</th>
                      <th className="px-2 py-1.5 text-left">{tFeatures('virusScan')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.attachments ?? []).map((a, i) => {
                      const scan = scans.find((s) => s.attachment_md5 && a.md5sum && s.attachment_md5 === a.md5sum);
                      const virus = !scan ? 'unknown' : scan?.virus_name ? 'detected' : scan?.antivirus_result === 'error' ? 'error' : 'clean';
                      return (
                        <tr key={i} className="border-b">
                          <td className="px-2 py-1.5">{i + 1}</td>
                          <td className="px-2 py-1.5 truncate max-w-[16rem]">{a.filename}</td>
                          <td className="px-2 py-1.5 truncate max-w-[14rem]">{a.content_type || '—'}</td>
                          <td className="px-2 py-1.5">{formatBytes(a.size)}</td>
                          <td className="px-2 py-1.5 font-mono">{a.md5sum || scan?.attachment_md5 || '—'}</td>
                          <td className="px-2 py-1.5">{scan ? (scan.is_encrypted ? tFeatures('yes') : tFeatures('no')) : '—'}</td>
                          <td className="px-2 py-1.5">{scan ? ((scan.qr_code_count ?? 0) > 0 ? tFeatures('yes') : tFeatures('no')) : '—'}</td>
                          <td className="px-2 py-1.5">
                            <span
                              className={
                                virus === 'unknown'
                                  ? 'text-muted-foreground'
                                  : virus === 'detected'
                                    ? 'rounded bg-red-100 px-2 py-0.5 text-red-700'
                                    : virus === 'error'
                                      ? 'rounded bg-gray-100 px-2 py-0.5 text-gray-700'
                                      : 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-700'
                              }
                            >
                              {virus === 'unknown' ? '—' : tFeatures(`virus.${virus}`)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        )}
      </div>
      </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{text}</p>;
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'font-medium'}>{value}</span>
    </div>
  );
}
