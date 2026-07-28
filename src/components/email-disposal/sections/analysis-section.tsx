'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
// GT-12583：必须用 next-intl 的 locale-aware router——本项目 localePrefix 为
// 默认 always，next/navigation 的裸 push 会丢 /zh 前缀导致 404。
import { useRouter } from '@/i18n/navigation';
import {
  CheckCircle2, AlertTriangle, XCircle, MinusCircle, ChevronDown,
  Clock, ShieldQuestion, ShieldAlert, ExternalLink, ArrowRight, User,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import type { MailLogDetail, CheckStatus, FinalVerdict, MailChildEvent } from '@/types/email-disposal-detail';
import { formatTimestamp } from '@/lib/format-time';
import { useDetectionStages } from '../hooks/use-detection-stages';
import {
  deriveThreatLevel, derivePhishAgentThreatLevel, THREAT_STYLES, formatBytes, tidOf, deriveDirection,
} from '../lib/detail-helpers';
import {
  formatHitDetail, getModuleName, getActionLabel, getActionColor, getPolicyRoute, getPolicyMeta,
  getStageColor, type DisposalLang,
} from '../lib/disposal-basis-config';

interface AnalysisSectionProps {
  detail: MailLogDetail;
  // Derived from capabilities.ai at the parent -- same convention as
  // overview-section.tsx's aiInterpretEnabled prop (DD-9). Gates the whole
  // AI-verdict block (Step 3) AND, matching analysis-tab.tsx's pre-existing
  // behavior, hides stage 5 ("AI 智能分析") from the pipeline when off.
  aiEnabled?: boolean;
  // Mail child events (mail_child_events), threaded straight through from
  // detail-modal.tsx's eventsQ -- the same array OverviewSection consumes
  // for the recipient delivery-detail line. Powers the 事后处置时间线
  // subsection (v2 spec gap 2.5): real per-event rows, not mock data.
  events?: MailChildEvent[];
}

const STATUS_ICON: Record<CheckStatus, React.ReactElement> = {
  pass:       <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  suspicious: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  threat:     <XCircle className="h-4 w-4 text-red-500" />,
  processing: <Clock className="h-4 w-4 text-blue-500 animate-pulse" />,
  skipped:    <MinusCircle className="h-4 w-4 text-gray-400" />,
};

// Larger variant for the stage-card centered icon (v2 spec: w-5 h-5).
const STATUS_ICON_LG: Record<CheckStatus, React.ReactElement> = {
  pass:       <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  suspicious: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  threat:     <XCircle className="h-5 w-5 text-red-500" />,
  processing: <Clock className="h-5 w-5 text-blue-500 animate-pulse" />,
  skipped:    <MinusCircle className="h-5 w-5 text-gray-400" />,
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

// aiEnabled defaults to false (fail-closed): this is an entitlement gate for
// the AI verdict block (spec §5.4/§4.4 CapAI), so a future call site that
// forgets to pass it must not silently show AI-only content on the
// non-AI/传统版 tier -- the current call site (detail-modal.tsx) always
// passes an explicit value derived from capabilities.ai.
export function AnalysisSection({ detail, aiEnabled = false, events = [] }: AnalysisSectionProps) {
  const t = useTranslations('emailDisposal.detail.analysis');
  const tFeatures = useTranslations('emailDisposal.detail.features');
  // Reuses §9-A's existing "暂未实现" copy (send-receive-context-card.tsx)
  // rather than adding a fourth duplicate translation of the same string.
  const tSenderActions = useTranslations('emailDisposal.detail.overview.senderActions');
  const rawLocale = useLocale();
  const router = useRouter();
  // Same locale mapping pattern as mail-list-table.tsx; the disposal-basis
  // dictionary only carries zh/en/th/ru, so unknown locales fall back to zh.
  const disposalLang: DisposalLang = (['zh', 'en', 'th', 'ru'] as const).includes(rawLocale as DisposalLang)
    ? (rawLocale as DisposalLang)
    : 'zh';

  // --- Step 1: 5-stage detection pipeline (ported from tabs/analysis-tab.tsx) ---
  const { stages: allStages, verdict } = useDetectionStages(detail);
  const stages = useMemo(
    () => (aiEnabled ? allStages : allStages.filter((s) => s.key !== 'ai')),
    [allStages, aiEnabled],
  );
  // v2 spec gap 2.1: all 5 stage cards default EXPANDED (inline hit-strategy
  // detail rendered inside each card); clicking a card toggles its own
  // detail only. Initialize with every possible stage number -- harmless for
  // the stage(s) filtered out of `stages` when aiEnabled is false.
  const [expandedStages, setExpandedStages] = useState<number[]>(ALL_STAGE_NUMBERS);
  const toggleStage = (s: number) =>
    setExpandedStages((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const hitIndex = stages.findIndex((s) => s.status === 'threat');

  // 总耗时（gap 2.3）：优先对各阶段 stage_timings 求和，为 0/缺失时落回
  // processing_time_ms。
  const totalElapsedMs = useMemo(() => {
    const stageSum = Object.values(detail.stage_timings ?? {}).reduce((a, b) => a + (b || 0), 0);
    return stageSum > 0 ? stageSum : (detail.processing_time_ms ?? 0);
  }, [detail.stage_timings, detail.processing_time_ms]);

  // --- 事后处置时间线（gap 2.5，两级展开）---
  const [showTimeline, setShowTimeline] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const toggleEvent = (id: number) =>
    setExpandedEvents((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  // 「事后处置时间线」是事后**处置动作**日志（召回/放行/丢弃等管理员操作），
  // 不是常规 SMTP 投递 DSN 事件流水 -- 后者（event_source === 'postfix'，见
  // internal/api/postfix_events.go）在这里展示会造成语义混淆（review finding）。
  // 后端真实写入的 event_source 只有 5 个常量（internal/models/delivery_events.go）：
  // 'postfix'（Postfix 投递状态回传，routine）与 4 个 'workflow.*'（quarantine/
  // sideline/audit/bounce -- 均由 RecordWorkflowReinject 在管理员 release/approve
  // 时写入，即处置动作）。用黑名单排除 'postfix' 而非枚举白名单 'workflow.*'，
  // 这样任何非 postfix 来源（含未来新增的 workflow.* 变体、以及本组件测试夹具
  // 里的 'admin_api'）都天然落入"处置相关"一侧，不需要跟着后端新增来源同步改这里。
  const disposalEvents = useMemo(
    () => events.filter((ev) => ev.event_source !== 'postfix'),
    [events],
  );
  const sortedEvents = useMemo(
    () => [...disposalEvents].sort((a, b) => (a.event_time || '').localeCompare(b.event_time || '')),
    [disposalEvents],
  );

  // --- Step 2: content-layer expandable area (ported from tabs/features-tab.tsx) ---
  const [contentExpanded, setContentExpanded] = useState(false);
  const suspiciousUrls = new Set(detail.cac_result?.suspicious_urls ?? []);
  const scans = detail.scan_results ?? [];
  const direction = deriveDirection(detail.authenticated, detail.smtp_user);
  const ipLocation = [detail.geo_region_name, detail.geo_city].filter(Boolean).join(' / ') || '—';

  // --- Step 3: AI-gated verdict block (genuinely new) ---
  const [aiDetailExpanded, setAiDetailExpanded] = useState(false);
  const phishAgent = detail.phish_agent_check;
  const hasPhishAgentData = !!phishAgent?.checked;
  // Prefer the phish agent's OWN risk_level for the headline threat badge
  // when real AI-verdict data is available -- falling back to the
  // cac_result-derived threat only when there's no agent verdict to show
  // (review finding: this badge used to always read cac_result, which could
  // silently disagree with what the AI agent itself concluded).
  const threat = (hasPhishAgentData && derivePhishAgentThreatLevel(phishAgent?.risk_level))
    || deriveThreatLevel(detail.cac_result);
  const ts = THREAT_STYLES[threat];
  const confidencePct = phishAgent?.confidence != null ? Math.round(phishAgent.confidence * 100) : null;
  const steps = phishAgent?.steps ?? [];
  const recommendedActions = phishAgent?.recommended_actions ?? [];

  // --- 处置依据（gap 2.7）---
  const basis = detail.disposal_basis;
  const policyMeta = basis?.policy_key ? getPolicyMeta(basis.policy_key) : undefined;
  const basisRoute = basis?.policy_key ? getPolicyRoute(basis.policy_key) : undefined;
  const hasRuleName = !!basis?.rule_name && basis.rule_name !== '—';
  const combinedRuleLabel = hasRuleName
    ? (basis?.rule_id ? `${basis.rule_name}（${basis.rule_id}）` : basis!.rule_name)
    : (basis?.rule_id || '—');

  return (
    <div className="space-y-5">
      {/* 检测流程：5 个阶段卡片，默认全部展开，命中策略明细内联在卡片内 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold">{t('detectionPipeline')}</h4>
          <span data-testid="analysis-total-elapsed" className="text-xs text-muted-foreground">
            {t('totalElapsed', { ms: totalElapsedMs })}
          </span>
        </div>
        <div className="flex items-start gap-0 overflow-x-auto pb-2">
          {stages.map((st, i) => {
            const isExpanded = expandedStages.includes(st.stage);
            return (
              <div key={st.stage} className="flex items-start">
                <InteractiveSurface
                  asChild
                  variant="card"
                  className={cn(
                    'relative min-w-[180px] max-w-[200px] rounded-lg border p-3 text-left',
                    'data-[hovered=true]:shadow-md',
                    STAGE_CARD_STYLE[st.status],
                  )}
                >
                  <button
                    type="button"
                    data-testid={`analysis-stage-${st.stage}`}
                    aria-expanded={isExpanded}
                    onClick={() => toggleStage(st.stage)}
                  >
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-1">{t('stage')} {st.stage}</div>
                      <div className="font-medium text-sm mb-2">{t(`stageName.${st.key}`)}</div>
                      <div className="flex justify-center mb-2">{STATUS_ICON_LG[st.status]}</div>
                      <Badge variant="outline" className={cn('text-xs mb-1', STAGE_BADGE_STYLE[st.status])}>
                        {t(`status.${st.status}`)}
                      </Badge>
                      <div className="text-xs text-muted-foreground">{t('policyCount', { n: st.checks.length })}</div>
                      <div className="text-xs text-muted-foreground/70">
                        {st.durationMs != null ? `${st.durationMs}ms` : '—'}
                      </div>
                    </div>
                    {isExpanded && (
                      <div
                        className="mt-3 pt-3 border-t border-border/70 text-left"
                        data-testid={`analysis-stage-${st.stage}-detail`}
                      >
                        <div className="text-xs font-medium text-muted-foreground mb-2">
                          {st.stage === 5 ? t('agentJudgementLabel') : t('hitPolicyLabel')}
                        </div>
                        <div className="space-y-1.5">
                          {st.checks.map((c) => (
                            <div key={c.key} className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1 min-w-0">
                                {STATUS_ICON[c.status]}
                                <span className="truncate">{t(`check.${c.key}`)}</span>
                              </div>
                              <span className={cn('shrink-0 text-right', CHECK_RESULT_COLOR[c.status])}>
                                {c.status === 'skipped' ? t('notIntegrated') : t(`status.${c.status}`)}
                                {c.ruleIds.length > 0 && (
                                  <span className="ml-1 text-muted-foreground">#{c.ruleIds.join(', #')}</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
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
        <div
          data-testid="analysis-verdict-card"
          className={cn('mt-4 p-3 rounded-lg border flex items-center justify-between', VERDICT_CARD_STYLE[verdict])}
        >
          <div className="flex items-center gap-2">
            {VERDICT_ICON[verdict]}
            <div>
              <div className={cn('font-medium text-sm', VERDICT_TEXT_STYLE[verdict])}>
                {t('finalVerdict')}：{t(`verdict.${verdict}`)}
              </div>
              <div className="text-xs text-muted-foreground">{t('elapsed', { ms: totalElapsedMs })}</div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            data-testid="analysis-verdict-timeline-btn"
            onClick={() => setShowTimeline((v) => !v)}
          >
            {t('timeline')}
          </Button>
        </div>
      </div>

      {/* 处置依据（gap 2.7） */}
      {basis?.policy_key && (
        <div
          id="disposal-basis"
          data-testid="analysis-disposal-basis"
          className="rounded-lg border bg-card p-4 scroll-mt-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-orange-600" />
            <h4 className="text-sm font-semibold">{tFeatures('disposalBasis')}</h4>
            {basis.action && (
              <span
                data-testid="analysis-disposal-basis-action"
                className={cn('text-xs font-medium px-2 py-0.5 rounded ml-auto', getActionColor(basis.action))}
              >
                {getActionLabel(basis.action, disposalLang)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2.5 text-sm">
            <span className="text-muted-foreground">{tFeatures('module')}</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', getStageColor(policyMeta?.stage ?? 0))} />
              <span className="font-medium">{getModuleName(basis.policy_key, disposalLang) || '—'}</span>
            </div>
            <span className="text-muted-foreground">{tFeatures('ruleName')}</span>
            {basisRoute && hasRuleName ? (
              <InteractiveSurface asChild variant="text" className="min-w-0 text-primary data-[hovered=true]:text-primary/80">
                <button
                  type="button"
                  data-testid="analysis-disposal-basis-rule-link"
                  className="flex items-center gap-1.5 text-left"
                  title={tFeatures('viewPolicyConfigTitle')}
                  onClick={() => router.push(basisRoute)}
                >
                  <span className="truncate">{combinedRuleLabel}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity duration-[120ms] group-data-[hovered=true]/interactive:opacity-100 motion-reduce:transition-none" />
                </button>
              </InteractiveSurface>
            ) : (
              <span className="min-w-0 truncate">{combinedRuleLabel}</span>
            )}
            <span className="text-muted-foreground">{tFeatures('hitDetail')}</span>
            <span className="text-muted-foreground leading-relaxed">
              {formatHitDetail(basis, disposalLang) || '—'}
            </span>
            {basis.detection_tags && basis.detection_tags.length > 0 && (
              <>
                <span className="text-muted-foreground">{tFeatures('detectionTags')}</span>
                <span className="flex flex-wrap gap-1">
                  {basis.detection_tags.map((tag) => (
                    <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs">{tag}</span>
                  ))}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 事后处置时间线（gap 2.5，两级展开）*/}
      <div data-testid="analysis-post-detection-timeline">
        <InteractiveSurface
          asChild
          variant="control"
          className="mb-4 flex w-full items-center justify-between px-2 py-1 text-left data-[hovered=true]:bg-muted/50"
        >
          <button
            type="button"
            data-testid="analysis-timeline-toggle"
            aria-expanded={showTimeline}
            onClick={() => setShowTimeline((v) => !v)}
          >
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {t('postDetectionTimeline')}
              <Badge variant="outline" className="text-xs">{t('eventCount', { n: sortedEvents.length })}</Badge>
            </h4>
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', !showTimeline && '-rotate-90')} />
          </button>
        </InteractiveSurface>
        {showTimeline && (
          sortedEvents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground" data-testid="analysis-timeline-empty">
              {t('noEvents')}
            </p>
          ) : (
            <div
              className="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-4"
              data-testid="analysis-timeline-body"
            >
              <div className="relative -ml-[25px]">
                <div className="absolute left-0 flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
                <div className="ml-6 text-xs text-muted-foreground">
                  {t('detectionComplete')} {formatTimestamp(detail.processed_at || detail.received_at)
                    || detail.processed_at || detail.received_at}
                </div>
              </div>
              {sortedEvents.map((ev) => {
                const isOpen = expandedEvents.has(ev.id);
                return (
                  <div key={ev.id} className="relative -ml-[25px]">
                    <div className="absolute left-0 flex h-4 w-4 items-center justify-center rounded-full bg-gray-500">
                      <User className="h-2.5 w-2.5 text-white" />
                    </div>
                    <InteractiveSurface
                      asChild
                      variant="row"
                      className="ml-6 rounded-lg border bg-muted/30 p-3 data-[hovered=true]:border-foreground/20 data-[hovered=true]:bg-muted/50"
                    >
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
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatTimestamp(ev.event_time) || ev.event_time}
                            </span>
                            <span className="truncate text-sm font-medium">
                              {ev.event_source} · {ev.event_type}
                              {ev.recipient ? ` (${ev.recipient})` : ''}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant="outline" className="text-xs">{ev.event_result || ev.correlation_status || '—'}</Badge>
                            <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', !isOpen && '-rotate-90')} />
                          </div>
                        </div>
                        {isOpen && (
                          <div
                            className="mt-3 space-y-2 border-t pt-3 text-sm"
                            data-testid={`analysis-timeline-event-${ev.id}-detail`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="w-20 shrink-0 text-muted-foreground">{t('recallScope')}:</span>
                              <span>{ev.recipient || ev.recipients || '—'}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="w-20 shrink-0 text-muted-foreground">{t('recallAction')}:</span>
                              <span>{ev.event_type || '—'}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="w-20 shrink-0 text-muted-foreground">{t('executionResult')}:</span>
                              <span>{ev.event_result || '—'}{ev.dsn ? `（${ev.dsn}）` : ''}</span>
                            </div>
                            <div className="pt-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                data-testid={`analysis-timeline-event-${ev.id}-view-log`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info(tSenderActions('notImplementedToast'));
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
          )
        )}
      </div>

      {/* Step 2: content-layer expandable area -- URL + attachment tables */}
      <div className="rounded-lg border overflow-hidden">
        <InteractiveSurface
          asChild
          variant="control"
          className="flex w-full items-center justify-between rounded-none p-3 data-[hovered=true]:bg-muted/50"
        >
          <button
            type="button"
            aria-expanded={contentExpanded}
            onClick={() => setContentExpanded((v) => !v)}
          >
            <span className="font-medium">{t('contentDetails')}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', !contentExpanded && '-rotate-90')} />
          </button>
        </InteractiveSurface>
        {contentExpanded && (
          <div className="border-t p-4 space-y-4">
            <Section title={tFeatures('basicInfo')}>
              <KV label={tFeatures('tid')} value={tidOf(detail.message_uuid)} mono />
              <KV label={tFeatures('emailId')} value={detail.message_id || '—'} mono />
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
                          <span className={suspiciousUrls.has(u)
                            ? 'rounded bg-red-100 px-2 py-0.5 text-red-700'
                            : 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-700'}>
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
                      const virus = !scan ? 'unknown' : scan?.virus_name ? 'detected'
                        : scan?.antivirus_result === 'error' ? 'error' : 'clean';
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
                            <span className={
                              virus === 'unknown' ? 'text-muted-foreground'
                              : virus === 'detected' ? 'rounded bg-red-100 px-2 py-0.5 text-red-700'
                              : virus === 'error' ? 'rounded bg-gray-100 px-2 py-0.5 text-gray-700'
                              : 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-700'}>
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

      {/* Step 3: AI-gated phishing-agent-verdict block */}
      {aiEnabled && (
        <div className="overflow-hidden rounded-lg border border-purple-200 bg-purple-50">
          <div className="flex items-center gap-3 p-4">
            <ShieldQuestion className={cn('h-6 w-6', ts.text)} />
            <div className="flex-1">
              <p className="text-xs font-medium text-purple-700">{t('aiVerdict.title')}</p>
              <p className={cn('text-lg font-bold', ts.text)}>{t(`aiVerdict.threat.${threat}`)}</p>
            </div>
            {confidencePct != null && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                {t('aiVerdict.confidence', { pct: confidencePct })}
              </span>
            )}
          </div>
          <div className="border-t border-purple-100">
            <InteractiveSurface
              asChild
              variant="control"
              className="flex w-full items-center justify-between rounded-none px-4 py-2 text-sm text-purple-700 data-[hovered=true]:bg-muted/35"
            >
              <button
                type="button"
                aria-expanded={aiDetailExpanded}
                onClick={() => setAiDetailExpanded((v) => !v)}
              >
                <span>{aiDetailExpanded ? t('aiVerdict.hideDetails') : t('aiVerdict.viewDetails')}</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', aiDetailExpanded && 'rotate-180')} />
              </button>
            </InteractiveSurface>
            {aiDetailExpanded && (
              <div className="border-t border-purple-100 p-4">
                {hasPhishAgentData ? (
                  <div className="space-y-3">
                    <KV label={t('aiVerdict.verdictLabel')} value={phishAgent!.verdict || '—'} />
                    <KV label={t('aiVerdict.riskLevelLabel')} value={phishAgent!.risk_level || '—'} />
                    {phishAgent!.summary && (
                      <div className="rounded border bg-background p-3 text-sm">{phishAgent!.summary}</div>
                    )}
                    {phishAgent!.details && Object.keys(phishAgent!.details).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">{t('aiVerdict.detailsLabel')}</p>
                        {Object.entries(phishAgent!.details).map(([k, v]) => (
                          <KV key={k} label={k} value={typeof v === 'string' ? v : JSON.stringify(v)} mono />
                        ))}
                      </div>
                    )}

                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">{t('aiVerdict.timelineLabel')}</p>
                      {steps.length > 0 ? (
                        <ol className="space-y-2 border-l-2 border-purple-200 pl-3">
                          {steps.map((step, i) => (
                            <li key={i} className="text-sm">
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
                          {recommendedActions.map((action, i) => (
                            <li key={i} className="rounded border bg-background p-2 text-sm">
                              <div className="flex items-center gap-1.5 font-medium">
                                <span>{action.type}</span>
                                {action.scope && <span className="text-xs text-muted-foreground">({action.scope}{action.target_count != null ? ` × ${action.target_count}` : ''})</span>}
                              </div>
                              {action.reason && <p className="text-xs text-muted-foreground">{action.reason}</p>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t('aiVerdict.noRecommendedActions')}</p>
                      )}
                    </div>

                    {phishAgent!.error && (
                      <p className="text-xs text-destructive">{phishAgent!.error}</p>
                    )}
                  </div>
                ) : (
                  // The phish agent either never ran for this message (delivered
                  // directly, never entered the sideline pipeline) or hasn't
                  // completed yet -- degrade to an honest "no data" state rather
                  // than fabricating placeholder numbers or fake timeline entries.
                  <Empty text={t('noAiData')} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
