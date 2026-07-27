'use client';

import type { KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Lock } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { cn } from '@/lib/utils';

export interface PipelinePolicy {
  key: string;
  nameKey: string;
  descKey: string;
  type: 'blocking' | 'forced' | 'exception' | 'configurable' | 'ai-sync' | 'ai-async' | 'unconfigured';
  functional: boolean;
  locked?: boolean;
  href?: string;
  // html_spec alignment (§2.1-7 / §4.2): 尚未配置任何规则的模块（海外邮件检测 /
  // 高级过滤规则）以未配置态渲染（橙色虚线 + 灰色色条 + 「去配置」），但仍可点击进入配置。
  unconfigured?: boolean;
}

interface PipelinePolicyCardProps {
  policy: PipelinePolicy;
  /** 左侧类型色条颜色（页面按 typeColors/特例计算后传入）。 */
  barColor: string;
  onActivate: () => void;
}

/**
 * 流水线策略卡片（可点击卡片，2026-07-25 柔和交互反馈规格 §6.4/§7.2/§8）：
 * - hover 由 pointer 事件驱动（`data-hovered`），`hover:none` 混合设备鼠标可用、触摸不残留；
 * - 悬浮只做表面浮现：边框强化一档 + 轻微 muted 表面 + shadow-sm，无位移/缩放；
 * - locked 视为 disabled：不响应 hover，`aria-disabled` + 不进入 Tab 序；
 * - 整卡可键盘激活（role=button + Enter/Space），内部「配置」按钮移出 Tab 序避免同一
 *   动作出现两个焦点停留点，鼠标仍可直接点击。
 *
 * 必须渲染在 <Tooltip> 内（本组件输出 TooltipTrigger，TooltipContent 由页面提供）。
 */
export function PipelinePolicyCard({ policy, barColor, onActivate }: PipelinePolicyCardProps) {
  const t = useTranslations();
  const isFunctional = policy.functional;
  const isAI = policy.type === 'ai-sync' || policy.type === 'ai-async';
  const locked = policy.locked === true;
  // html_spec §2.1-7：未配置态 —— 橙色虚线边框 + 灰色色条 + 「去配置」，仍可点击进入配置。
  const isUnconfigured = policy.unconfigured === true && !locked;

  const { pointerHoverProps } = usePointerHover<HTMLDivElement>({ disabled: locked });
  const { pointerHoverProps: ctaHoverProps } = usePointerHover<HTMLButtonElement>({ disabled: locked });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  return (
    <TooltipTrigger
      render={
        <div
          data-testid={`pipeline-policy-card-${policy.key}`}
          data-unconfigured={isUnconfigured ? 'true' : undefined}
          role="button"
          tabIndex={locked ? undefined : 0}
          aria-disabled={locked || undefined}
          className={cn(
            'group/policy-card relative flex h-[60px] w-[220px] flex-none items-center gap-2 rounded-lg border p-3 outline-none',
            'transition-[background-color,border-color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            isUnconfigured && 'border-2 border-dashed',
            locked
              ? 'cursor-not-allowed opacity-70'
              : cn(
                  'cursor-pointer',
                  'data-[hovered=true]:border-foreground/20 data-[hovered=true]:bg-muted/40 data-[hovered=true]:shadow-sm',
                  'active:bg-muted/55',
                  'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
                ),
            !isFunctional && !locked && 'opacity-70',
          )}
          style={isUnconfigured ? { borderColor: 'var(--action-quarantine)' } : undefined}
          onClick={onActivate}
          onKeyDown={handleKeyDown}
          {...pointerHoverProps}
        />
      }
    >
      <div
        className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
        style={{ backgroundColor: barColor }}
      />
      <div className="flex-1 pl-2 min-w-0">
        <div className="text-sm font-medium truncate">{t(policy.nameKey)}</div>
        {isAI && (
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded text-white',
            policy.type === 'ai-async' ? 'bg-warning' : 'bg-action-review',
          )}>
            {policy.type === 'ai-async' ? t('pipeline.aiAsync') : t('pipeline.aiSync')}
          </span>
        )}
      </div>
      <button
        type="button"
        data-testid={`pipeline-policy-config-${policy.key}`}
        tabIndex={-1}
        disabled={locked}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-sm text-xs text-primary outline-none',
          'underline decoration-transparent underline-offset-4',
          'transition-[text-decoration-color] duration-[120ms] ease-out motion-reduce:transition-none',
          'group-data-[hovered=true]/policy-card:decoration-current data-[hovered=true]:decoration-current',
          'disabled:pointer-events-none',
        )}
        onClick={(e) => {
          e.stopPropagation();
          onActivate();
        }}
        {...ctaHoverProps}
      >
        {locked ? <Lock className="h-3 w-3" /> : null}
        {!isFunctional
          ? t('pipeline.comingSoon')
          : isUnconfigured
            ? t('pipeline.goConfig')
            : t('pipeline.configBtn')}
        {isFunctional && !locked && <ArrowRight className="h-3 w-3" />}
      </button>
    </TooltipTrigger>
  );
}

