'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { IPFrequencyPage } from '@/components/security/IPFrequencyPage';
import { IPFilterPage } from '@/components/security/IPFilterPage';
import { RBLFilterPage } from '@/components/security/RBLFilterPage';
import { OverseasMailPage } from '@/components/security/OverseasMailPage';
import { SenderFilterPage } from '@/components/security/SenderFilterPage';
import { UserListPage } from './UserListPage';
import { AuthSpoofingPage } from '@/components/security/AuthSpoofingPage';
import { BehaviorControlPage } from '@/components/security/BehaviorControlPage';
import { RecipientCheckPage } from '@/components/security/RecipientCheckPage';
import { ContentRulesPage } from '@/components/security/ContentRulesPage';
import { AttachmentSecurityPage, type TabKey } from '@/components/security/AttachmentSecurityPage';
import { UrlProtectionPage } from '@/components/security/UrlProtectionPage';
import { IntentEnginePage } from '@/components/security/intent-engine/IntentEnginePage';
import { SimilarDetectionPage } from '@/components/security/similar-detection/SimilarDetectionPage';
import { MailMarkingPage } from '@/components/security/mail-marking/MailMarkingPage';
import { AdvancedFilterRulesModule } from '@/components/security/advanced-filter-rules/AdvancedFilterRulesModule';
import { PipelinePolicyCard, PipelineDrawerNavButton, type PipelinePolicy } from '@/components/security/pipeline-policy-card';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import { useRouter } from '@/i18n/navigation';
import type { Viewer } from '@/lib/product-form/resolve';
import { RefreshCw, ArrowRight, Settings, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useApiRequest } from '@/lib/api/client';
import { getModuleEnabled, listAdvancedRules } from '@/lib/api/advanced-rules';
import { getSecurityModules, type SecurityModulePage } from '@/lib/api/security-modules';
import { getSimilarDetection } from '@/lib/api/similar-detection';
import { useAgentCenterOverview } from '@/hooks/use-agent-center-overview';
import { resolveAgentPresentation } from '@/lib/agent-center/presentation';

// PipelinePolicy 类型随卡片组件收敛到 pipeline-policy-card.tsx（2026-07-25 柔和交互反馈规格整改）。

interface PipelineStage {
  key: string;
  nameKey: string;
  policies: PipelinePolicy[];
  bgClass: string;
  borderClass: string;
  locked?: boolean;
}

// Action-semantic palette (DESIGN.md): blocking→block, configurable→quarantine,
// ai→review, unconfigured→neutral. Routed through the --action-* / neutral tokens
// so the bars theme consistently with the rest of the app.
const typeColors: Record<string, string> = {
  blocking: 'var(--action-block)',
  // forced 命中即阻断，与 blocking 同为阻断语义色（demo §3.1：身份认证/意图引擎红色）。
  forced: 'var(--action-block)',
  // exception 白名单放行，投递语义色（demo §3.1：发信人/用户黑白名单绿色）。
  exception: 'var(--action-deliver)',
  configurable: 'var(--action-quarantine)',
  'ai-sync': 'var(--action-review)',
  'ai-async': 'var(--action-review)',
  unconfigured: 'var(--hairline-strong)',
};

type Stage1PolicyKey = 'ipFrequency' | 'ipFilter' | 'rbl' | 'overseas';
type Stage2PolicyKey = 'senderFilter' | 'authSpoofing' | 'behaviorControl' | 'recipientCheck' | 'userList';
type Stage3PolicyKey = 'attachment' | 'url' | 'content' | 'intentEngine';
type Stage5PolicyKey = 'similarDetection' | 'mailMarking' | 'advancedRules';

const stage1NavItems: { key: Stage1PolicyKey; nameKey: string; functional: boolean }[] = [
  { key: 'ipFrequency', nameKey: 'pipeline.ipFrequency', functional: true },
  { key: 'ipFilter', nameKey: 'pipeline.ipFilter', functional: true },
  { key: 'rbl', nameKey: 'pipeline.rbl', functional: true },
  { key: 'overseas', nameKey: 'pipeline.overseas', functional: true },
];

export const stage2NavItems: { key: Stage2PolicyKey; nameKey: string; functional: boolean }[] = [
  { key: 'senderFilter', nameKey: 'pipeline.senderFilter', functional: true },
  { key: 'authSpoofing', nameKey: 'pipeline.authSpoofing', functional: true },
  { key: 'behaviorControl', nameKey: 'pipeline.behaviorControl', functional: true },
  // GT-11878: 收信人检测的后端能力（收信人数量限制）完整且在线生效，只是管理入口
  // 被合并进了「发信行为管控」抽屉（2026-05-04-recipient-detection-design.md：
  // 「合并到 behavior_control，不创建新的功能页面」）。但该合并只在流水线页执行了，
  // email-disposal / group-policy 两处 UI 至今仍把它列为阶段2的第5项 —— 页面间不
  // 一致。这里补回卡片作为一个「入口」，点击后打开同一个行为管控抽屉。
  { key: 'recipientCheck', nameKey: 'pipeline.recipientCheck', functional: true },
  { key: 'userList', nameKey: 'pipeline.userBlackWhiteList', functional: true },
];

// GT-12938：内容规则调整到附件安全上方，成为阶段3的第一项（此处与下方
// stages[stage3].policies 数组顺序保持一致，二者共同决定卡片区与抽屉左导航的展示顺序）。
const stage3NavItems: { key: Stage3PolicyKey; nameKey: string; functional: boolean }[] = [
  { key: 'content', nameKey: 'pipeline.content', functional: true },
  { key: 'attachment', nameKey: 'pipeline.attachment', functional: true },
  { key: 'url', nameKey: 'pipeline.url', functional: true },
  { key: 'intentEngine', nameKey: 'pipeline.intentEngine', functional: true },
];

export const stage5NavItems: { key: Stage5PolicyKey; nameKey: string; functional: boolean }[] = [
  // D-8: 左导航名沿用模块内标题「相似邮件与主题检测」(similarDetection.title)，与流水线卡片/
  // 抽屉面包屑子标题「相似检测」(pipeline.similarDetection) 刻意不同 —— demo 三层命名各异。
  { key: 'similarDetection', nameKey: 'similarDetection.title', functional: true },
  { key: 'advancedRules', nameKey: 'pipeline.advancedRules', functional: true },
  { key: 'mailMarking', nameKey: 'pipeline.mailMarking', functional: true },
];

// GT-12160：1024–1365px 的配置抽屉固定为 560px。窄抽屉保留图标导航，
// 把可用宽度优先给配置表单；更大视口恢复原有 80vw 抽屉和完整导航。
// 导出该断点约束，防止后续样式调整重新引入横向溢出。
export const pipelineDrawerResponsiveClasses = {
  sheet: 'data-[side=right]:w-[calc(100vw-2rem)] min-[640px]:data-[side=right]:w-[560px] min-[1366px]:data-[side=right]:w-[80vw] min-[1366px]:data-[side=right]:max-w-[1400px]',
  expandedNav: 'w-14 min-[1366px]:w-[200px]',
  expandedNavLabel: 'hidden min-[1366px]:block',
} as const;

/**
 * The colour key for the pipeline diagram. Every action the gateway can take on
 * a message appears here, ordered from the most permissive outcome to the least.
 * Exported so a test can hold it to the six actions the rule engine actually
 * supports (GT-11894 shipped four).
 */
