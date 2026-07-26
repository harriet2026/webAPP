"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { usePointerHover } from "@/hooks/use-pointer-hover"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow,background-color,border-color] duration-[120ms] ease-out motion-reduce:transition-none outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border border-primary/80 bg-primary text-primary-foreground shadow-sm data-[hovered=true]:bg-primary/90 active:bg-primary/85",
        outline:
          "border-border bg-background shadow-xs data-[hovered=true]:border-foreground/20 data-[hovered=true]:bg-muted/35 data-[hovered=true]:text-foreground active:bg-muted/60 aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:border-input dark:bg-input/30 dark:data-[hovered=true]:bg-input/50",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground data-[hovered=true]:bg-secondary/85 active:bg-secondary/75 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "data-[hovered=true]:bg-muted/65 data-[hovered=true]:text-foreground active:bg-muted aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:data-[hovered=true]:bg-accent/60",
        destructive:
          "border border-destructive/20 bg-destructive text-destructive-foreground data-[hovered=true]:bg-destructive/92 active:bg-destructive/85 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 data-[hovered=true]:underline",
      },
      size: {
        default:
          "h-9 px-4 py-2 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 rounded-md px-2.5 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-md gap-1.5 px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 rounded-md px-6 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-8",
        "icon-xs":
          "size-7 rounded-md in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-md in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-10 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  disabled,
  onPointerEnter,
  onPointerLeave,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  const { pointerHoverProps } = usePointerHover<HTMLButtonElement>({
    disabled,
    onPointerEnter,
    onPointerLeave,
  })

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled}
      {...pointerHoverProps}
      {...props}
    />
  )
}

export { Button, buttonVariants }