interface PipelineDrawerNavButtonProps {
  testid: string;
  name: string;
  summary?: string;
  /** 非 functional 项的「敬请期待」文案；传入即展示徽标与 tooltip 说明。 */
  comingSoonLabel?: string;
  dotOn: boolean;
  isActive: boolean;
  collapsed: boolean;
  /** 展开态名称/摘要容器的响应式 class（页面的 pipelineDrawerResponsiveClasses.expandedNavLabel）。 */
  labelClassName?: string;
  onSelect: () => void;
}

/**
 * 抽屉左导航项（菜单项，规格 §6.5/§7.2）：
 * - selected 用 primary 淡表面（primary/10 + 极淡 primary 内边缘 + primary 左缘 + primary 文字），
 *   hover 时仅轻微加深（§4：selected 不被 hover 覆盖）；
 * - 未选中项 hover 用 pointer 驱动的 `data-hovered` 中性表面（bg-background 浮出 muted 面板），
 *   与 selected 的 primary 语义明确区分，移出即完全恢复；
 * - 所有状态恒占 2px 左缘（非选中为透明），选中切换不再产生文字位移；
 * - focus-visible 用内嵌 ring，比 hover 更明显。
 */
export function PipelineDrawerNavButton({
  testid,
  name,
  summary,
  comingSoonLabel,
  dotOn,
  isActive,
  collapsed,
  labelClassName,
  onSelect,
}: PipelineDrawerNavButtonProps) {
  const { pointerHoverProps } = usePointerHover<HTMLButtonElement>();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              'w-full flex items-center rounded-lg text-left outline-none border-l-2 border-transparent',
              'transition-[background-color,color,border-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
              collapsed ? 'px-2 py-2.5 justify-center' : 'px-2 py-2.5 justify-center min-[1366px]:px-3 min-[1366px]:gap-2',
              isActive
                ? cn(
                    // 规格 §5.1/§6.5：selected = primary 淡表面(15%) + 淡 primary 内边缘，
                    // hover 只轻微加深(18%)，不改变结构。
                    'bg-primary/15 border-primary text-primary',
                    'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_30%,transparent)]',
                    'data-[hovered=true]:bg-primary/[0.18]',
                  )
                : cn(
                    // 未选中 hover：白色表面从 muted 面板浮出 + 细描边 + 轻投影，
                    // 一眼可发现但弱于选中态的 primary 语义（§12.3）。
                    'text-foreground',
                    'data-[hovered=true]:bg-background data-[hovered=true]:shadow-[inset_0_0_0_1px_var(--border),0_1px_2px_rgba(15,23,42,0.06)]',
                    'active:bg-muted/60',
                  ),
              'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
              comingSoonLabel && !isActive && 'text-muted-foreground',
            )}
            onClick={onSelect}
            data-testid={testid}
            {...pointerHoverProps}
          />
        }
      >
          <span className={cn(
            "w-2.5 h-2.5 rounded-full flex-shrink-0",
            // 启用圆点走主题 token（规格 §2.3：蓝/绿主题只换 token，不硬编码品牌蓝）。
            dotOn ? "bg-primary" : "border-2 border-muted-foreground/30"
          )} />
          {!collapsed && (
            // html_spec §2.3-13：所有阶段的左导航模块都显示「名称 + 摘要」两行（此前仅 stage5）。
            <span className={cn('flex-1 min-w-0', labelClassName)}>
              <span className="text-[14px] truncate block">{name}</span>
              {summary && (
                <span className="text-[11px] text-muted-foreground truncate block">
                  {summary}
                </span>
              )}
            </span>
          )}
          {!collapsed && comingSoonLabel && (
            <span className="hidden min-[1366px]:block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
              {comingSoonLabel}
            </span>
          )}
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className={cn('flex flex-col gap-1', !collapsed && 'min-[1366px]:hidden')}
      >
        <span className="font-medium">{name}</span>
        {comingSoonLabel && (
          <span className="text-xs text-muted-foreground">{comingSoonLabel}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