export const actionLegendItems: {
  key: 'deliver' | 'tagDeliver' | 'quarantine' | 'review' | 'block' | 'drop';
  color: string;
  labelKey: string;
  descKey: string;
}[] = [
  { key: 'deliver', color: 'var(--action-deliver)', labelKey: 'pipeline.actionDeliver', descKey: 'pipeline.actionDeliverDesc' },
  { key: 'tagDeliver', color: 'var(--action-mark-deliver)', labelKey: 'pipeline.actionTagDeliver', descKey: 'pipeline.actionTagDeliverDesc' },
  { key: 'quarantine', color: 'var(--action-quarantine)', labelKey: 'pipeline.actionQuarantine', descKey: 'pipeline.actionQuarantineDesc' },
  { key: 'review', color: 'var(--action-review)', labelKey: 'pipeline.actionReview', descKey: 'pipeline.actionReviewDesc' },
  { key: 'block', color: 'var(--action-block)', labelKey: 'pipeline.actionBlock', descKey: 'pipeline.actionBlockDesc' },
  { key: 'drop', color: 'var(--action-drop)', labelKey: 'pipeline.actionDrop', descKey: 'pipeline.actionDropDesc' },
];

/**
 * Strategy pipeline belongs to the tenant-management surface in a
 * multi-tenant deployment. A platform administrator may enter that surface by
 * impersonating a tenant, while their authenticated role remains
 * `system_admin`; authorization must therefore use the resolved viewer rather
 * than the raw authenticated role alone.
 */
export function canAccessPolicyPipeline({
  multiTenant,
  effectiveViewer,
  isSystemAdmin,
  isTenantAdmin,
}: {
  multiTenant: boolean;
  effectiveViewer: Viewer;
  isSystemAdmin: boolean;
  isTenantAdmin: boolean;
}): boolean {
  if (multiTenant && effectiveViewer === 'platform') return false;
  return isSystemAdmin || isTenantAdmin || effectiveViewer === 'tenant';
}

