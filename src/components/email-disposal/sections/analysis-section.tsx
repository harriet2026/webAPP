'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
// GT-12583：必须用 next-intl 的 locale-aware router——本项目 localePrefix 为
// 默认 always，next/navigation 的裸 push 会丢 /zh 前缀导致 404。
import { useRouter } from '@/i18n/navigation';
import {
  CheckCircle2, AlertTriangle, XCircle, MinusCircle, ChevronDown,
  Clock, ShieldAlert, ExternalLink, ArrowRight, User, Layers, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MailLogDetail, CheckStatus, FinalVerdict, MailChildEvent } from '@/types/email-disposal-detail';
import type { DisposalBasis } from '@/types/email-disposal';
import { formatTimestamp } from '@/lib/format-time';
import { useDetectionStages, aggregate, deriveFinalVerdict } from '../hooks/use-detection-stages';
import {
  formatBytes, tidOf, deriveDirection,
} from '../lib/detail-helpers';
import {
  formatHitDetail, getModuleName, getActionLabel, getActionColor, getPolicyRoute, getPolicyMeta,
  getStageColor, isStage1Policy, groupRecipientBasisByPolicy, type DisposalLang,
} from '../lib/disposal-basis-config';
import { useProductForm } from '@/contexts/product-form-context';

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

// 收件人筛选器的"全部收件人"哨兵值——用户反馈：群发邮件里不同收件人的
// 安全分析过程/处置依据可能不同，希望能按收件人切换查看专属结果，而不是
// 只在合并视图里靠就地标注去猜"谁跟谁不一样"。默认停在这个哨兵值上，即
// 现有的合并视图（就地标注 + 折叠列表）。
const ALL_RECIPIENTS = '__all__';

// 检测流程的阶段 key（connection/identity/…）与 disposal-basis-config.ts
// 里 PolicyMeta.stage（1-5）的固定映射——两套体系描述的是同一条策略流水
// 线，编号语义完全一致（stage 4 = AI 智能分析，与 STAGE_DEFS 一致）。用来
// 把"处置依据按 policy_key 分组"的结果归属到对应的检测流程阶段卡片，从
// 而在阶段卡片上标出"这一阶段的结果因收件人而分叉"。
const STAGE_KEY_TO_NUM: Record<string, number> = {
  connection: 1,
  identity: 2,
  content: 3,
  ai: 4,
  comprehensive: 5,
};

