'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { usePointerHover } from '@/hooks/use-pointer-hover';
import { cn } from '@/lib/utils';

const interactiveSurfaceVariants = cva(
  [
    'group/interactive cursor-pointer outline-none',
    'transition-[background-color,border-color,color,box-shadow,text-decoration-color]',
    'motion-reduce:transition-none',
    'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
    'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
  ].join(' '),
  {
    variants: {
      variant: {
        card: [
          'rounded-xl duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        ].join(' '),
        row: [
          'rounded-lg duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          'data-[hovered=true]:bg-muted/50',
          'data-[hovered=true]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--border)_40%,transparent)]',
          'active:bg-muted/65',
        ].join(' '),
        control: [
          'rounded-md duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          'data-[hovered=true]:bg-muted/50 active:bg-muted/65',
        ].join(' '),
        text: [
          'rounded-sm duration-[120ms] ease-out',
          'data-[hovered=true]:text-foreground data-[hovered=true]:underline',
          'underline-offset-4 decoration-transparent data-[hovered=true]:decoration-current',
        ].join(' '),
      },
    },
    defaultVariants: {
      variant: 'row',
    },
  },
);

interface InteractiveSurfaceProps
  extends React.ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof interactiveSurfaceVariants> {
  asChild?: boolean;
  disabled?: boolean;
}

/**
 * Shared soft-surface interaction primitive.
 *
 * `asChild` keeps the caller's native link/button semantics while centralizing
 * pointer compatibility, focus treatment, reduced-motion behavior and the
 * page-wide motion timings.
 */
function InteractiveSurface({
  asChild = false,
  className,
  variant,
  disabled = false,
  onPointerEnter,
  onPointerLeave,
  ...props
}: InteractiveSurfaceProps) {
  const Comp = asChild ? Slot : 'div';
  const { pointerHoverProps } = usePointerHover<HTMLElement>({
    disabled,
    onPointerEnter,
    onPointerLeave,
  });

  return (
    <Comp
      data-disabled={disabled ? 'true' : undefined}
      aria-disabled={disabled || undefined}
      className={cn(interactiveSurfaceVariants({ variant }), className)}
      {...pointerHoverProps}
      {...props}
    />
  );
}

export { InteractiveSurface, interactiveSurfaceVariants };
