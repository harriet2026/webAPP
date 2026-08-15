'use client';

// ThreatSummaryCard -- 概览与处置模块的「威胁摘要卡片」（A1-A12，见
// design/implement/spec/email-disposal-overview-html-spec-alignment.md §2 A
// 节）。渲染为单张紧凑边框卡片（对齐 demo html_spec 的
// layer-10-detail-overview-single），内部按行排列：
//   Row1 邮件类型 badge（A1）+ 置信度（A2）+ 已纠正角标（A3）| 头部处置按钮组
//        （A4/A5/A6，内嵌 SenderActions + 单收件人时的 SingleRecipientActions，
//        Task 11b）
//   Row2 命中特征（A7/A8/A9/A10，inline label）-- SPF/DKIM/DMARC + 首次出现 +
//        域名年龄（deriveDomainAge，值缺失/不够新时不渲染，后端暂无
//        whois/RDAP 数据时优雅降级）+ 紧急
//   Row3（原 AI判定依据 / A11 restructure）已按需求移除，卡片内不再渲染该行。
//   Row4 处置依据（A12，action 本地化，修复 G4：此前 getActionLabel 对
//        disposal_basis.action==="audit" 等值落回原始英文字符串）-- 阶段色点
//        + 模块「规则名」+ 动作徽标 + 查看依据详情 链接，同一行内联展示

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  AlertTriangle, CheckCircle, Info, Pencil, ShieldAlert, XCircle, ArrowRight, Layers, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ApiRequestFn } from '@/lib/api/client';
import type { MailLogDetail } from '@/types/email-disposal-detail';
import {
  mailTypeConfig, correctionSourceLabelKey,
  stripDetailPrefix, isNewSender, deriveConfidence, deriveHitSource, isSensitiveUrgent, deriveDomainAge,
} from '../../lib/detail-helpers';
import {
  getModuleName, getActionLabel, getActionColor, getPolicyMeta, getStageColor, isStage1Policy,
  groupRecipientBasisByPolicy, pickPrimaryBasisGroup, sortBasisGroupsForTooltip, type DisposalLang,
} from '../../lib/disposal-basis-config';
import { useProductForm } from '@/contexts/product-form-context';
import { SenderActions } from './sender-actions';
import { SingleRecipientActions } from './single-recipient-actions';
import { RecipientStatusBadges } from '../../components/recipient-status-badges';

interface ThreatSummaryCardProps {
  detail: MailLogDetail;
  apiRequest: ApiRequestFn;
  // Multi-recipient hint (A6) / single-recipient dispose-button gating --
  // threaded straight through to SenderActions (see that component's doc).
  isSingleRecipient: boolean;
  readOnly?: boolean;
  // Called after a successful blacklist/whitelist rule creation (E1/E2) so
  // the caller can refresh anything derived from it.
  onDisposed?: () => void;
  // Scrolls the drawer to the "安全分析" section (A12's 查看依据详情 →
  // #section-analysis jump, mirrors the demo).
  onViewBasis?: () => void;
}

type AuthResultKey = 'pass' | 'fail' | 'softfail' | 'none';

