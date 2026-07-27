'use client';

import * as React from 'react';

import { usePointerHover } from '@/hooks/use-pointer-hover';
import { cn } from '@/lib/utils';

interface SegmentedButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  selected: boolean;
}

/**
 * 分段控件（segmented control / pill tabs）里的单个选项按钮。
 *
 * 2026-07-25 柔和交互反馈规格 §6.6/§7.2：
 * - hover 只作用于未选中项（pointer 驱动 `data-hovered`，兼容 `hover:none` 设备），
 *   表面为 muted token + 文字提亮，不与选中态（bg-background + shadow-sm）混淆；
 * - focus-visible 用内嵌 ring，独立于选中指示；
 * - 只过渡实际变化的属性，reduced-motion 下直接到位。
 *
 * 尺寸/圆角由调用方通过 className 传入（如 `rounded-xl px-4 py-1.5`）。
 */
function SegmentedButton({
  selected,
  className,
  disabled,
  onPointerEnter,
  onPointerLeave,
  ...props
}: SegmentedButtonProps) {
  const { pointerHoverProps } = usePointerHover<HTMLButtonElement>({
    // 选中项不再需要 hover 表面（§6.6 hovered 只影响未选中项）。
    disabled: disabled || selected,
    onPointerEnter,
    onPointerLeave,
  });

  return (
    <button
      type="button"
      disabled={disabled}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        'text-sm font-medium outline-none',
        'transition-[background-color,color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        selected
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground data-[hovered=true]:bg-muted/40 data-[hovered=true]:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...pointerHoverProps}
      {...props}
    />
  );
}

export { SegmentedButton };
