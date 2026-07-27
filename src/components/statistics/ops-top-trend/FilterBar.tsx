'use client';

import { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DIR_APPLICABLE, DIR_FIXED, type DimensionType } from './columns';
import type { OpsDirection, OpsTimeRange, OpsTopCount } from '@/lib/api/ops-top';

interface FilterBarProps {
  dimension: DimensionType;
  direction: OpsDirection;
  onDirectionChange: (d: OpsDirection) => void;
  timeRange: OpsTimeRange;
  onTimeRangeChange: (r: OpsTimeRange) => void;
  topCount: OpsTopCount;
  onTopCountChange: (c: OpsTopCount) => void;
  leftSlot?: ReactNode;
}

const DIRECTIONS: OpsDirection[] = ['all', 'receive', 'send', 'internal'];
const TIME_RANGES: OpsTimeRange[] = ['today', '7d', '30d', 'thisMonth', 'lastMonth'];
const TOP_COUNTS: OpsTopCount[] = ['10', '50', '100'];

export function FilterBar({
  dimension,
  direction,
  onDirectionChange,
  timeRange,
  onTimeRangeChange,
  topCount,
  onTopCountChange,
  leftSlot,
}: FilterBarProps) {
  const t = useTranslations('opsTopTrend');
  const dirDisabled = !DIR_APPLICABLE[dimension];
  // When direction buttons are disabled, highlight the actual fixed direction the backend uses.
  const effectiveDirection = dirDisabled ? (DIR_FIXED[dimension] ?? 'all') : direction;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      {leftSlot}

      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className={dirDisabled ? 'opacity-50' : ''}
              aria-disabled={dirDisabled}
            />
          }
        >
          <SegmentedControl
            value={effectiveDirection}
            onChange={(v) => !dirDisabled && onDirectionChange(v as OpsDirection)}
            options={DIRECTIONS.map((d) => ({ value: d, label: t(`direction.${d}`) }))}
          />
        </TooltipTrigger>
        {dirDisabled && <TooltipContent>{t('dirFixedTip')}</TooltipContent>}
      </Tooltip>

      <SegmentedControl
        value={timeRange}
        onChange={(v) => onTimeRangeChange(v as OpsTimeRange)}
        size="sm"
        options={TIME_RANGES.map((r) => ({ value: r, label: t(`timeRange.${r}`) }))}
      />

      <SegmentedControl
        value={topCount}
        onChange={(v) => onTopCountChange(v as OpsTopCount)}
        size="sm"
        options={TOP_COUNTS.map((c) => ({ value: c, label: `TOP ${c}` }))}
      />
    </div>
  );
}