// 命中特征 badge 配色：对齐 demo (design/origin/demo/components/mail-investigation
// /overview-action-section.tsx authResultConfig) 的精确 hex 值，而非 DESIGN.md 常规
// token（用户明确要求以 demo 运行态为像素基准，见 spec 约束）。dark: 变体为 webapp
// 补充，保证暗色模式可读性，demo 本身无暗色定义。
const AUTH_RESULT_STYLES: Record<AuthResultKey, string> = {
  pass: 'bg-[#E8F5E9] text-[#388E3C] border-[#A5D6A7] dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  fail: 'bg-[#FFF3E0] text-[#F57C00] border-[#FFCC80] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  softfail: 'bg-[#E3F2FD] text-[#1976D2] border-[#90CAF9] dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  none: 'bg-[#F5F5F5] text-[#616161] border-[#E0E0E0] dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700',
};

const AUTH_RESULT_ICONS: Record<AuthResultKey, typeof CheckCircle> = {
  pass: CheckCircle,
  fail: XCircle,
  softfail: AlertTriangle,
  none: Info,
};

const AUTH_RESULT_MARK: Record<AuthResultKey, string> = {
  pass: '✓',
  fail: '✗',
  softfail: '⚠',
  none: '',
};

function normalizeAuthResult(result?: string): AuthResultKey {
  return result === 'pass' || result === 'fail' || result === 'softfail' ? result : 'none';
}

function AuthBadge({ type, result, t }: {
  type: 'spf' | 'dkim' | 'dmarc';
  result: string | undefined;
  t: ReturnType<typeof useTranslations>;
}) {
  const key = normalizeAuthResult(result);
  const Icon = AUTH_RESULT_ICONS[key];
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Badge
          variant="outline"
          className={cn('gap-1 cursor-help', AUTH_RESULT_STYLES[key])}
          data-testid={`email-disposal-overview-hit-${type}`}
        >
          <Icon className="h-3 w-3" />
          {type.toUpperCase()}{AUTH_RESULT_MARK[key]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {t('authVerification', { type: type.toUpperCase(), result: t(`authResult.${key}`) })}
      </TooltipContent>
    </Tooltip>
  );
}

// FirstSeenBadge surfaces spec §5.3's "首次出现" hit-feature (A8): a sender
// whose first-ever mail_log row IS this one (isNewSender). Demo renders this
// as a neutral GRAY/Info badge (情报信息，非警告) -- NOT the auth-failure
// warning palette -- see authResultConfig/renderFeatureSummary's "firstseen"
// case in the demo source; align exactly. 已知发信人 (established) is a
// webapp-only distinction on top of the demo, styled with the pass/green
// tone as a sensible "known-good" neutral.
function FirstSeenBadge({ receivedAt, firstSeenAt, t }: {
  receivedAt?: string;
  firstSeenAt?: string;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!firstSeenAt) return null;
  const isNew = isNewSender(receivedAt, firstSeenAt);
  const Icon = isNew ? Info : CheckCircle;
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Badge
          variant="outline"
          className={cn('gap-1 cursor-help', isNew ? AUTH_RESULT_STYLES.none : AUTH_RESULT_STYLES.pass)}
          data-testid="email-disposal-overview-hit-firstseen"
        >
          <Icon className="h-3 w-3" />
          {isNew ? t('firstSeenNew') : t('firstSeenEstablished')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t('firstSeenTooltip', { date: firstSeenAt })}</TooltipContent>
    </Tooltip>
  );
}

// 紫色「业务风险」语义色 -- 命中特征行的 域名年龄/紧急 badge 共用，精确对齐 demo
// authResultConfig 之外单独定义的紫色（renderFeatureSummary 的 domainAge/urgency
// case: bg-[#F3E5F5] text-[#7B1FA2] border-[#CE93D8]）。
const BUSINESS_RISK_PURPLE = 'border-[#CE93D8] bg-[#F3E5F5] text-[#7B1FA2] dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300';

// UrgentBadge surfaces A10 (敏感词/紧急关键词命中) -- backend-computed
// sensitive_keyword_hit flag via isSensitiveUrgent. Purple/business-risk
// toned (not the red/amber security-severity palette) to keep "business
// urgency" visually decoupled from "security threat", matching the demo's
// intent (它对紧急标签使用独立的紫色语义).
function UrgentBadge({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Badge
          variant="outline"
          className={cn('gap-1 cursor-help', BUSINESS_RISK_PURPLE)}
          data-testid="email-disposal-overview-hit-urgent"
        >
          <AlertTriangle className="h-3 w-3" />
          {t('urgent')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t('urgentTooltip')}</TooltipContent>
    </Tooltip>
  );
}

// DomainAgeBadge surfaces the 命中特征「域名年龄」badge -- a newly-registered
// sender domain (deriveDomainAge already applies the "worth alerting on"
// threshold, see its doc comment) is a strong phishing/spoofing signal.
// Purple/business-risk toned, matching UrgentBadge's palette (the demo uses
// the same purple family for both -- html_spec §① 命中特征行).
function DomainAgeBadge({ days, t }: { days: number; t: ReturnType<typeof useTranslations> }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Badge
          variant="outline"
          className={cn('gap-1 cursor-help', BUSINESS_RISK_PURPLE)}
          data-testid="email-disposal-overview-hit-domain-age"
        >
          <AlertTriangle className="h-3 w-3" />
          {t('domainAge', { n: days })}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t('domainAgeTooltip', { n: days })}</TooltipContent>
    </Tooltip>
  );
}

