"use client"

import * as React from "react"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { usePointerHover } from "@/hooks/use-pointer-hover"
import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  disabled,
  onPointerEnter,
  onPointerLeave,
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  // 柔和交互反馈规格 §7.2：hover 由 pointer 事件驱动（hover:none 兼容、触摸不残留），
  // 轨道色随 hover 轻微加深（checked→primary/90、unchecked→加深一档），disabled 不响应。
  const { pointerHoverProps } = usePointerHover<HTMLElement>({
    disabled,
    onPointerEnter: onPointerEnter as unknown as React.PointerEventHandler<HTMLElement>,
    onPointerLeave: onPointerLeave as unknown as React.PointerEventHandler<HTMLElement>,
  })
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      disabled={disabled}
      {...pointerHoverProps}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-[background-color,border-color,box-shadow] duration-[120ms] ease-out motion-reduce:transition-none outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-checked:data-[hovered=true]:bg-primary/90 data-unchecked:data-[hovered=true]:bg-[color-mix(in_oklab,var(--input)_80%,var(--foreground)_12%)] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background ring-0 transition-transform duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-primary-foreground group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
