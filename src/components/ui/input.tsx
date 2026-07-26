"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { usePointerHover } from "@/hooks/use-pointer-hover"
import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  disabled,
  onPointerEnter,
  onPointerLeave,
  ...props
}: React.ComponentProps<"input">) {
  const { pointerHoverProps } = usePointerHover<HTMLInputElement>({
    disabled,
    onPointerEnter,
    onPointerLeave,
  })

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow,border-color,background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium data-[hovered=true]:border-foreground/25 data-[hovered=true]:bg-muted/15 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:data-[hovered=true]:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:data-[hovered=true]:border-destructive md:text-sm dark:bg-input/30 dark:data-[hovered=true]:bg-input/40 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      disabled={disabled}
      {...pointerHoverProps}
      {...props}
    />
  )
}

export { Input }