export function ThreatSummaryCard({
  detail, apiRequest, isSingleRecipient, readOnly = false, onDisposed, onViewBasis,
}: ThreatSummaryCardProps) {
  const t = useTranslations('emailDisposal.detail.overview'); // this card's own strings
  const tDetail = useTranslations('emailDisposal.detail'); // mailTypeConfig / correctionSourceLabelKey keys
  const tFeatures = useTranslations('emailDisposal.detail.features'); // shared disposal-basis strings (same source as analysis-section)
  // GT-12946 详情页落地：Overview 常显行的多依据 Popover 复用列表页「处置
  // 依据」列（disposal-basis-cell.tsx）已经上线的分组文案 key（
  // disposalBasisGroupHeader/disposalBasisRuleLine/disposalBasisPlatformRuleLine），
  // 保持"列表 Tooltip"与"详情 Overview 常显行"两处的措辞完全一致，不新增
  // 一套平行文案。
  const tTable = useTranslations('emailDisposal.table');
  const locale = useLocale();
  const { viewer, capabilities } = useProductForm();
  const isTenantPlatformViewer = viewer === 'tenant' && capabilities?.multiTenant === true;
  const isPlatformPolicyContext = isTenantPlatformViewer && isStage1Policy(detail.disposal_basis?.policy_key);
  const disposalLang: DisposalLang = (['zh', 'en', 'th', 'ru'] as const).includes(locale as DisposalLang)
    ? (locale as DisposalLang)
    : 'zh';

  // 群发邮件多处置依据支撑：groups.length <= 1 时（非群发 / 群发但全员命
  // 中同一依据）下方渲染分支与改造前完全一致；> 1 时主依据行不变，行尾追
  // 加"+N 项"Popover 徽标展示全部分组。
  const basisGroups = useMemo(
    () => groupRecipientBasisByPolicy(detail.disposal_basis),
    [detail.disposal_basis],
  );
  const isMultiBasis = basisGroups.length > 1;
  // 主依据行取"优先桶"的代表记录——多依据场景下 detail.disposal_basis 顶
  // 层字段只是 per_recipient 里随便一条，不能直接展示，否则运营看到的可
  // 能只是 N 个收件人里某一人的依据；统一从 basisGroups 推导（非群发/单
  // 依据时 groupRecipientBasisByPolicy 内部会把 basis 本身包成单元素分
  // 组，取出的 entries[0] 与直接使用 detail.disposal_basis 完全等价），
  // 保证"模块/规则/动作"三者严格对应同一条命中记录，且不依赖顶层
  // policy_key 与 per_recipient 是否同时存在这一隐含假设。
  const primaryBasisEntry = pickPrimaryBasisGroup(basisGroups)?.entries[0];
  const primaryStagePolicyMeta = primaryBasisEntry?.policy_key ? getPolicyMeta(primaryBasisEntry.policy_key) : undefined;
  const orderedBasisGroupsForPopover = isMultiBasis ? sortBasisGroupsForTooltip(basisGroups) : [];

  const typeCfg = detail.email_type ? mailTypeConfig[detail.email_type] : null;

  // CONFIDENCE SOURCE FIX (A2): the real per-message confidence is the phish
  // agent's own investigation score (phish_agent_check.confidence), not
  // cac.prob -- see deriveConfidence's doc comment. G3: hitSource (blacklist/
  // rule deterministic hits, e.g. disposal_basis.policy_key === 'SBL') is now
  // wired via deriveHitSource, which itself defers to a real score when one
  // is available -- see its doc comment for the exact priority order.
  const confidence = deriveConfidence(detail.cac_result, deriveHitSource(detail), detail.phish_agent_check?.confidence);

  // A9 域名年龄：仅在存在且够"新"（deriveDomainAge 的阈值判断）时才是一个命中
  // 特征，否则不渲染（后端暂无 whois/RDAP 数据，真实环境下这个字段本就缺席）。
  const domainAge = deriveDomainAge(detail);

  return (
    <div
      className="rounded-lg border bg-muted/30 p-4 space-y-3"
      data-testid="email-disposal-overview-threat-card"
    >
      {/* Row 0：群发结果摘要（仅群发命中多个收件人结果时渲染）——运营打开抽
          屉前只能靠列表页「执行动作」列的 [投递 6][隔离 1] 摘要判断这是一
          封 mixed 结果的群发邮件，进入详情后 Row1-4 全按单一结果叙事，看
          不到"这封信到底有几种不同结局"。复用列表页同款
          RecipientStatusBadges（recipient-status-badges.tsx），保证列表
          摘要与详情摘要永远是同一套聚类/主类别选取逻辑，不新增一套平行
          实现。单收件人邮件（isSingleRecipient）不渲染——那种场景下面的
          单收件人处置按钮组已经完整表达"这封信只有一个结局"。 */}
      {!isSingleRecipient && detail.recipient_dispositions && detail.recipient_dispositions.length > 0 && (
        <div className="flex items-center gap-2 text-sm" data-testid="email-disposal-overview-recipient-outcomes">
          <span className="shrink-0 font-medium text-muted-foreground">{t('recipientOutcomeLabel')}：</span>
          <RecipientStatusBadges dispositions={detail.recipient_dispositions} />
        </div>
      )}

      {/* Row 1: 邮件类型（A1）+ 置信度（A2）+ 已纠正（A3）  |  头部处置按钮组（A4/A5/A6） */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {typeCfg && (
            <div className="flex items-center gap-2" data-testid="email-disposal-overview-type-badge">
              <span className="text-sm font-medium text-muted-foreground">{t('mailType.label')}：</span>
              <Badge variant="outline" className={typeCfg.className}>
                {tDetail(stripDetailPrefix(typeCfg.labelKey))}
              </Badge>
            </div>
          )}
          {confidence.kind !== 'none' && (
            <span className="text-xs text-muted-foreground" data-testid="email-disposal-overview-confidence">
              {confidence.kind === 'blacklist' && t('confidenceBlacklist')}
              {confidence.kind === 'rule' && t('confidenceRule')}
              {confidence.kind === 'score' && t('confidenceScore', { pct: confidence.pct ?? 0 })}
            </span>
          )}
          {detail.email_type_overridden && typeCfg && (
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help" />}>
                <Badge variant="outline" className="gap-1 border-purple-200 bg-purple-50 text-purple-700">
                  <Pencil className="h-3 w-3" />
                  {t('corrected')}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {t('correctedTooltip', {
                  original: tDetail(stripDetailPrefix(
                    mailTypeConfig[detail.email_type_original ?? detail.email_type!].labelKey,
                  )),
                  current: tDetail(stripDetailPrefix(typeCfg.labelKey)),
                  source: tDetail(stripDetailPrefix(correctionSourceLabelKey(detail.correction_source))),
                })}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* G1 (v2 html_spec §②): header button order is dispose-actions
              FIRST (投递·隔离·阻断·丢弃), THEN sender actions (发信人加黑/加白，
              「更多」按钮已按需求移除) -- 隔离/阻断 stay omitted per spec §9. Task 11b:
              single-recipient deliver/discard/recall/notify buttons reuse
              the SAME dispatch hook as the multi-recipient matrix
              (RecipientStatus). Renders nothing for a multi-recipient
              message or a not-operable single recipient. */}
          {isSingleRecipient && (
            <SingleRecipientActions
              recipient_dispositions={detail.recipient_dispositions}
              mailLogId={detail.id}
              sender={detail.sender}
              apiRequest={apiRequest}
              onDisposed={onDisposed ?? (() => {})}
              readOnly={readOnly}
            />
          )}
          <SenderActions
            sender={detail.sender}
            apiRequest={apiRequest}
            isSingleRecipient={isSingleRecipient}
            readOnly={readOnly}
            onDisposed={onDisposed}
          />
        </div>
      </div>

      {/* Row 2: 命中特征（A7/A8/A9/A10）-- inline label + SPF/DKIM/DMARC +
          首次出现 + 域名年龄（deriveDomainAge，值缺失/不够新时不渲染）+
          紧急，全部同一行，对齐 demo html_spec §① 的紧凑单行样式（此前是
          独立 <h3> 标题起一行）。 */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="shrink-0 text-sm font-semibold text-muted-foreground">{t('hitFeatures')}：</span>
        <AuthBadge type="spf" result={detail.spf_valid} t={t} />
        <AuthBadge type="dkim" result={detail.dkim_valid} t={t} />
        <AuthBadge type="dmarc" result={detail.dmarc_valid} t={t} />
        <FirstSeenBadge receivedAt={detail.received_at} firstSeenAt={detail.sender_first_seen_at} t={t} />
        {domainAge !== undefined && <DomainAgeBadge days={domainAge} t={t} />}
        {isSensitiveUrgent(detail) && <UrgentBadge t={t} />}
      </div>

      {/* Row 4: 处置依据（A12）-- 现在是卡片内的一行内联展示（此前是卡片内
          另起一个独立橙色边框/背景的子块，视觉上像"卡中卡"），阶段色点
          （getStageColor）+ 模块名 +「规则名」+ 动作徽标（getActionLabel/
          getActionColor，修复 G4：此前对 disposal_basis.action==="audit" 等
          值无映射，直接落回原始英文字符串渲染）+ 查看依据详情 链接。 */}
      {/* GT-12578 / GT-12686：落地 spec
          design/implement/spec/2026-07-07-mail-disposal-investigation-center-design.md:168
          规定「合成失败/无命中时 disposal_basis 存 null，前端回退现有
          MailLog.Reason 自由文本」。此前这里是硬门控直接隐藏整块，于是
          mail_marking（接收标记）这类不参与 disposal_basis 合成的规则，
          命中后处置依据处什么都看不到——尽管规则名早已由 decision.go 写进
          mail_log.reason。html-spec 对该卡片的规定也是「常显」。 */}
      {basisGroups.length === 0 && detail.reason && (
        <div
          className="flex flex-wrap items-start gap-2 border-t pt-3 text-sm"
          data-testid="email-disposal-overview-disposal-basis"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
          <span className="shrink-0 text-muted-foreground">{tFeatures('disposalBasis')}：</span>
          <span className="min-w-0 flex-1 break-all text-foreground">{detail.reason}</span>
        </div>
      )}

      {primaryBasisEntry?.policy_key && (
        <div
          className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm"
          data-testid="email-disposal-overview-disposal-basis"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-orange-600" />
          <span className="shrink-0 text-muted-foreground">{tFeatures('disposalBasis')}：</span>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', getStageColor(primaryStagePolicyMeta?.stage ?? 0))} />
          {isPlatformPolicyContext ? (
            <span className="font-medium text-foreground">
              {tFeatures('platformPolicyModule')}
            </span>
          ) : (
            <span className="font-medium text-foreground">
              {getModuleName(primaryBasisEntry.policy_key, disposalLang) || primaryBasisEntry.policy_key}
              {primaryBasisEntry.rule_name && primaryBasisEntry.rule_name !== '—' && (
                <span className="font-normal text-muted-foreground">「{primaryBasisEntry.rule_name}」</span>
              )}
            </span>
          )}
          {primaryBasisEntry.action && (
            <span className={cn('rounded px-2 py-0.5 text-xs font-medium', getActionColor(primaryBasisEntry.action))}>
              {getActionLabel(primaryBasisEntry.action, disposalLang)}
            </span>
          )}

          {/* GT-12946 详情页落地：群发邮件不同收件人命中不同处置依据时，
              主依据行只能展示"优先桶"的一条记录——这里追加"+N 项"徽标，
              点击展开 Popover 逐组列出全部命中记录，避免运营误把主依据当
              成"这条邮件唯一的依据"。groups.length <= 1 时不渲染，DOM 结
              构与改造前完全一致。 */}
          {isMultiBasis && (
            <Popover>
              <PopoverTrigger
                data-testid="email-disposal-overview-disposal-basis-more"
                render={
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                  />
                }
              >
                <Layers className="h-3 w-3" />
                {t('multiBasisCount', { n: basisGroups.length - 1 })}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {t('multiBasisPopoverTitle', { count: basisGroups.length })}
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto text-xs">
                  {orderedBasisGroupsForPopover.map((group) => {
                    const isPlatformGroup = isTenantPlatformViewer && isStage1Policy(group.policyKey);
                    const moduleLabel = isPlatformGroup
                      ? tFeatures('platformPolicyListReason')
                      : getModuleName(group.policyKey, disposalLang);
                    return (
                      <div key={group.policyKey}>
                        <div className="font-medium text-foreground">
                          {tTable('disposalBasisGroupHeader', { module: moduleLabel, count: group.entries.length })}
                        </div>
                        <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                          {group.entries.map((entry, i) => (
                            <li key={`${entry.recipient ?? i}-${entry.rule_id ?? i}`}>
                              {isPlatformGroup
                                ? tTable('disposalBasisPlatformRuleLine', {
                                    recipient: entry.recipient ?? '—',
                                    policyLabel: tFeatures('platformPolicyListReason'),
                                  })
                                : tTable('disposalBasisRuleLine', {
                                    recipient: entry.recipient ?? '—',
                                    ruleName: entry.rule_name ?? '',
                                    ruleId: entry.rule_id ?? '',
                                  })}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {onViewBasis && (
            <InteractiveSurface asChild variant="text" className="ml-auto shrink-0 text-primary data-[hovered=true]:text-primary/80">
              <button
                type="button"
                onClick={onViewBasis}
                data-testid="email-disposal-overview-view-basis"
                className="flex items-center gap-1"
              >
                {tFeatures('viewBasisDetail')}
                <ArrowRight className="h-3.5 w-3.5 opacity-70 transition-[transform,opacity] duration-[120ms] group-data-[hovered=true]/interactive:translate-x-0.5 group-data-[hovered=true]/interactive:opacity-100 motion-reduce:transition-none" />
              </button>
            </InteractiveSurface>
          )}
        </div>
      )}
    </div>
  );
}
