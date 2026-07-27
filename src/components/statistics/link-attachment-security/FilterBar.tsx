'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { TenantScopeSelector } from '@/components/statistics/security-overview/TenantScopeSelector';
import {
  validateCustomRange,
  type CustomRange,
} from '@/components/statistics/security-overview/date-range';
import type { Direction, TimeRange } from '@/lib/api/link-attachment-security';

export const CUSTOM_RANGE_DEBOUNCE_MS = 500;
const MAX_RANGE_DAYS = 90;

const DIRECTIONS: Direction[] = ['all', 'receive', 'send', 'internal'];
const TIME_RANGES: TimeRange[] = ['today', '7d', '30d', 'this_month', 'last_month', 'custom'];

interface FilterBarProps {
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  customRange: CustomRange;
  onCustomRangeChange: (r: CustomRange) => void;
  showTenantScope: boolean;
  tenantId: number | null;
  onTenantChange: (tenantId: number | null) => void;
}

export function FilterBar({
  direction,
  onDirectionChange,
  timeRange,
  onTimeRangeChange,
  customRange,
  onCustomRangeChange,
  showTenantScope,
  tenantId,
  onTenantChange,
}: FilterBarProps) {
  const t = useTranslations('linkAttachmentSecurity');
  const startId = useId();
  const endId = useId();

  const [draft, setDraft] = useState<CustomRange>(customRange);
  const [error, setError] = useState<ReturnType<typeof validateCustomRange>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const editDraft = (patch: Partial<CustomRange>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    let err = validateCustomRange(next);
    if (
      err === null
      && differenceInCalendarDays(parseISO(next.end), parseISO(next.start)) > MAX_RANGE_DAYS
    ) {
      err = 'tooLong';
    }
    setError(err);
    cancelPending();
    if (err !== null) return;
    timer.current = setTimeout(() => onCustomRangeChange(next), CUSTOM_RANGE_DEBOUNCE_MS);
  };

  const handleTimeRangeChange = (next: TimeRange) => {
    cancelPending();
    if (next === 'custom' && timeRange !== 'custom') {
      setDraft(customRange);
      setError(null);
    } else if (next !== 'custom' && timeRange === 'custom') {
      setDraft(customRange);
      setError(null);
    }
    onTimeRangeChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="link-attachment-filters">
      {showTenantScope && (
        <TenantScopeSelector value={tenantId} onChange={onTenantChange} />
      )}

      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {t('direction.label')}
        </span>
        <SegmentedControl
          value={direction}
          onChange={onDirectionChange}
          options={DIRECTIONS.map((d) => ({ value: d, label: t(`direction.${d}`) }))}
        />
      </div>

      <SegmentedControl
        value={timeRange}
        onChange={handleTimeRangeChange}
        size="sm"
        options={TIME_RANGES.map((r) => ({ value: r, label: t(`timeRange.${r}`) }))}
      />

      {timeRange === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={startId} className="whitespace-nowrap text-sm text-muted-foreground">
            {t('customRange.start')}
          </label>
          <input
            id={startId}
            type="date"
            value={draft.start}
            onChange={(e) => editDraft({ start: e.target.value })}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm text-body"
          />
          <span className="text-sm text-muted-foreground">~</span>
          <label htmlFor={endId} className="whitespace-nowrap text-sm text-muted-foreground">
            {t('customRange.end')}
          </label>
          <input
            id={endId}
            type="date"
            value={draft.end}
            onChange={(e) => editDraft({ end: e.target.value })}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm text-body"
          />
          {error && (
            <span role="alert" className="text-sm text-danger">
              {t(`customRange.error.${error}`, { max: MAX_RANGE_DAYS })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
