'use client';

import { useTranslations } from 'next-intl';
import type { Direction } from '@/types/attachment-security';
import { SegmentedButton } from '@/components/ui/segmented-button';

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
        <SegmentedButton
          key={dir}
          disabled={disabled}
          selected={value === dir}
          data-testid={`direction-${dir}`}
          className="px-4 py-1.5 rounded-xl"
          onClick={() => onChange(dir)}
        >
          {t(dir)}
        </SegmentedButton>
      ))}
    </div>
  );
}
