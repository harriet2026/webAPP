'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { cn } from '@/lib/utils';

/**
 * 折叠辅助区（配置示例 / 模拟测试 / 配置预览等）的共享触发器。
 *
 * 交互按 2026-07-25 跨页面柔和交互反馈规格收敛到共享层：
 * - hover 由 pointerenter/pointerleave 驱动（`data-hovered`），在 `hover:none`
 *   的混合输入设备上鼠标仍有反馈，触摸不残留 sticky hover；
 * - 表面只用语义 token（muted），不使用品牌色/语义色色块；
 * - 展开指示用同一个 Chevron 节点 180° 旋转（base-ui 的 `data-panel-open`），
 *   reduced-motion 下直接到位。
 */
function CollapsibleSectionTrigger({
  className,
  children,
  onPointerEnter,
  onPointerLeave,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
  const { pointerHoverProps } = usePointerHover<HTMLButtonElement>({
    onPointerEnter: onPointerEnter as React.PointerEventHandler<HTMLButtonElement>,
    onPointerLeave: onPointerLeave as React.PointerEventHandler<HTMLButtonElement>,
  });

  return (
    <CollapsibleTrigger
      className={cn(
        'group/collapse-trigger flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-primary',
        'transition-[background-color,color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        'data-[hovered=true]:bg-muted/50 active:bg-muted/65',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...pointerHoverProps}
      {...props}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      <ChevronDown
        aria-hidden
        className={cn(
          'h-4 w-4 shrink-0 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          'group-data-[panel-open]/collapse-trigger:rotate-180',
        )}
      />
    </CollapsibleTrigger>
  );
}

/**
 * 折叠卡片头触发器（CardHeader 里「chevron + 标题 + 徽标」整行可点的形态）。
 *
 * 与 CollapsibleSectionTrigger 的差异：chevron 由调用方渲染在左侧（各自控制旋转方向），
 * 本组件只收敛 pointer 驱动 hover 表面、focus-visible 与 reduced-motion。负 margin +
 * 等量 padding 让 hover 表面有呼吸感且不改变内容排版位置。
 */
function CollapsibleCardTrigger({
  className,
  children,
  onPointerEnter,
  onPointerLeave,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
  const { pointerHoverProps } = usePointerHover<HTMLButtonElement>({
    onPointerEnter: onPointerEnter as React.PointerEventHandler<HTMLButtonElement>,
    onPointerLeave: onPointerLeave as React.PointerEventHandler<HTMLButtonElement>,
  });

  return (
    <CollapsibleTrigger
      className={cn(
        'flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md border-0 bg-transparent text-left cursor-pointer',
        '-mx-1.5 -my-1 px-1.5 py-1',
        'transition-[background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        'data-[hovered=true]:bg-muted/50 active:bg-muted/65',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
        className,
      )}
      {...pointerHoverProps}
      {...props}
    >
      {children}
    </CollapsibleTrigger>
  );
}

export { CollapsibleSectionTrigger, CollapsibleCardTrigger };