export function PolicyPipelinePage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSystemAdmin, user } = useAuth();
  const isTenantAdmin = user?.role === 'tenant_admin';
  // switcherEnabled：高级过滤规则暂不对外露出，仅在产品形态切换器
  // （OSGATEWAY_PRODUCT_FORM_SWITCHER=true，演示/开发环境）开启时渲染
  // 阶段5的该卡片与抽屉导航项（智能分析层的仿冒/威胁回溯同一门控，
  // 由 useAgentCenterOverview 统一过滤）。
  const { capabilities, switcherEnabled } = useProductForm();
  const { effectiveViewer } = useSecurityScope(null);
  const caps = capabilities ?? { ai: false, multiTenant: false, saas: false };
  const overviewQuery = useAgentCenterOverview();
  const aiStagePolicies: PipelinePolicy[] = (overviewQuery.data?.agents ?? [])
    .filter((card) => card.access !== 'hidden')
    .map((card): PipelinePolicy | null => {
      const presentation = resolveAgentPresentation(card);
      if (!presentation) return null;
      return {
        key: presentation.pipelineKey,
        nameKey: presentation.pipelineNameKey,
        descKey: presentation.pipelineDescKey,
        type: presentation.pipelineType,
        functional: true,
        locked: !presentation.canConfigure,
        href: presentation.configHref,
      };
    })
    .filter((policy): policy is PipelinePolicy => policy !== null);
  const showAIStage = aiStagePolicies.length > 0;
  // GT-11636: 多租户形态 + 租户视角下，阶段1 IP策略由平台统一管控
  const lockStage1 = caps.multiTenant && effectiveViewer === 'tenant';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDrawerPolicy, setActiveDrawerPolicy] = useState<{ stage: 1 | 2 | 3 | 5; key: string }>({ stage: 1, key: 'ipFrequency' });
  // 处置依据规则名深链跳转（GT-附件沙箱）：附件安全检测抽屉打开后，还需要在
  // 「反病毒引擎/附件沙箱检测/图片识别/加密附件」等页签中定位到具体的一个，
  // 例如从邮件处置详情页点击「附件沙箱检测」规则名跳转过来时应直接停在该页签。
  const [attachmentInitialTab, setAttachmentInitialTab] = useState<string | undefined>(undefined);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [intentDirty, setIntentDirty] = useState(false);
  // html_spec 宿主对齐（Task 10）：意图引擎左导航圆点/摘要跟随总开关启用态（同 url 模块模式）
  const [intentEngineEnabled, setIntentEngineEnabled] = useState<boolean | undefined>(undefined);
  const [similarDirty, setSimilarDirty] = useState(false);
  // html_spec §2.2-5：URL检测与防护显式保存 —— 未保存关抽屉需确认
  const [urlDirty, setUrlDirty] = useState(false);
  // GT-12105：海外邮件检测抽屉的未保存确认与其它模块共用同一套机制。
  const [overseasDirty, setOverseasDirty] = useState(false);
  // html_spec §2.2-2/§2.2-3：URL 左导航圆点/摘要跟随模块启用态（含未保存草稿）
  const [urlModuleEnabled, setUrlModuleEnabled] = useState<boolean | undefined>(undefined);
  const [attachmentDirty, setAttachmentDirty] = useState(false);
  const [attachmentEnabled, setAttachmentEnabled] = useState<boolean | undefined>(undefined);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [pendingDrawerPolicy, setPendingDrawerPolicy] = useState<{ stage: 1 | 2 | 3 | 5; key: string } | null>(null);
  // 抽屉导航折叠按钮的 pointer 驱动 hover（柔和交互反馈规格 §7.2，兼容 hover:none 设备）。
  const { pointerHoverProps: collapseHoverProps } = usePointerHover<HTMLButtonElement>();

  // 处置依据规则名深链跳转：邮件处置详情页的「附件沙箱检测」规则名会带
  // ?stage3=attachment&stage3Tab=sandboxRules 打开本页。落地时自动展开
  // 阶段3「附件安全检测」抽屉，并把内部页签定位到「附件沙箱检测」。
  // 仅在首次挂载时读取一次，避免用户手动切换抽屉/页签后被 query 参数覆盖。
  useEffect(() => {
    const stage3Key = searchParams.get('stage3');
    const stage3Tab = searchParams.get('stage3Tab');
    if (stage3Key) {
      setActiveDrawerPolicy({ stage: 3, key: stage3Key });
      setDrawerOpen(true);
    }
    if (stage3Tab) {
      setAttachmentInitialTab(stage3Tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { apiRequest } = useApiRequest();

  // F10: stage5 综合策略抽屉宿主对齐 — 左导航启用圆点 + 页级
  // 综合策略开关状态（阶段5 各子模块是否被总开关关停）的数据源。仅在抽屉处于阶段5时取数;
  // 开关本身的 UI 入口（ComprehensiveStrategyHeader）已随原型改版移除，这里只读不写。
  // (`enabled` gate)，不影响阶段1/2/3；其余阶段完全不读取这些 query。
  const stage5Active = drawerOpen && activeDrawerPolicy.stage === 5;

  const { data: advancedRulesEnabledResp } = useQuery({
    queryKey: ['advanced-rules', 'enabled'],
    queryFn: () => getModuleEnabled(apiRequest),
    enabled: stage5Active,
  });
  const advancedRulesEnabled = advancedRulesEnabledResp?.enabled ?? true;

  // GT-12076: the advanced-rules pipeline card must reflect its real configured
  // state — html_spec §2.1-4 shows「配置」once rules exist and「去配置」only while
  // the tenant has none. It was hardcoded unconfigured, so it kept showing
  // 「去配置」even after rules were added. Fetch the tenant's advanced rules and
  // derive the card state from whether any exist.
  const { data: advancedRulesList } = useQuery({
    queryKey: ['advanced-rules', 'list'],
    queryFn: () => listAdvancedRules(apiRequest),
    // 卡片被切换器门控隐藏时不再取数（该 query 只喂卡片的配置态）。
    enabled: switcherEnabled,
  });
  const advancedRulesUnconfigured = (advancedRulesList?.length ?? 0) === 0;

  // similarDetection's module-level enable/disable is managed via the same
  // /security/modules API that ModuleMasterSwitch uses (the page wraps itself
  // in <ModuleMasterSwitch page="similar_detection">). The SimilarDetectionConfig
  // object exposed by GET /security/similar-detection does NOT carry the enabled
  // flag -- it's a config_overrides-level toggle, same as advanced_rules.
  // GT-12731：该映射不仅供 stage5 圆点使用，还作为 stage3（url/attachment/intentEngine）
  // 左导航圆点/摘要在子页真实启用态加载完成前的「兜底真值」，避免默认按启用渲染再闪回。
  // 因此不再用 stage5Active 门控——抽屉一打开就取数，让 stage3 首帧也能拿到真值。
  const { data: securityModulesMap } = useQuery({
    queryKey: ['security-modules'],
    queryFn: () => getSecurityModules(apiRequest),
    enabled: drawerOpen,
  });
  const similarDetectionEnabled = securityModulesMap?.similar_detection ?? true;
  const comprehensiveStrategyEnabled = securityModulesMap?.comprehensive_strategy ?? true;
  // html_spec §2.3-13 对齐：左导航「相似邮件与主题检测」摘要=「窗口{N}分钟 / 阈值{M}%」，
  // 取自当前生效方向组（mode==='separate' 取 similar_email.receive，'aggregate' 取 aggregate）。
  // 同 advancedRulesEnabledResp/securityModulesMap，仅在抽屉处于阶段5时取数。
  // 刷新按钮：让本页四类查询全部失效重取（原型只在 demo 里有 queryClient，
  // 产品这边���显式取一个）。
  const queryClient = useQueryClient();
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['agent-center-overview'] });
    queryClient.invalidateQueries({ queryKey: ['advanced-rules'] });
    queryClient.invalidateQueries({ queryKey: ['security-modules'] });
    queryClient.invalidateQueries({ queryKey: ['similar-detection-config'] });
  }, [queryClient]);

  const { data: similarDetectionConfigResp } = useQuery({
    queryKey: ['similar-detection-config'],
    queryFn: () => getSimilarDetection(apiRequest),
    enabled: stage5Active,
  });
  const similarDetectionNavSummary = similarDetectionConfigResp
    ? t('similarDetection.navSummary', {
        window: similarDetectionConfigResp.mode === 'aggregate'
          ? similarDetectionConfigResp.aggregate.window_minutes
          : similarDetectionConfigResp.similar_email.receive.window_minutes,
        threshold: similarDetectionConfigResp.mode === 'aggregate'
          ? similarDetectionConfigResp.aggregate.similarity_pct
          : similarDetectionConfigResp.similar_email.receive.similarity_pct,
      })
    : undefined;

  // mailMarking exposes no module-level enable/disable API at all (grepped
  // src/lib/api/mail-marking.ts + MailMarkingPage.tsx) — no nav dot, and the
  // header renders as always-on/non-interactive for this policy.
  // Similar detection and mail marking share the security-modules endpoint;
  // their navigation dots must reflect the same source as each page-level
  // ModuleMasterSwitch.
  const stage5EnabledByKey: Partial<Record<Stage5PolicyKey, boolean>> = {
    ...(advancedRulesEnabledResp ? { advancedRules: advancedRulesEnabled && comprehensiveStrategyEnabled } : {}),
    ...(securityModulesMap ? { similarDetection: similarDetectionEnabled && comprehensiveStrategyEnabled } : {}),
    ...(securityModulesMap ? { mailMarking: (securityModulesMap.mail_marking ?? true) && comprehensiveStrategyEnabled } : {}),
  };

  const handleDrawerClose = useCallback(() => {
    const isDirty = (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'intentEngine' && intentDirty)
      || (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'url' && urlDirty)
      || (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'attachment' && attachmentDirty)
      || (activeDrawerPolicy.stage === 1 && activeDrawerPolicy.key === 'overseas' && overseasDirty)
      || (activeDrawerPolicy.stage === 5 && activeDrawerPolicy.key === 'similarDetection' && similarDirty);
    if (isDirty) {
      setPendingDrawerPolicy(null);
      setCloseConfirmOpen(true);
    } else {
      setDrawerOpen(false);
    }
  }, [intentDirty, urlDirty, attachmentDirty, overseasDirty, similarDirty, activeDrawerPolicy.stage, activeDrawerPolicy.key, setCloseConfirmOpen, setDrawerOpen, setPendingDrawerPolicy]);

  // Module A is a tenant-management surface in multi-tenant deployments.
  // A system administrator impersonating a tenant retains their system_admin
  // authentication role, so `isSystemAdmin` alone cannot identify platform
  // context. `effectiveViewer` is normalized by useSecurityScope and is the
  // authorization boundary here.
  const scopeAllowed = canAccessPolicyPipeline({
    multiTenant: caps.multiTenant,
    effectiveViewer,
    isSystemAdmin,
    isTenantAdmin,
  });
  // GT-12154: a platform administrator (multi-tenant + platform view) does not
  // belong to any tenant, so the tenant-level policy pipeline route must not
  // merely render an in-place "unauthorized" panel — PRD §0.1/§1.4/§4.2 requires
  // 403 / redirect / hidden entry. Mirror the mail-routing page (redirect to the
  // tenant center) so a direct-URL visit is bounced off the tenant route rather
  // than lingering on it. Other (non-platform) blocked cases keep the panel.
  const platformScopeBlocked = !scopeAllowed && caps.multiTenant && effectiveViewer === 'platform';
  useEffect(() => {
    if (platformScopeBlocked) {
      router.replace('/tenants');
    }
  }, [platformScopeBlocked, router]);
  if (!scopeAllowed) {
    if (platformScopeBlocked) {
      // Redirecting via the effect above; render nothing so the pipeline never
      // flashes for a platform administrator.
      return null;
    }
    return (
      <PageShell>
        <PageHeader title={t('pipeline.title')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {t('common.notAuthorized')}
        </div>
      </PageShell>
    );
  }

  const comprehensiveStageNameKey = showAIStage ? 'pipeline.phase5Comprehensive' : 'pipeline.phase4Comprehensive';
  // F10: 综合策略实际是阶段4还是阶段5取决于阶段4「智能分析层」是否展示
  // (showAIStage) —— 与 comprehensiveStageNameKey 的选择同一依据，供面包屑用。
  const comprehensiveStageNumber = showAIStage ? 5 : 4;
  const aiStages: PipelineStage[] = showAIStage ? [{
    key: 'stage4',
    nameKey: 'pipeline.phase4AI',
    bgClass: 'bg-[#F6F0FF] dark:bg-purple-950/30',
    borderClass: 'border-x-0',
    policies: aiStagePolicies,
  }] : [];
  const stages: PipelineStage[] = [
    {
      key: 'stage1',
      nameKey: 'pipeline.phase1IP',
      bgClass: '',
      borderClass: 'rounded-l-lg border-r-0',
      locked: lockStage1,
      // html_spec §3.1 对齐：IP 频率/黑白名单/RBL 命中即阻断退信 → blocking（红）；
      // 海外邮件检测尚未配置 → configurable + unconfigured（灰色虚线 / 去配置）。
      policies: lockStage1 ? [] : [
        { key: 'ipFrequency', nameKey: 'pipeline.ipFrequency', descKey: 'pipeline.ipFrequencyDesc', type: 'blocking', functional: true },
        { key: 'ipFilter', nameKey: 'pipeline.ipFilter', descKey: 'pipeline.ipFilterDesc', type: 'blocking', functional: true },
        { key: 'rbl', nameKey: 'pipeline.rbl', descKey: 'pipeline.rblDesc', type: 'blocking', functional: true },
        { key: 'overseas', nameKey: 'pipeline.overseas', descKey: 'pipeline.overseasDesc', type: 'configurable', functional: true, unconfigured: true },
      ],
    },
    {
      key: 'stage2',
      nameKey: 'pipeline.phase2Sender',
      bgClass: '',
      borderClass: 'border-x-0',
      // html_spec §3.1 对齐：黑白名单为例外放行 → exception（绿）；身份认证与仿冒检测
      // 强制阻断 → forced（红）；发信行为管控/收信人检测隔离 → configurable（橙）。
      policies: [
        { key: 'senderFilter', nameKey: 'pipeline.senderFilter', descKey: 'pipeline.senderFilterDesc', type: 'exception', functional: true },
        { key: 'authSpoofing', nameKey: 'pipeline.authSpoofing', descKey: 'pipeline.authSpoofingDesc', type: 'forced', functional: true },
        { key: 'behaviorControl', nameKey: 'pipeline.behaviorControl', descKey: 'pipeline.behaviorControlDesc', type: 'configurable', functional: true },
        { key: 'recipientCheck', nameKey: 'pipeline.recipientCheck', descKey: 'pipeline.recipientCheckDesc', type: 'configurable', functional: true },
        { key: 'userList', nameKey: 'pipeline.userBlackWhiteList', descKey: 'pipeline.userListDesc', type: 'exception', functional: true },
      ],
    },
    {
      key: 'stage3',
      nameKey: 'pipeline.phase3Content',
      bgClass: '',
      borderClass: 'border-x-0',
      // html_spec §3.1 对齐：附件/URL/内容规则隔离 → configurable（橙）；意图引擎强制 → forced（红）。
      // GT-12938：内容规则调整到附件安全上方，成为阶段3的第一项策略。
      policies: [
        { key: 'content', nameKey: 'pipeline.content', descKey: 'pipeline.contentDesc', type: 'configurable', functional: true },
        { key: 'attachment', nameKey: 'pipeline.attachment', descKey: 'pipeline.attachmentDesc', type: 'configurable', functional: true },
        { key: 'url', nameKey: 'pipeline.url', descKey: 'pipeline.urlDesc', type: 'configurable', functional: true },
        { key: 'intentEngine', nameKey: 'pipeline.intentEngine', descKey: 'pipeline.intentEngineDesc', type: 'forced', functional: true },
      ],
    },
    ...aiStages,
    {
      key: 'stage5',
      nameKey: comprehensiveStageNameKey,
      bgClass: 'bg-[#F5F5F5] dark:bg-gray-900',
      borderClass: 'rounded-r-lg border-l-0',
      // html_spec §3.1 对齐：相似检测/邮件标记隔离 → configurable（橙）；高级过滤规则尚未配置
      // → configurable + unconfigured（灰色虚线 / 去配置）。
      policies: [
        { key: 'similarDetection', nameKey: 'pipeline.similarDetection', descKey: 'pipeline.similarDetectionDesc', type: 'configurable', functional: true },
        ...(switcherEnabled ? [{ key: 'advancedRules', nameKey: 'pipeline.advancedRules', descKey: 'pipeline.advancedRulesDesc', type: 'configurable', functional: true, unconfigured: advancedRulesUnconfigured } as PipelinePolicy] : []),
        { key: 'mailMarking', nameKey: 'pipeline.mailMarking', descKey: 'pipeline.mailMarkingDesc', type: 'configurable', functional: true },
      ],
    },
  ];

  const handleCardClick = (policy: PipelinePolicy) => {
    if (policy.locked) {
      return;
    }
    if (policy.href) {
      router.push(policy.href);
      return;
    }
    if (policy.key === 'senderFilter') {
      setActiveDrawerPolicy({ stage: 2, key: 'senderFilter' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'ipFrequency') {
      setActiveDrawerPolicy({ stage: 1, key: 'ipFrequency' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'ipFilter') {
      setActiveDrawerPolicy({ stage: 1, key: 'ipFilter' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'rbl') {
      setActiveDrawerPolicy({ stage: 1, key: 'rbl' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'overseas') {
      setActiveDrawerPolicy({ stage: 1, key: 'overseas' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'authSpoofing') {
      setActiveDrawerPolicy({ stage: 2, key: 'authSpoofing' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'behaviorControl') {
      setActiveDrawerPolicy({ stage: 2, key: 'behaviorControl' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'recipientCheck') {
      setActiveDrawerPolicy({ stage: 2, key: 'recipientCheck' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'userList') {
      setActiveDrawerPolicy({ stage: 2, key: 'userList' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'content') {
      setActiveDrawerPolicy({ stage: 3, key: 'content' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'attachment') {
      setActiveDrawerPolicy({ stage: 3, key: 'attachment' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'url') {
      setActiveDrawerPolicy({ stage: 3, key: 'url' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'intentEngine') {
      setActiveDrawerPolicy({ stage: 3, key: 'intentEngine' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'similarDetection') {
      setActiveDrawerPolicy({ stage: 5, key: 'similarDetection' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'mailMarking') {
      setActiveDrawerPolicy({ stage: 5, key: 'mailMarking' });
      setDrawerOpen(true);
      return;
    }
    if (policy.key === 'advancedRules') {
      setActiveDrawerPolicy({ stage: 5, key: 'advancedRules' });
      setDrawerOpen(true);
      return;
    }
    if (!policy.functional) {
      toast.info(t('pipeline.comingSoon'));
    }
  };

  const renderPolicyCard = (policy: PipelinePolicy) => {
    const locked = policy.locked === true;
    // html_spec §2.1-7：未配置态 —— 橙色虚线边框 + 灰色色条 + 「去配置」，仍可点击进入配置。
    const isUnconfigured = policy.unconfigured === true && !locked;

    return (
      // GT-12094: 策略卡片悬浮 Tooltip（策略说明），对齐 策略流水线需求文档 §3。
      // 卡片本体的交互反馈（pointer hover / 键盘 / locked）收敛在 PipelinePolicyCard。
      <TooltipProvider key={policy.key} delay={300}>
      <Tooltip>
        <PipelinePolicyCard
          policy={policy}
          barColor={isUnconfigured
            ? typeColors.unconfigured
            : policy.key === 'mailMarking'
              ? 'var(--action-mark-deliver)'
              : typeColors[policy.type]}
          onActivate={() => handleCardClick(policy)}
        />
        <TooltipContent
          side="top"
          className="max-w-[260px] text-xs"
          data-testid={`pipeline-policy-tooltip-${policy.key}`}
        >
          {policy.key === 'intentEngine' ? (
            // 意图引擎一期只支持分类优先：CAC 返回单一 winning intent，未暴露可配置的
            // 置信度分数，因此 Tooltip 必须说明实际的分类匹配与处置语义，不能沿用原型
            // 中已删除的分段阈值或其他 forced 策略的「阻断」文案。
            <div className="space-y-0.5">
              <div>{t('pipeline.policyTooltipPolicy')}：{t(policy.nameKey)}</div>
              <div>{t('pipeline.policyTooltipAction')}：{t('pipeline.intentEngineTooltipAction')}</div>
              <div>{t('pipeline.policyTooltipEffect')}：{t('pipeline.intentEngineTooltipEffect')}</div>
            </div>
          ) : policy.key === 'url' || policy.key === 'similarDetection' ? (
            // html_spec §2.1-4 / Task 13 L0-a：url、相似检测 两卡复合 Tooltip（策略/动作/效果/
            // 隔离区跳转说明，文案与动作组合逐字匹配 demo），其余卡保持单行描述（各自 spec 范围）。
            <div className="space-y-0.5">
              <div>{t('pipeline.policyTooltipPolicy')}：{t(policy.nameKey)}</div>
              <div>{t('pipeline.policyTooltipAction')}：{t('pipeline.actionQuarantineAction')}、{t('pipeline.actionDeliver')}</div>
              <div>{t('pipeline.policyTooltipEffect')}：{t('pipeline.policyEffectQuarantine')}</div>
              <div className="opacity-80">{t('pipeline.quarantineModuleLink')}</div>
            </div>
          ) : policy.key === 'rbl' ? (
            <div className="space-y-0.5">
              <div>{t('pipeline.policyTooltipPolicy')}：{t(policy.descKey)}</div>
              <div>{t('pipeline.policyTooltipAction')}：{t('pipeline.actionBlock')}（{t('pipeline.actionBlockDesc')}）</div>
              <div>{t('pipeline.policyTooltipEffect')}：{t('pipeline.flowTerminate')}（{t('pipeline.flowTerminateDesc')}）</div>
            </div>
          ) : policy.key === 'mailMarking' ? (
            <div className="space-y-0.5">
              <div>{t('pipeline.policyTooltipPolicy')}：{t(policy.nameKey)}</div>
              <div>{t('pipeline.policyTooltipAction')}：{t('pipeline.actionTagDeliver')}</div>
              <div>{t('pipeline.policyTooltipEffect')}：{t('pipeline.mailMarkingDesc')}</div>
            </div>
          ) : policy.key === 'advancedRules' ? (
            // 高级过滤规则不再退化为一行 description。卡片 Tooltip 必须给出
            // 策略、当前启用状态、配置入口语义和命中效果四项信息（GT-12190）。
            <div className="space-y-0.5">
              <div>{t('pipeline.policyTooltipPolicy')}：{t(policy.nameKey)}</div>
              <div>{t('pipeline.policyTooltipAction')}：{advancedRulesEnabled ? t('pipeline.comprehensiveEnabled') : t('pipeline.comprehensiveDisabled')}</div>
              <div>{t('pipeline.policyTooltipEffect')}：{t('pipeline.advancedRulesSummary')}</div>
              <div className="opacity-80">{t('pipeline.advancedRulesDesc')}</div>
            </div>
          ) : policy.key === 'content' ? (
            <div className="space-y-1 leading-5">
              <div className="font-semibold">{t('contentRules.cardTooltipStrategy')}</div>
              <div>{t('contentRules.cardTooltipActions')}</div>
              <div>{t('contentRules.cardTooltipEffect')}</div>
              <div>{t('contentRules.cardTooltipQuarantineHint')}</div>
            </div>
          ) : (
            // 修复：此前该分支与上面的 'content' 分支各自独立 ternary 并列渲染，导致
            // intentEngine/url/content 之外的所有卡片（含本次的 similarDetection 修复前）
            // descKey 单行描述被渲染两遍（同一 Tooltip 内文案重复）。合并为单一 ternary 链后
            // 每张卡只命中一个分支，不再重复。
            t(policy.descKey)
          )}
        </TooltipContent>
      </Tooltip>
      </TooltipProvider>
    );
  };

  // html_spec §3.2 对齐：阶段间箭头由该阶段内策略类型推导 —— 含 blocking/forced → 阻断(红)；
  // 否则含 configurable → 隔离(橙)；否则 → 继续(绿)。
  const getStageFlow = (stage: PipelineStage): 'terminate' | 'quarantine' | 'continue' => {
    const types = stage.policies.map((p) => p.type);
    if (types.some((tp) => tp === 'blocking' || tp === 'forced')) return 'terminate';
    if (types.some((tp) => tp === 'configurable')) return 'quarantine';
    return 'continue';
  };

  const renderStageArrow = (stage: PipelineStage) => {
    const flow = getStageFlow(stage);
    const flowMeta = {
      terminate: { color: 'var(--action-block)', label: t('pipeline.flowTerminateShort') },
      quarantine: { color: 'var(--action-quarantine)', label: t('pipeline.flowQuarantineShort') },
      continue: { color: 'var(--action-deliver)', label: t('pipeline.flowContinueShort') },
    }[flow];
    return (
      <div className="flex flex-col items-center justify-center px-1 min-w-[40px]" data-testid={`pipeline-stage-arrow-${stage.key}-${flow}`}>
        <ArrowRight className="h-5 w-5" style={{ color: flowMeta.color }} />
        <span className="text-[10px] mt-0.5" style={{ color: flowMeta.color }}>{flowMeta.label}</span>
      </div>
    );
  };

  // 高级过滤规则随卡片同一门控从抽屉左导航隐藏（stage5NavItems 常量保持
  // 完整顺序，供单测/其它消费方引用）。
  const visibleStage5NavItems = switcherEnabled ? stage5NavItems : stage5NavItems.filter((item) => item.key !== 'advancedRules');
  const navItems = activeDrawerPolicy.stage === 5 ? visibleStage5NavItems : activeDrawerPolicy.stage === 3 ? stage3NavItems : activeDrawerPolicy.stage === 2 ? stage2NavItems : stage1NavItems;
  // html_spec §2.1-2 对齐面包屑：IP 抽屉保持「IP策略」（无编号，同 demo connection.title），
  // 阶段2/3/5 抽屉带「阶段N: 」前缀。
  const navStageLabel = activeDrawerPolicy.stage === 5
    ? t('pipeline.stageTitleFormat', { n: comprehensiveStageNumber, name: t(comprehensiveStageNameKey) })
    : activeDrawerPolicy.stage === 3
      ? t('pipeline.stageTitleFormat', { n: 3, name: t('pipeline.phase3Content') })
      : activeDrawerPolicy.stage === 2
        ? t('pipeline.stageTitleFormat', { n: 2, name: t('pipeline.phase2Sender') })
        : t('pipeline.phase1IP');

  const isNavActive = (key: string) => activeDrawerPolicy.key === key;

  const currentDrawerIsDirty = (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'intentEngine' && intentDirty)
    || (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'url' && urlDirty)
    || (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'attachment' && attachmentDirty)
    || (activeDrawerPolicy.stage === 1 && activeDrawerPolicy.key === 'overseas' && overseasDirty)
    || (activeDrawerPolicy.stage === 5 && activeDrawerPolicy.key === 'similarDetection' && similarDirty);

  const requestDrawerPolicy = (next: { stage: 1 | 2 | 3 | 5; key: string }) => {
    if (next.stage === activeDrawerPolicy.stage && next.key === activeDrawerPolicy.key) return;
    if (currentDrawerIsDirty) {
      setPendingDrawerPolicy(next);
      setCloseConfirmOpen(true);
      return;
    }
    setActiveDrawerPolicy(next);
  };

  // html_spec §2.3-13 对齐：抽屉左导航每个模块名下显示一行摘要（demo 的「阈值: 100次/分钟」
  // 「黑名单: 33条 / 白名单: 22条」等）。webapp 复用各模块既有的描述文案（四语齐全，随
  // 模块能力演进；不伪造静态计数）。stage5 的启用圆点数据源见 stage5EnabledByKey above。
  const navSummaryKey: Record<string, string> = {
    // 阶段1 IP策略
    ipFrequency: 'pipeline.ipFrequencyDesc',
    ipFilter: 'pipeline.ipFilterDesc',
    rbl: 'pipeline.rblDesc',
    overseas: 'pipeline.overseasDesc',
    // 阶段2 收发信人策略
    senderFilter: 'pipeline.senderFilterDesc',
    authSpoofing: 'pipeline.authSpoofingDesc',
    behaviorControl: 'pipeline.behaviorControlDesc',
    recipientCheck: 'pipeline.recipientCheckDesc',
    userList: 'pipeline.userListDesc',
    // 阶段3 内容层（url/intentEngine 项为动态摘要，见 renderNavItems —— html_spec §2.2-2 / Task 10）
    attachment: 'pipeline.attachmentNavSummary',
    content: 'pipeline.contentNavSummary',
    // 阶段5 综合策略
    similarDetection: 'pipeline.similarDetectionDesc',
    advancedRules: 'pipeline.advancedRulesSummary',
    mailMarking: 'pipeline.mailMarkingDesc',
  };

  const renderNavItems = navItems.map((item) => {
    const isActive = isNavActive(item.key);
    const isStage5 = activeDrawerPolicy.stage === 5;
    // stage1/2/3: unchanged, always item.functional (true for every current item);
    // 例外 url：圆点跟随模块启用态（含未保存草稿，html_spec §2.2-3）。
    // stage5: real enabled state when known (advancedRules/similarDetection),
    // else falls back to item.functional (mailMarking — no enabled API, see above).
    const stage5Enabled = isStage5 ? stage5EnabledByKey[item.key as Stage5PolicyKey] : undefined;
    // GT-12731：stage3（url/attachment/intentEngine）在对应子页把真实启用态回传前，
    // 本地状态为 undefined。此前会退回 item.functional（恒 true），使「未启用」模块的
    // 圆点先亮起、子页加载完成后再闪回熄灭。改为优先用父级预取的 securityModulesMap
    // 作为加载期兜底真值，让首帧就正确。子页回传后（含未保存草稿）本地状态优先。
    const stage3ModuleKey: Record<string, SecurityModulePage> = {
      url: 'url_protection',
      attachment: 'attachment_security',
      intentEngine: 'intent_engine',
    };
    const stage3Fallback = stage3ModuleKey[item.key] !== undefined
      ? securityModulesMap?.[stage3ModuleKey[item.key]]
      : undefined;
    const urlEnabled = item.key === 'url' ? (urlModuleEnabled ?? stage3Fallback) : undefined;
    const attachmentModuleEnabled = item.key === 'attachment' ? (attachmentEnabled ?? stage3Fallback) : undefined;
    // html_spec 宿主对齐（Task 10）：意图引擎圆点跟随总开关启用态，同 url 模块模式。
    const intentEnabled = item.key === 'intentEngine' ? (intentEngineEnabled ?? stage3Fallback) : undefined;
    const dotOn = stage5Enabled !== undefined ? stage5Enabled
      : urlEnabled !== undefined ? urlEnabled
      : attachmentModuleEnabled !== undefined ? attachmentModuleEnabled
      : intentEnabled !== undefined ? intentEnabled
      : item.functional;
    // html_spec §2.2-2：url 摘要 启用=「信誉评估/沙箱分析/仿冒检测」，禁用=「未启用」
    // 意图引擎摘要 启用=「涉黄赌/涉政/钓鱼/垃圾/订阅」，禁用=「未启用」（Task 10）
    // 相似检测摘要 启用=「窗口{N}分钟 / 阈值{M}%」（Task 13），禁用=「已禁用」（复用 common.disabled，
    // demo D-8 未新造 key）；配置 query 未就绪前退回静态描述文案，避免摘要闪烁。
    // GT-12731：摘要的启用/未启用判断同样以「本地状态 ?? 父级兜底真值」为准，
    // 使加载期首帧就显示正确��摘要（未启用模块直接显示「未启用」，不再先显示能力摘要再闪回）。
    const urlEnabledForSummary = urlModuleEnabled ?? (item.key === 'url' ? stage3Fallback : undefined);
    const attachmentEnabledForSummary = attachmentEnabled ?? (item.key === 'attachment' ? stage3Fallback : undefined);
    const intentEnabledForSummary = intentEngineEnabled ?? (item.key === 'intentEngine' ? stage3Fallback : undefined);
    const summaryText = item.key === 'url'
      ? (urlEnabledForSummary === false ? t('pipeline.urlNavSummaryDisabled') : t('pipeline.urlNavSummary'))
      : item.key === 'attachment'
        ? (attachmentEnabledForSummary === false ? t('securityModules.disabled') : t('pipeline.attachmentNavSummary'))
      : item.key === 'intentEngine'
        ? (intentEnabledForSummary === false ? t('pipeline.intentEngineNavSummaryDisabled') : t('pipeline.intentEngineNavSummary'))
        : item.key === 'similarDetection'
          ? (similarDetectionEnabled === false
              ? t('common.disabled')
              : similarDetectionNavSummary ?? t(navSummaryKey.similarDetection))
          : navSummaryKey[item.key]
            ? t(navSummaryKey[item.key])
            : undefined;
    return (
      <PipelineDrawerNavButton
        key={item.key}
        testid={`pipeline-drawer-nav-${item.key}`}
        name={t(item.nameKey)}
        summary={summaryText}
        comingSoonLabel={!item.functional ? t('pipeline.comingSoon') : undefined}
        dotOn={dotOn}
        isActive={isActive}
        collapsed={navCollapsed}
        labelClassName={pipelineDrawerResponsiveClasses.expandedNavLabel}
        onSelect={() => requestDrawerPolicy({ stage: activeDrawerPolicy.stage, key: item.key })}
      />
    );
  });

  const drawerTitle = (() => {
    if (activeDrawerPolicy.stage === 2) {
      if (activeDrawerPolicy.key === 'senderFilter') return t('pipeline.senderFilterConfig');
      if (activeDrawerPolicy.key === 'authSpoofing') return t('pipeline.authSpoofingConfig');
      if (activeDrawerPolicy.key === 'behaviorControl') return t('behaviorControl.title');
      if (activeDrawerPolicy.key === 'recipientCheck') return t('pipeline.recipientCheck');
      if (activeDrawerPolicy.key === 'userList') return t('pipeline.userBlackWhiteList');
    }
    if (activeDrawerPolicy.stage === 3) {
      if (activeDrawerPolicy.key === 'content') {
        return `${t('pipeline.stageTitleFormat', { n: 3, name: t('pipeline.phase3Content') })} / ${t('contentRules.title')}`;
      }
      if (activeDrawerPolicy.key === 'attachment') {
        return t('pipeline.comprehensiveBreadcrumb', {
          stage: 3,
          stageName: t('pipeline.phase3Content'),
          policyName: t('attachmentSecurity.title'),
        });
      }
      // html_spec §2.2-1：url 抽屉头部为「阶段3: 内容层 / URL检测与防护」面包屑
      //（其余 stage3 模块的标题格式留待各自 spec 对齐）。
      if (activeDrawerPolicy.key === 'url') {
        return t('pipeline.comprehensiveBreadcrumb', {
          stage: 3,
          stageName: t('pipeline.phase3Content'),
          policyName: t('urlProtection.title'),
        });
      }
    }
    // html_spec 宿主对齐（Task 10）：意图引擎抽屉头部同 url 对齐为「阶段3: 内容层 / 意图引擎」面包屑。
    if (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'intentEngine') {
      return t('pipeline.comprehensiveBreadcrumb', {
        stage: 3,
        stageName: t('pipeline.phase3Content'),
        policyName: t('intentEngine.title'),
      });
    }
    // F10: stage5 面包屑补「阶段N: 综合策略 / {策略名}」前缀（§3.1），
    // {策略名} 沿用各分支原有文案，未改变其取值。
    if (activeDrawerPolicy.stage === 5 && activeDrawerPolicy.key === 'similarDetection') {
      // D-8: 面包屑子标题=「相似检测」(pipeline.similarDetection)，与配置卡标题「相似邮件与
      // 主题检测」(similarDetection.title) 刻意不同，不要再对齐。
      return t('pipeline.comprehensiveBreadcrumb', {
        stage: comprehensiveStageNumber,
        stageName: t(comprehensiveStageNameKey),
        policyName: t('pipeline.similarDetection'),
      });
    }
    if (activeDrawerPolicy.stage === 5 && activeDrawerPolicy.key === 'mailMarking') {
      return t('pipeline.comprehensiveBreadcrumb', {
        stage: comprehensiveStageNumber,
        stageName: t(comprehensiveStageNameKey),
        policyName: t('pipeline.mailMarking'),
      });
    }
    if (activeDrawerPolicy.stage === 5 && activeDrawerPolicy.key === 'advancedRules') {
      return t('pipeline.comprehensiveBreadcrumb', {
        stage: comprehensiveStageNumber,
        stageName: t(comprehensiveStageNameKey),
        policyName: t('pipeline.advancedRules'),
      });
    }
    if (activeDrawerPolicy.key === 'ipFrequency') return t('pipeline.ipFrequencyConfig');
    if (activeDrawerPolicy.key === 'ipFilter') return t('pipeline.ipFilterConfig');
    if (activeDrawerPolicy.key === 'rbl') return t('pipeline.rblConfig');
    if (activeDrawerPolicy.key === 'overseas') return t('pipeline.overseasConfig');
    return '';
  })();

  const drawerContent = (() => {
    if (activeDrawerPolicy.stage === 2 && activeDrawerPolicy.key === 'senderFilter') {
      return <SenderFilterPage embedded />;
    }
    if (activeDrawerPolicy.stage === 2 && activeDrawerPolicy.key === 'authSpoofing') {
      return <AuthSpoofingPage embedded />;
    }
    if (activeDrawerPolicy.stage === 2 && activeDrawerPolicy.key === 'behaviorControl') {
      return <BehaviorControlPage embedded />;
    }
    // GT-11878: 收信人数量限制原先配置在行为管控里；对齐 demo 后行为管控页面移除了
    // 该配置，收信人数量限制现在拥有独立的 RecipientCheckPage。
    if (activeDrawerPolicy.stage === 2 && activeDrawerPolicy.key === 'recipientCheck') {
      return <RecipientCheckPage embedded />;
    }
    if (activeDrawerPolicy.stage === 2 && activeDrawerPolicy.key === 'userList') {
      return <UserListPage embedded />;
    }
    if (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'content') {
      return <ContentRulesPage embedded />;
    }
    if (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'attachment') {
      return (
        <AttachmentSecurityPage
          embedded
          hideBasicLimit={caps.multiTenant && effectiveViewer === 'tenant'}
          onDirtyChange={setAttachmentDirty}
          onEnabledChange={setAttachmentEnabled}
          initialTab={attachmentInitialTab as TabKey | undefined}
        />
      );
    }
    if (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'url') {
      return (
        <UrlProtectionPage
          direction="receive"
          embedded
          onDirtyChange={setUrlDirty}
          onEnabledChange={setUrlModuleEnabled}
        />
      );
    }
    if (activeDrawerPolicy.stage === 3 && activeDrawerPolicy.key === 'intentEngine') {
      return <IntentEnginePage embedded onDirtyChange={setIntentDirty} onEnabledChange={setIntentEngineEnabled} />;
    }
    if (activeDrawerPolicy.stage === 5 && activeDrawerPolicy.key === 'similarDetection') {
      return <SimilarDetectionPage embedded onDirtyChange={setSimilarDirty} />;
    }
    if (activeDrawerPolicy.stage === 5 && activeDrawerPolicy.key === 'mailMarking') {
      return <MailMarkingPage embedded />;
    }
    if (activeDrawerPolicy.stage === 5 && activeDrawerPolicy.key === 'advancedRules') {
      return <AdvancedFilterRulesModule embedded aggregateDisabled={!comprehensiveStrategyEnabled} />;
    }
    if (activeDrawerPolicy.key === 'ipFrequency') return <IPFrequencyPage embedded />;
    if (activeDrawerPolicy.key === 'ipFilter') return <IPFilterPage embedded />;
    if (activeDrawerPolicy.key === 'rbl') return <RBLFilterPage embedded />;
    if (activeDrawerPolicy.key === 'overseas') return <OverseasMailPage embedded onDirtyChange={setOverseasDirty} />;
    return null;
  })();

  const drawerContentOwnsScrolling =
    activeDrawerPolicy.stage === 2 && activeDrawerPolicy.key === 'authSpoofing';

  return (
    <PageShell>
      <PageHeader
        title={t('pipeline.title')}
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t('common.refresh')}
          </Button>
        }
      />

      {lockStage1 && (
        <Alert className="border-primary/20 bg-primary/5">
          <Lock className="h-4 w-4 text-primary" />
          <AlertDescription className="text-foreground text-pretty">
            {t('pipeline.platformManagedAlert')}
          </AlertDescription>
        </Alert>
      )}

      <Card className="rounded-xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">{t('pipeline.executionPipeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-4">
            <div className="flex items-stretch gap-0 min-w-max">
              {stages.map((stage, idx) => (
                <div key={stage.key} className="contents">
                  <div
                    data-testid={`pipeline-stage-${stage.key}`}
                    data-stage-index={idx + 1}
                    className={cn(
                      'flex flex-col min-w-[240px] border border-border/50 p-4',
                      stage.bgClass,
                      stage.borderClass,
                    )}
                  >
                    <div className="mb-3">
                      {/* html_spec §2.1-2：流程列标题带「阶段N: 」前缀（stages 数组顺序即展示序号）。 */}
                      <div className="text-sm font-semibold text-foreground">
                        {t('pipeline.stageTitleFormat', { n: idx + 1, name: t(stage.nameKey) })}
                      </div>
                    </div>
                    {stage.locked ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/50 bg-muted/30 px-3 py-6 text-center">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                        <span className="text-[13px] font-medium text-foreground">{t('pipeline.platformManaged')}</span>
                        <span className="text-[12px] text-muted-foreground text-pretty">{t('pipeline.platformManagedHint')}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 flex-1">
                        {stage.policies.map((policy) => renderPolicyCard(policy))}
                      </div>
                    )}
                  </div>
                  {idx < stages.length - 1 && renderStageArrow(stage)}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-border/50 bg-muted/30 -mx-6 -mb-6 px-6 py-4 rounded-b-[24px]">
            <div className="space-y-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium min-w-[60px]">{t('pipeline.actionLegend')}</span>
                {actionLegendItems.map((item) => (
                  <div key={item.key} data-testid={`action-legend-${item.key}`} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-medium">{t(item.labelKey)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{t(item.descKey)}</span>
                  </div>
                ))}
              </div>
              {/* html_spec §2.2-9：名单类型图例（黑名单 / 白名单）。 */}
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-medium min-w-[60px]">{t('pipeline.listTypeLegend')}</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-1 h-3.5 rounded-full bg-foreground" />
                  <span className="font-medium">{t('pipeline.blacklistType')}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{t('pipeline.blacklistTypeDesc')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1 h-3.5 rounded-full border border-border bg-background" />
                  <span className="font-medium">{t('pipeline.whitelistType')}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{t('pipeline.whitelistTypeDesc')}</span>
                </div>
              </div>
              {/* html_spec §2.2-10：流程控制图例增加「终止」项。 */}
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-medium min-w-[60px]">{t('pipeline.flowControlLegend')}</span>
                <div className="flex items-center gap-1.5">
                  <ArrowRight className="h-4 w-4" style={{ color: 'var(--action-block)' }} />
                  <span className="text-muted-foreground">{t('pipeline.flowTerminateDesc')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ArrowRight className="h-4 w-4 text-action-deliver" />
                  <span className="text-muted-foreground">{t('pipeline.flowContinueDesc')}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={(open) => { if (!open) handleDrawerClose(); else setDrawerOpen(true); }}>
        <SheetContent
          data-testid="pipeline-config-drawer"
          className={cn(pipelineDrawerResponsiveClasses.sheet, 'p-0 flex flex-col')}
          side="right"
          showCloseButton={false}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/70 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <SheetTitle data-testid="pipeline-config-drawer-title" className="text-[18px] font-semibold">
                {drawerTitle}
              </SheetTitle>
            </div>

          </div>

          <TooltipProvider>
          <div className="flex flex-1 overflow-hidden relative">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setNavCollapsed(!navCollapsed)}
                    data-testid="pipeline-drawer-nav-collapse"
                    aria-label={navCollapsed ? t('pipeline.expandNav') : t('pipeline.collapseNav')}
                    className={cn(
                      // 柔和交互反馈规格 §3/§6.2：120ms 指定属性过渡，无缩放/位移，pointer 驱动表面。
                      'absolute z-50 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background shadow-sm border border-border/70 flex items-center justify-center outline-none',
                      'transition-[background-color,border-color,box-shadow] duration-[120ms] ease-out motion-reduce:transition-none',
                      'data-[hovered=true]:bg-muted/65 data-[hovered=true]:border-border active:bg-muted',
                      'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
                      navCollapsed ? 'left-[calc(56px-14px)]' : 'left-[calc(56px-14px)] min-[1366px]:left-[calc(200px-14px)]'
                    )}
                    {...collapseHoverProps}
                  />
                }
              >
                {navCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />}
              </TooltipTrigger>
              <TooltipContent side="right">
                {navCollapsed ? t('pipeline.expandNav') : t('pipeline.collapseNav')}
              </TooltipContent>
            </Tooltip>

            <div
              className={cn(
                "bg-muted/40 dark:bg-muted/20 border-r border-border/70 flex-shrink-0 overflow-y-auto transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none flex flex-col",
                navCollapsed ? 'w-14' : pipelineDrawerResponsiveClasses.expandedNav
              )}
            >
              <nav className="flex-1 p-2 pt-4">
                {!navCollapsed && (
                  <div className="hidden min-[1366px]:block text-[12px] text-muted-foreground mb-2 px-3">
                    {navStageLabel}
                  </div>
                )}
                {renderNavItems}
              </nav>
            </div>

            <div className={cn('flex-1', drawerContentOwnsScrolling ? 'overflow-hidden' : 'overflow-y-auto')}>
              {drawerContent ? (
                <div
                  className={cn(
                    drawerContentOwnsScrolling ? 'h-full min-h-0' : 'p-6 space-y-4',
                  )}
                >

                  <div className={cn(
                    // GT-12356: when the drawer content owns its own scrolling
                    // (authSpoofing embeds a flex-col with an inner overflow-y-auto
                    // scroller + pinned footer), this wrapper must forward the
                    // bounded height. Without h-full min-h-0 it grows to content
                    // height, so the inner scroller never becomes shorter than its
                    // content (scrollHeight == clientHeight) and the wheel has
                    // nothing to scroll while the outer overflow-hidden clips the
                    // overflow — the mouse-wheel-can't-scroll symptom.
                    drawerContentOwnsScrolling && 'h-full min-h-0',
                    stage5Active && !comprehensiveStrategyEnabled && 'pointer-events-none opacity-50',
                  )}>
                    {drawerContent}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <Settings className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <div className="text-base font-medium text-foreground">
                    {t('pipeline.comingSoon')}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                    {t('pipeline.comingSoonHint')}
                  </p>
                </div>
              )}
            </div>
          </div>
          </TooltipProvider>
        </SheetContent>
      </Sheet>

      <AlertDialog open={closeConfirmOpen} onOpenChange={(open) => {
        setCloseConfirmOpen(open);
        if (!open) setPendingDrawerPolicy(null);
      }}>
        <AlertDialogContent data-testid="attachment-unsaved-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.unsavedChanges')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.unsavedChangesDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="attachment-unsaved-cancel">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="attachment-unsaved-discard"
              onClick={() => {
                setCloseConfirmOpen(false);
                if (pendingDrawerPolicy) {
                  setActiveDrawerPolicy(pendingDrawerPolicy);
                  setPendingDrawerPolicy(null);
                } else {
                  setDrawerOpen(false);
                }
              }}
            >
              {t('common.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
