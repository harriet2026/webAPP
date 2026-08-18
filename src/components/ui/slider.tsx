"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

interface SliderProps {
  value: number[]
  // 第二个 eventDetails 参数原样透传自 base-ui，多数消费方无需关心（可忽略）
  onValueChange?: (value: number[], eventDetails?: unknown) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  'data-testid'?: string
}

function Slider({
  className,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  'data-testid': testId,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-testid={testId}
      value={value}
      onValueChange={(v: number | number[], eventDetails: unknown) => {
        // base-ui 在单滑块（values.length === 1）场景下，指针/触摸拖拽与轨道点击路径
        // （SliderControl.js 内部按 `values.length > 1` 而非受控 value 是否为数组来判定
        // range 模式）会回传裸 number，而键盘路径回传的是数组，行为不一致。此处统一
        // 归一化为数组，兑现本组件对外声明的 `onValueChange?: (value: number[]) => void`；
        // eventDetails 原样透传，不改变原有的第二参数行为。
        onValueChange?.(Array.isArray(v) ? v : [v], eventDetails)
      }}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="relative flex w-full items-center py-1"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="absolute h-full rounded-full bg-primary"
          />
        </SliderPrimitive.Track>
        {value.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            index={index}
            data-slot="slider-thumb"
            data-testid={testId ? `${testId}-thumb-${index}` : undefined}
            className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:pointer-events-none data-disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
