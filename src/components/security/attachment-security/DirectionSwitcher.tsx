'use client';

import { useTranslations } from 'next-intl';
import type { Direction } from '@/types/attachment-security';
import { cn } from '@/lib/utils';

interface DirectionSwitcherProps {
  value: Direction;
  onChange: (dir: Direction) => void;
  disabled?: boolean;
}

const DIRECTIONS: Direction[] = ['receive', 'send', 'internal'];

export function DirectionSwitcher({ value, onChange, disabled }: DirectionSwitcherProps) {
  const t = useTranslations('attachmentSecurity.direction');

  return (
    <div className="inline-flex rounded-2xl border border-border/70 bg-muted/30 p-1 gap-1" data-testid="direction-switcher">
      {DIRECTIONS.map((dir) => (
        <button
          key={dir}
          type="button"
          disabled={disabled}
          data-testid={`direction-${dir}`}
          className={cn(
            'px-4 py-1.5 rounded-xl text-sm font-medium transition-all',
            value === dir
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          onClick={() => onChange(dir)}
        >
          {t(dir)}
        </button>
      ))}
    </div>
  );
}