// aiEnabled defaults to false (fail-closed): this is an entitlement gate for
// the AI verdict block (spec §5.4/§4.4 CapAI), so a future call site that
// forgets to pass it must not silently show AI-only content on the
// non-AI/传统版 tier -- the current call site (detail-modal.tsx) always
// passes an explicit value derived from capabilities.ai.
export function AnalysisSection({ detail, aiEnabled = false, events = [] }: AnalysisSectionProps) {
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
  const disposalLang: DisposalLang = (['zh', 'en', 'th', 'ru'] as const).includes(rawLocale as DisposalLang)
    ? (rawLocale as DisposalLang)
    : 'zh';

  // --- Step 1: 5-stage detection pipeline (ported from tabs/analysis-tab.tsx) ---
  const { stages: allStages, verdict: baseVerdict } = useDetectionStages(detail);
  // GT-12575: 非 AI 形态滤掉 ai 阶段后重编号（综合显示为阶段4），与策略
  // 流水线的动态阶段号语义一致。
  const stages = useMemo(() => {
    const base = aiEnabled ? allStages : allStages.filter((s) => s.key !== 'ai');
    return base.map((s, i) => ({ ...s, stage: i + 1 }));
  }, [allStages, aiEnabled]);
  // v2 spec gap 2.1: all 5 stage cards default EXPANDED (inline hit-strategy
  // detail rendered inside each card); clicking a card toggles its own
  // detail only. Initialize with every possible stage number -- harmless for
  // the stage(s) filtered out of `stages` when aiEnabled is false.
  const [expandedStages, setExpandedStages] = useState<number[]>(ALL_STAGE_NUMBERS);
  const toggleStage = (s: number) =>
    setExpandedStages((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  // 收件人切换器：默认合并视图（ALL_RECIPIENTS），运营可切到单个收件人
  // 专属视图。只在群发（recipients.length > 1）时才需要渲染这个控件——
  // 单收件人邮件永远只有一种结果，没有"切换"的意义。
  const [selectedRecipient, setSelectedRecipient] = useState<string>(ALL_RECIPIENTS);
  const mailRecipients = detail.recipients ?? [];
  const showRecipientSwitcher = mailRecipients.length > 1;

  // 单人视图下，把每个 check 重新聚合成"这个收件人专属的结果"：
  // - check 内部没有按人分叉（recipientGroups.length <= 1）：对所有人一
  //   视同仁（SPF/DKIM/IP 频率限制等大多数检测项属于这种情况），原样展示，
  //   不加任何提示（v0之前已确认：不分歧的检测项不需要额外标注）。
  // - check 内部分叉了：选中人命中了某个分组 → ruleIds 收窄成那个分组的
  //   规则集合，沿用该 check 原本算出的整体 status（现有数据模型里，某个
  //   check 是否 threat/suspicious 取决于邮件级别的 matched_action_rules
  //   是否命中 + ml.action，并不区分"这条规则对谁生效"，因此无法比整体
  //   状态更精确；分组只能证明"这个人命中了这些规则 ID"）；选中人不在任
  //   何命中分组里 → 这个 check 对这个人而言没有触发，状态收窄为 pass。
  // 阶段整体状态用 aggregate() 基于收窄后的 checks 重新计算，与合并视图
  // 共用同一份聚合规则。
  const displayStages = useMemo(() => {
    if (selectedRecipient === ALL_RECIPIENTS) return stages;
    return stages.map((st) => {
      const checks = st.checks.map((c) => {
        const groups = c.recipientGroups ?? [];
        if (groups.length <= 1) return c;
        const mine = groups.find((g) => g.recipients.includes(selectedRecipient));
        if (mine) return { ...c, ruleIds: mine.ruleIds, recipientGroups: undefined };
        return { ...c, status: 'pass' as CheckStatus, ruleIds: [], recipientGroups: undefined };
      });
      return { ...st, status: aggregate(checks), checks };
    });
  }, [stages, selectedRecipient]);

  const hitIndex = displayStages.findIndex((s) => s.status === 'threat');
  // 单人视图下"最终判定"徽标也要换成这个人专属的结论——否则合并视图判
  // 为 malicious（因为有人命中了威胁）时，切到一个实际只是 pass 的收件人
  // 也会一直显示"恶意"，跟下方重新聚合出的阶段卡片自相矛盾。
  const verdict = selectedRecipient === ALL_RECIPIENTS ? baseVerdict : deriveFinalVerdict(displayStages);

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
    () => events.filter((ev) => {
      if (ev.event_source === 'postfix') return false;
      // 单人视图：按 recipient 过滤——事件没有任何收件人信息（既非单个
      // recipient 也没有 recipients 列表）时视为"整封邮件级别的动作"，不
      // 因为切到某个人就消失；有收件人信息但不含选中人的事件才隐藏。
      if (selectedRecipient === ALL_RECIPIENTS) return true;
      const evRecipients = (ev.recipients ?? '').split(',').map((r) => r.trim()).filter(Boolean);
      if (!ev.recipient && evRecipients.length === 0) return true;
      return ev.recipient === selectedRecipient || evRecipients.includes(selectedRecipient);
    }),
    [events, selectedRecipient],
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

  // --- 钓鱼检测智能体研判明细的展开状态：内嵌在阶段4卡片的
  // phishingAgent 检测行下方（不再是独立的底部大卡片）。 ---
  const [phishAgentDetailExpanded, setPhishAgentDetailExpanded] = useState(false);
  const phishAgent = detail.phish_agent_check;
  const hasPhishAgentData = !!phishAgent?.checked;
  const confidencePct = phishAgent?.confidence != null ? Math.round(phishAgent.confidence * 100) : null;
  const steps = phishAgent?.steps ?? [];
  const recommendedActions = phishAgent?.recommended_actions ?? [];

  // --- 处置依据（gap 2.7）---
  const basis = detail.disposal_basis;

  // 方案A：多���户产品形态 + 租户管理员视角 + 阶段1（连接层/IP策略）→ 显示"平台策略"，
  // 不暴露策略模���细节、规则名、命中详情，也不提供"前往策略配置页"跳转。
  const isPlatformPolicyContext =
    viewer === 'tenant' &&
    capabilities?.multiTenant === true &&
    isStage1Policy(basis?.policy_key);
  // 复用同一个租户判断，用于下方处置依据多卡片场景——每张卡片按自己的
  // policy_key 独立判断是否命中阶段1平台策略，不能整体沿用上面按顶层
  // basis.policy_key 算出的 isPlatformPolicyContext。
  const isTenantPlatformViewer = viewer === 'tenant' && capabilities?.multiTenant === true;

  // 群发邮件多处置依据支撑：按 policy_key 分组，与列表页「处置依据」列
  // （disposal-basis-cell.tsx）复用同一套 groupRecipientBasisByPolicy()。
  // 没有 per_recipient（非群发 / 群发但全员命中同一依据）时长度 <= 1，
  // 下方渲染分支与改造前完全一致。
  const basisGroups = useMemo(() => groupRecipientBasisByPolicy(basis), [basis]);

  // 同一策略模块下，不同收件人仍可能命中不同的具体规则——按"模块 + 具体
  // 规则"再分一层，这是"处置依据"区块实际渲染的卡片粒度，也是检测流程
  // 阶段卡片"N组"徽标应该对齐的粒度（否则"阶段3命中2组"却在下面只看到
  // 1张卡片，两处数字对不上）。之前 recipientGroups 徽标只依赖
  // matched_action_rules/matched_tag_rules 按 check 交叉推导——但 SPF/DKIM/
  // IP 策略等大多数检测项是对整封邮件评估一次、不分收件人，实际数据里几
  // 乎不会出现按 ruleId 分叉，导致群发多结果邮件在"安全分析"里完全看不
  // 出差异（用户反馈的问题）。disposal_basis.per_recipient 才是"最终裁决
  // 按收件人分叉"的权威信号，这里补一路基于它的分组，与原有 check 级分组
  // 信号取并集，两者都可能命中。
  const basisSplitGroups = useMemo(() => {
    const out: { policyKey: string; entry: DisposalBasis; recipients: string[] }[] = [];
    for (const group of basisGroups) {
      const subGroups = new Map<string, { entry: DisposalBasis; recipients: string[] }>();
      for (const entry of group.entries) {
        const subKey = `${entry.rule_id ?? ''}|${entry.rule_name ?? ''}`;
        const existing = subGroups.get(subKey);
        if (existing) {
          existing.recipients.push(entry.recipient ?? '—');
        } else {
          subGroups.set(subKey, { entry, recipients: [entry.recipient ?? '—'] });
        }
      }
      for (const sub of subGroups.values()) {
        out.push({ policyKey: group.policyKey, entry: sub.entry, recipients: sub.recipients });
      }
    }
    return out;
  }, [basisGroups]);
  const isMultiBasis = basisSplitGroups.length > 1;
  const totalBasisRecipients = useMemo(
    () => basisSplitGroups.reduce((sum, g) => sum + g.recipients.length, 0),
    [basisSplitGroups],
  );

  // 群发多依据折叠列表（用户反馈：N 张完整卡片纵向堆叠占用空间过多，N=100
  // 时会变成几十屏——尤其在这种量级下，运营真正需要的是先扫一眼"有哪些
  // 分组、各自命中什么、影响多少人"，而不是每组都展开的完整字段）。默认全
  // 部收起为一行摘要，点击某一行才展开该组完整详情（模块/规则跳转/命中详
  // 情/检测标签），空间占用从 O(N)×180px 降到 O(N)×40px。
  const [expandedBasisRows, setExpandedBasisRows] = useState<Set<number>>(new Set());
  const toggleBasisRow = (i: number) =>
    setExpandedBasisRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  // 收件人选择器下拉项的处置动作标签："user@x.com · 隔离"——优先取
  // detail.recipient_dispositions（final_action，与顶部"放行(3) 隔离(1)
  // 丢弃(1)"摘要徽标同一份数据源，见 threat-summary-card.tsx +
  // recipient-status-badges.tsx）：这份数据只要是群发就一定按收件人逐条
  // 存在，不依赖 disposal_basis.per_recipient 是否命中过分叉的策略（后者
  // 常见于"全员结果一致，本来就没必要分组"的场景，届时 basisSplitGroups
  // 是空的，之前直接用它会导致下拉项完全没有动作标签）。找不到对应
  // disposition 时才退回 basisSplitGroups 兜底。
  const recipientActionMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const d of detail.recipient_dispositions ?? []) {
      const action = (d.final_action || d.original_action || '').toLowerCase();
      if (action) map.set(d.recipient, action);
    }
    for (const g of basisSplitGroups) {
      for (const r of g.recipients) if (!map.has(r)) map.set(r, g.entry.action);
    }
    return map;
  }, [detail.recipient_dispositions, basisSplitGroups]);

  // 单人视图下"处置依据"区块要渲染的那一条：优先取该收件人在
  // basisSplitGroups 里所属的分组（这正是分叉发生的地方）；群发但全员
  // 结果一致（basisSplitGroups 长度 <= 1）时退回 basis 本身，与合并视图
  // 单卡场景完全一致。
  const effectiveBasisEntry = useMemo(() => {
    if (selectedRecipient === ALL_RECIPIENTS) return basis;
    const match = basisSplitGroups.find((g) => g.recipients.includes(selectedRecipient));
    return match?.entry ?? basis;
  }, [selectedRecipient, basis, basisSplitGroups]);

  // 处置依据卡片内容体（不含外层卡片边框）——单卡场景（renderDisposalBasisCard）
  // 与折叠列表展开态（下方 basisSplitGroups 折叠行）共用同一份字段渲染，避免
  // 两处各维护一份"模块/规则跳转/命中详情/检测标签"逻辑。opts.hideHeader 用
  // 于折叠行展开态：该场景下折叠行本身已经显示了模块名+动作徽标，这里的
  // "处置依据"标题+图标+动作徽标会与折叠行重复，跳过即可。
  const renderDisposalBasisCardBody = (
    entry: DisposalBasis,
    opts: { scope?: string[]; idSuffix?: string; hideHeader?: boolean } = {},
  ) => {
    const meta = entry.policy_key ? getPolicyMeta(entry.policy_key) : undefined;
    const route = entry.policy_key ? getPolicyRoute(entry.policy_key) : undefined;
    const entryHasRuleName = !!entry.rule_name && entry.rule_name !== '—';
    const entryRuleLabel = entryHasRuleName
      ? (entry.rule_id ? `${entry.rule_name}（${entry.rule_id}）` : entry.rule_name!)
      : (entry.rule_id || '—');
    const isPlatform = isTenantPlatformViewer && isStage1Policy(entry.policy_key);
    const testIdSuffix = opts.idSuffix ? `-${opts.idSuffix}` : '';
    return (
      <>
        {!opts.hideHeader && (
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-orange-600" />
            <h4 className="text-sm font-semibold">{tFeatures('disposalBasis')}</h4>
            {entry.action && (
              <span
                data-testid={`analysis-disposal-basis-action${testIdSuffix}`}
                className={cn('text-xs font-medium px-2 py-0.5 rounded ml-auto', getActionColor(entry.action))}
              >
                {getActionLabel(entry.action, disposalLang)}
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2.5 text-sm">
          {opts.scope && (
            <>
              <span className="text-muted-foreground">{tFeatures('basisScope')}</span>
              <span className="text-foreground" data-testid={`analysis-disposal-basis-scope${testIdSuffix}`}>
                {t('recipientScopeLine', { recipients: opts.scope.join('、'), count: opts.scope.length })}
              </span>
            </>
          )}
          <span className="text-muted-foreground">{tFeatures('module')}</span>
          {isPlatform ? (
            // 平台策略模糊化：不展示阶段色点和具体模块名，仅显示"平台策略"
            <span className="font-medium text-muted-foreground">
              {tFeatures('platformPolicyModule')}
            </span>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', getStageColor(meta?.stage ?? 0))} />
              <span className="font-medium">
                {entry.policy_key ? (getModuleName(entry.policy_key, disposalLang) || '—') : '—'}
              </span>
            </div>
          )}
          <span className="text-muted-foreground">{tFeatures('ruleName')}</span>
          {isPlatform ? (
            // 租户不可见规则名，展示固定文案
            <span className="text-muted-foreground">{tFeatures('platformPolicyRuleName')}</span>
          ) : route && entryHasRuleName ? (
            <InteractiveSurface asChild variant="text" className="min-w-0 text-primary data-[hovered=true]:text-primary/80">
              <button
                type="button"
                data-testid={`analysis-disposal-basis-rule-link${testIdSuffix}`}
                className="flex items-center gap-1.5 text-left"
                title={tFeatures('viewPolicyConfigTitle')}
                onClick={() => router.push(route)}
              >
                <span className="truncate">{entryRuleLabel}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity duration-[120ms] group-data-[hovered=true]/interactive:opacity-100 motion-reduce:transition-none" />
              </button>
            </InteractiveSurface>
          ) : (
            <span className="min-w-0 truncate">{entryRuleLabel}</span>
          )}
          <span className="text-muted-foreground">{tFeatures('hitDetail')}</span>
          <span className="text-muted-foreground leading-relaxed">
            {isPlatform
              ? tFeatures('platformPolicyHitDetail')
              : (formatHitDetail(entry, disposalLang) || '—')}
          </span>
          {!isPlatform && entry.detection_tags && entry.detection_tags.length > 0 && (
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
      </>
    );
  };

  // 单张处置依据卡片渲染——非群发/单一依据场景直接传 basis 本身
  // （scope 不传，不新增"适用范围"行，DOM 结构与改造前逐字节一致）。
  const renderDisposalBasisCard = (
    entry: DisposalBasis,
    opts: { scope?: string[]; idSuffix?: string } = {},
  ) => {
    const testIdSuffix = opts.idSuffix ? `-${opts.idSuffix}` : '';
    return (
      <div
        key={opts.idSuffix ?? 'primary'}
        id={opts.idSuffix ? undefined : 'disposal-basis'}
        data-testid={`analysis-disposal-basis${testIdSuffix}`}
        className="rounded-lg border bg-card p-4 scroll-mt-4"
      >
        {renderDisposalBasisCardBody(entry, opts)}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* 检测流程：5 个阶段卡片，默认全部展开，命中策略明细内联在卡片内 */}
      <div>
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h4 className="text-sm font-semibold shrink-0">{t('detectionPipeline')}</h4>
            {/* 收件人切换器：群发邮件的安全分析/处置依据/事后处置时间线可能
                因人而异，默认合并视图（就地标注 + 折叠列表），切到某个人后
                下方内容重新聚合成那个人专属的一条链路。单收件人邮件不渲染
                这个控件——没有"切换"的意义。 */}
            {showRecipientSwitcher && (
              <Select value={selectedRecipient} onValueChange={(v) => setSelectedRecipient(v ?? ALL_RECIPIENTS)}>
                <SelectTrigger
                  data-testid="analysis-recipient-switcher"
                  className="h-7 w-auto max-w-[240px] text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                {/* SelectContent 默认 `w-(--anchor-width)` 会跟随上面被压窄
                    的触发器宽度，导致弹出层里的邮箱地址（本身就比"检测流
                    程"标题旁留给触发器的空间长很多）被截断——这里改成按最
                    长选项自适应宽度（w-max），并保留 --anchor-width 作为下
                    限，避免触发器比选项本身还宽时弹出层反而变窄。 */}
                <SelectContent className="w-max min-w-(--anchor-width) max-w-[360px]">
                  <SelectItem value={ALL_RECIPIENTS}>
                    {t('recipientSwitcher.allRecipients', { count: mailRecipients.length })}
                  </SelectItem>
                  {mailRecipients.map((r) => {
                    const action = recipientActionMap.get(r);
                    return (
                      <SelectItem key={r} value={r}>
                        <span className="block max-w-[320px] truncate">
                          {action ? `${r} · ${getActionLabel(action, disposalLang)}` : r}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
          <span data-testid="analysis-total-elapsed" className="text-xs text-muted-foreground shrink-0">
            {t('totalElapsed', { ms: totalElapsedMs })}
          </span>
        </div>

        {/* 群发结果摘要：不同收件人最终命中不同处置依据（isMultiBasis）时，
            在阶段卡片行之前先给一眼可见的"这是一封多结果群发邮件"信号——
            此前只有下方"处置依据"多卡片能体现分叉，运营必须滚动到底部才
            会发现，检测流程区域看起来跟单收件人邮件一模一样。切到某个人的
            专属视图后已经不需要这条"有分叉"的整体摘要了。 */}
        {isMultiBasis && selectedRecipient === ALL_RECIPIENTS && (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/20"
            data-testid="analysis-multi-basis-summary"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="h-4 w-4 shrink-0 text-violet-600" />
              {t('multiBasisSummaryLabel', { recipients: totalBasisRecipients, groups: basisSplitGroups.length })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {basisSplitGroups.map((g, i) => g.entry.action && (
                <span
                  key={i}
                  className={cn('rounded px-2 py-0.5 text-xs font-medium', getActionColor(g.entry.action))}
                >
                  {getActionLabel(g.entry.action, disposalLang)}（{g.recipients.length}）
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-0 overflow-x-auto pb-2">
          {displayStages.map((st, i) => {
            const isExpanded = expandedStages.includes(st.stage);
            // 群发邮件多依据支撑（信号一）：本阶段内任意一个 check 的收件
            // 人命中结��出现分歧（matched_action_rules/matched_tag_rules
            // 按 ruleId 交叉推导），卡片右上角提示"N组"。但 SPF/DKIM/IP 等
            // 多数检测项是对整封邮件评估一次、不分收件人，这一信号在实际
            // 数据里很少触发。单人视图下 displayStages 已经把每个 check 的
            // recipientGroups 收窄成 undefined（不再是"多组"），这里天然
            // 算出 0，不需要额外判断就会隐藏"N组"徽标。
            const maxCheckRecipientGroupCount = Math.max(
              0,
              ...st.checks.map((c) => c.recipientGroups?.length ?? 0),
            );
            // 信号二（GT-12946 详情页落地补充）：本阶段是否是"处置依据"分
            // 组里某一组/某几组策略命中所在的阶段（按 policy_key 对应的
            // PolicyMeta.stage 归属）。这是"最终裁决按收件人分叉"的权威
            // 信号，能覆盖信号一覆盖不到的大多数真实场景——群发邮件的分
            // 叉几乎总是发生在"哪条策略最终判定了这个收件人"，而不是某个
            // 检测项内部命中的具体规则 ID 不同。单人视图下已经在看某一个
            // 人专属的一条链路，不需要"这个阶段命中了几组"的信号。
            const stageBasisGroups = isMultiBasis && selectedRecipient === ALL_RECIPIENTS
              ? basisSplitGroups.filter((g) => getPolicyMeta(g.policyKey)?.stage === STAGE_KEY_TO_NUM[st.key])
              : [];
            const stageBasisSplitCount = stageBasisGroups.length;
            // 注意阈值不对称：信号一（check 内规则分叉）本身就得 >1 组才算
            // "分叉"；信号二哪怕本阶段只归属 1 组处置依据，只要整体
            // isMultiBasis 成立，也代表"这个阶段是决定了一部分收件人命运
            // 的阶段"——如果两组处置依据分别落在阶段3和阶段5（各 1 组），
            // 用 >1 的统一阈值会让两个阶段都拿不到徽标，群发多结果邮件又
            // 变回"看起来跟普通邮件一样"。
            const recipientSplitCount = Math.max(maxCheckRecipientGroupCount, stageBasisSplitCount);
            const hasRecipientSplit = maxCheckRecipientGroupCount > 1 || stageBasisSplitCount >= 1;
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
                      <div className="text-xs text-muted-foreground mb-1">{t('stage')} {st.stage}</div>
                      {/* 阶段1 + 多租户租户视角：标题改为"平台管控" */}
                      <div className="font-medium text-sm mb-2">
                        {isPlatformPolicyContext && st.stage === 1
                          ? t('stageName.connectionPlatform')
                          : t(`stageName.${st.key}`)}
                      </div>
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
                        {isPlatformPolicyContext && st.stage === 1 ? (
                          /* 阶段1 + 多租户租户视角：命中策略明细替换为说明文字 */
                          <p className="text-xs text-muted-foreground italic">
                            {t('platformStageHint')}
                          </p>
                        ) : (
                          <>
                            <div className="text-xs font-medium text-muted-foreground mb-2">
                              {st.key === 'ai' ? t('agentJudgementLabel') : t('hitPolicyLabel')}
                            </div>
                            <div className="space-y-1.5">
                              {st.checks.map((c) => {
                                // recipientGroups.length > 1：这个 check 内不同
                                // 收件人命中了不同的规则集合，展开为分组明细
                                // 而不是把所有规则 ID 笼统合并成一行——否则运
                                // 营看到 "#101, #102" 时无法判断到底是谁命中
                                // 了哪一条。
                                const isSplit = (c.recipientGroups?.length ?? 0) > 1;
                                // 钓鱼检测智能体命中真实数据时，点击这一行展
                                // 开完整研判明细（结论/风险等级/置信度/威胁
                                // 溯源时间线/处置建议）。此前这份内容单独占了
                                // 页面最下方一张独立紫色大卡片，跟这里的阶段
                                // 卡片体系完全割裂，运营要滚很远才能发现同一
                                // 封邮件还有另一份 AI 结论；现在直接内嵌在这
                                // 一行下面，配色也统一成中性色系。
                                const canExpandPhishAgent = c.key === 'phishingAgent' && hasPhishAgentData;
                                const rowInner = (
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1 min-w-0">
                                      {STATUS_ICON[c.status]}
                                      <span className="truncate">{t(`check.${c.key}`)}</span>
                                    </div>
                                    <span className={cn('shrink-0 flex items-center gap-1 text-right', CHECK_RESULT_COLOR[c.status])}>
                                      {c.status === 'skipped' ? t('notIntegrated') : t(`status.${c.status}`)}
                                      {!isSplit && c.ruleIds.length > 0 && (
                                        <span className="ml-1 text-muted-foreground">#{c.ruleIds.join(', #')}</span>
                                      )}
                                      {canExpandPhishAgent && confidencePct != null && (
                                        <span className="ml-1 text-muted-foreground">
                                          {t('aiVerdict.confidence', { pct: confidencePct })}
                                        </span>
                                      )}
                                      {canExpandPhishAgent && (
                                        <ChevronDown
                                          className={cn(
                                            'h-3 w-3 shrink-0 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                                            phishAgentDetailExpanded && 'rotate-180',
                                          )}
                                        />
                                      )}
                                    </span>
                                  </div>
                                );
                                return (
                                  <div key={c.key} className="text-xs">
                                    {canExpandPhishAgent ? (
                                      <InteractiveSurface
                                        asChild
                                        variant="control"
                                        className="-mx-1 rounded px-1 data-[hovered=true]:bg-muted/40"
                                      >
                                        <button
                                          type="button"
                                          className="w-full text-left"
                                          data-testid="analysis-check-phishingAgent-toggle"
                                          aria-expanded={phishAgentDetailExpanded}
                                          onClick={() => setPhishAgentDetailExpanded((v) => !v)}
                                        >
                                          {rowInner}
                                        </button>
                                      </InteractiveSurface>
                                    ) : rowInner}
                                    {isSplit && (
                                      <div
                                        className="mt-1 space-y-1 rounded-md bg-background/60 p-1.5"
                                        data-testid={`analysis-check-${c.key}-recipient-groups`}
                                      >
                                        {c.recipientGroups!.map((g, gi) => (
                                          <div key={gi} className="flex items-center justify-between gap-2 text-muted-foreground">
                                            <span className="min-w-0 truncate">
                                              {t('recipientGroupLine', {
                                                recipients: g.recipients.join('、'),
                                                count: g.recipients.length,
                                              })}
                                            </span>
                                            <span className="shrink-0">#{g.ruleIds.join(', #')}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {canExpandPhishAgent && phishAgentDetailExpanded && (
                                      <div
                                        className="mt-2 space-y-3 rounded-md bg-background/60 p-3"
                                        data-testid="analysis-check-phishingAgent-detail"
                                      >
                                        <KV label={t('aiVerdict.verdictLabel')} value={phishAgent!.verdict || '—'} />
                                        <KV label={t('aiVerdict.riskLevelLabel')} value={phishAgent!.risk_level || '—'} />
                                        {phishAgent!.summary && (
                                          <div className="rounded border bg-card p-2.5 text-sm">{phishAgent!.summary}</div>
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
                                            <ol className="space-y-2 border-l-2 border-border pl-3">
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
                                                <li key={i} className="rounded border bg-card p-2 text-sm">
                                                  <div className="flex items-center gap-1.5 font-medium">
                                                    <span>{action.type}</span>
                                                    {action.scope && (
                                                      <span className="text-xs text-muted-foreground">
                                                        ({action.scope}{action.target_count != null ? ` × ${action.target_count}` : ''})
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

                                        {phishAgent!.error && (
                                          <p className="text-xs text-destructive">{phishAgent!.error}</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* 处置依据分组明细（GT-12946 详情页落地）：这个阶段
                                是"处置依据"分组归属的阶段之一时，直接在展开区
                                内列出"哪些收件人 · 命中哪条规则 · 最终动作"，
                                不强制运营再滚到下方"处置依据"区块去对照——
                                下方仍保留完整卡片（含规则跳转链接等），这里
                                只是提前给一份摘要。 */}
                            {stageBasisGroups.length > 0 && (
                              <div
                                className="mt-2 space-y-1.5 rounded-md border border-violet-200 bg-violet-50/50 p-2 dark:border-violet-900 dark:bg-violet-950/20"
                                data-testid={`analysis-stage-${st.stage}-basis-groups`}
                              >
                                {stageBasisGroups.slice(0, 3).map((g, gi) => (
                                  <div key={gi} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="min-w-0 truncate text-muted-foreground">
                                      {t('recipientGroupLine', {
                                        recipients: g.recipients.join('、'),
                                        count: g.recipients.length,
                                      })}
                                      {g.entry.rule_name && g.entry.rule_name !== '—' && (
                                        <span className="ml-1 text-foreground">「{g.entry.rule_name}」</span>
                                      )}
                                    </span>
                                    {g.entry.action && (
                                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', getActionColor(g.entry.action))}>
                                        {getActionLabel(g.entry.action, disposalLang)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {/* 超过3组时不再逐条铺开，避免阶段卡片本身跟着被
                                    撑高——完整明细已经能在下方折叠列表按需展开
                                    查看，这里只需要一个"还有多少"的信号。 */}
                                {stageBasisGroups.length > 3 && (
                                  <div
                                    className="text-xs text-muted-foreground/80"
                                    data-testid={`analysis-stage-${st.stage}-basis-groups-overflow`}
                                  >
                                    {t('moreBasisGroups', { n: stageBasisGroups.length - 3 })}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </button>
                </InteractiveSurface>
                {i < displayStages.length - 1 && (
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

      {/* GT-12578 / GT-12686：落地 spec
          design/implement/spec/2026-07-07-mail-disposal-investigation-center-design.md:168
          规定 disposal_basis 为 null 时回退 MailLog.Reason 自由文本；
          html-spec 对本卡片的规定也是「常显」。此前是硬门控整张卡片消失。 */}
      {!basis?.policy_key && detail.reason && (
        <div
          id="disposal-basis"
          data-testid="analysis-disposal-basis"
          className="rounded-lg border bg-card p-4 scroll-mt-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-orange-600" />
            <h4 className="text-sm font-semibold">{tFeatures('disposalBasis')}</h4>
          </div>
          <p className="break-all text-sm text-muted-foreground">{detail.reason}</p>
        </div>
      )}

      {/* 处置依据（gap 2.7）—— 非群发/单一依据场景（basisSplitGroups.length <= 1）
          渲染与改造前逐字节一致的单卡；群发邮件因不同收件人命中不同策略
          模块/规则而产生多条依据时（GT-12946 详情页落地 + 用户反馈的空间
          占用问题），改为折叠列表：每组默认只占一行摘要（模块 + 规则 +
          适用范围人数 + 动作徽标），点击才展开该组完整详情——N=100 时也
          只占 100 行摘要，而不是 100 张展开的完整卡片。
          basisSplitGroups 与上方检测流程阶段卡片"N组"徽标共享同一份分组
          计算，两处数字始终一致（阶段卡片说"命中2组"，这里就正好有2行
          摘要），不会出现"上面说2组、下面看不出对应关系"的数字不对齐。 */}
      {basis?.policy_key && (
        // 单人视图：这个人的最终依据本来就只有一条，直接渲染单卡——不需要
        // 折叠列表（折叠列表是给"一次性看全貌"用的，单人视图已经是"看一
        // 条链路"，两者不会同时出现）。
        (!isMultiBasis || selectedRecipient !== ALL_RECIPIENTS) ? (
          renderDisposalBasisCard(effectiveBasisEntry ?? basis)
        ) : (
          <div className="rounded-lg border bg-card scroll-mt-4" id="disposal-basis" data-testid="analysis-disposal-basis-groups">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <ShieldAlert className="h-4 w-4 text-orange-600" />
              <h4 className="text-sm font-semibold">{tFeatures('disposalBasis')}</h4>
            </div>
            <div className="divide-y">
              {basisSplitGroups.map((sub, i) => {
                const isOpen = expandedBasisRows.has(i);
                const meta = sub.entry.policy_key ? getPolicyMeta(sub.entry.policy_key) : undefined;
                const isPlatform = isTenantPlatformViewer && isStage1Policy(sub.entry.policy_key);
                const moduleLabel = isPlatform
                  ? tFeatures('platformPolicyModule')
                  : (sub.entry.policy_key ? (getModuleName(sub.entry.policy_key, disposalLang) || '—') : '—');
                const ruleHasName = !isPlatform && !!sub.entry.rule_name && sub.entry.rule_name !== '—';
                const ruleLabel = isPlatform
                  ? tFeatures('platformPolicyRuleName')
                  : (ruleHasName ? sub.entry.rule_name! : (sub.entry.rule_id || '—'));
                return (
                  <div key={i}>
                    <InteractiveSurface asChild variant="control" className="w-full data-[hovered=true]:bg-muted/40">
                      <button
                        type="button"
                        data-testid={`analysis-disposal-basis-row-${i}`}
                        aria-expanded={isOpen}
                        onClick={() => toggleBasisRow(i)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm"
                      >
                        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                        {!isPlatform && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', getStageColor(meta?.stage ?? 0))} />}
                        <span className="min-w-0 shrink-0 basis-32 truncate font-medium">{moduleLabel}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{ruleLabel}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t('recipientScopeLine', { recipients: sub.recipients.join('、'), count: sub.recipients.length })}
                        </span>
                        {sub.entry.action && (
                          <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs font-medium', getActionColor(sub.entry.action))}>
                            {getActionLabel(sub.entry.action, disposalLang)}
                          </span>
                        )}
                      </button>
                    </InteractiveSurface>
                    {isOpen && (
                      <div className="border-t bg-muted/20 px-4 py-3" data-testid={`analysis-disposal-basis-${i}`}>
                        {renderDisposalBasisCardBody(sub.entry, { scope: sub.recipients, idSuffix: `${i}`, hideHeader: true })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
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
