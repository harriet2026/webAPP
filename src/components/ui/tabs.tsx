"use client"

import * as React from "react"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { usePointerHover } from "@/hooks/use-pointer-hover"
import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-2xl border border-border/70 p-1 text-muted-foreground group-data-horizontal/tabs:min-h-10 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none data-[variant=line]:border-0",
  {
    variants: {
      variant: {
        default: "bg-muted/30 shadow-[0_10px_20px_rgba(15,23,42,0.04)]",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, onPointerEnter, onPointerLeave, ...props }: TabsPrimitive.Tab.Props) {
  // 柔和交互反馈规格 §6.6/§7.2：hover 由 pointer 事件驱动（hover:none 兼容、触摸不残留），
  // 只影响未选中项；选中态仍由 data-active 表达。
  const { pointerHoverProps } = usePointerHover<HTMLButtonElement>({
    onPointerEnter: onPointerEnter as React.PointerEventHandler<HTMLButtonElement>,
    onPointerLeave: onPointerLeave as React.PointerEventHandler<HTMLButtonElement>,
  })
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      {...pointerHoverProps}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-[color,background-color,border-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start not-data-active:data-[hovered=true]:text-foreground not-data-active:data-[hovered=true]:bg-muted/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:not-data-active:data-[hovered=true]:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "relative inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent px-3 py-1.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-[color,background-color,border-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start not-data-active:data-[hovered=true]:text-foreground not-data-active:data-[hovered=true]:bg-muted/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:not-data-active:data-[hovered=true]:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-[0_8px_20px_rgba(15,23,42,0.06)] group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:border-border/60 data-active:bg-background/95 data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
      <TabsPrimitive.Panel
        data-slot="tabs-content"
        className={cn("flex-1 pt-1 text-sm outline-none", className)}
        {...props}
      />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
