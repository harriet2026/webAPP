import * as React from 'react';

import { Button } from '@/components/ui/button';
import { SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type PageHeaderActionButtonProps = React.ComponentProps<typeof Button>;
type PageHeaderSelectTriggerProps = React.ComponentProps<typeof SelectTrigger>;

/**
 * Standard secondary action used inside FramedPage's header action area.
 *
 * The base button intentionally has a denser small size. Page-header actions
 * use the demo's 14/20 typography, 8px radius, visible border, and 150ms
 * transition instead.
 */
export function PageHeaderActionButton({
  className,
  variant = 'outline',
  size = 'sm',
  ...props
}: PageHeaderActionButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        'border rounded-lg px-2.5 text-sm leading-5 font-medium transition-all duration-150 ease-in-out',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Standard select trigger used inside FramedPage's header action area.
 */
export function PageHeaderSelectTrigger({
  className,
  ...props
}: PageHeaderSelectTriggerProps) {
  return (
    <SelectTrigger
      className={cn(
        'w-32 gap-2 rounded-lg px-3 shadow-xs transition-[color,box-shadow] duration-150 ease-in-out data-[size=default]:h-9',
        className,
      )}
      {...props}
    />
  );
}
