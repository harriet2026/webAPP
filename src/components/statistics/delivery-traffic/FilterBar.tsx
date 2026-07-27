'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { TenantScopeSelector } from '@/components/statistics/security-overview/TenantScopeSelector';
import {
  validateCustomRange,
  defaultCustomRange,
  type CustomRange,
} from '@/components/statistics/security-overview/date-range';
import type { Direction, TimeRange } from '@/lib/api/delivery-traffic';
import { inclusiveCalendarDayCount } from './date-range';

const MAX_RANGE_DAYS = 90;

interface FilterBarProps {
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  customRange: CustomRange;
  onCustomRangeChange: (r: CustomRange) => void;
  showTenant: boolean;
  tenantId: number | null;
  onTenantChange: (tenantId: number | null) => void;
}

const DIRECTIONS: Direction[] = ['all', 'receive', 'send', 'internal'];
const TIME_RANGES: TimeRange[] = ['today', '7d', '30d', 'this_month', 'last_month', 'custom'];

export function FilterBar({
  direction,
  onDirectionChange,
  timeRange,
  onTimeRangeChange,
  customRange,
  onCustomRangeChange,
  showTenant,
  tenantId,
  onTenantChange,
}: FilterBarProps) {
  const t = useTranslations('deliveryTraffic');
  const today = format(new Date(), 'yyyy-MM-dd');

  // Internal draft for custom range — only commits upward after debounce + validation
  const [draft, setDraft] = useState<CustomRange>(customRange);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  function handleDraftChange(patch: Partial<CustomRange>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const err = validateCustomRange(next);
      if (err === 'invalid') {
        setRangeError(t('customRange.error.invalid'));
      } else if (err === 'order') {
        setRangeError(t('customRange.error.order'));
      } else if (next.end > today) {
        setRangeError(t('timeRange.noFuture'));
      } else if (
        err === 'tooLong'
        || (inclusiveCalendarDayCount(next.start, next.end) ?? 0) > MAX_RANGE_DAYS
      ) {
        setRangeError(t('customRange.error.tooLong', { max: MAX_RANGE_DAYS }));
      } else {
        setRangeError(null);
        onCustomRangeChange(next);
      }
    }, 500);
  }

  function handleTimeRangeChange(r: TimeRange) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (r === 'custom' && timeRange !== 'custom') {
      const next = defaultCustomRange();
      setDraft(next);
      setRangeError(null);
      onCustomRangeChange(next);
    } else if (r !== 'custom' && timeRange === 'custom') {
      setDraft(customRange);
      setRangeError(null);
    }
    onTimeRangeChange(r);
  }

  const directionOptions = DIRECTIONS.map((d) => ({ value: d, label: t(`direction.${d}`) }));
  const timeRangeOptions = TIME_RANGES.map((r) => ({ value: r, label: t(`timeRange.${r}`) }));

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-sm [&_[role=combobox]]:bg-card"
      data-testid="delivery-traffic-filter-bar"
    >
      <div className="flex flex-wrap items-center gap-4">
        {showTenant && (
          <TenantScopeSelector
            value={tenantId}
            onChange={onTenantChange}
          />
        )}

        <div className="flex items-center gap-2">
          <Label className="sr-only">{t('direction.label')}</Label>
          <SegmentedControl
            value={direction}
            onChange={onDirectionChange}
            options={directionOptions}
            testIdPrefix="delivery-direction"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label className="sr-only">{t('timeRange.label')}</Label>
          <SegmentedControl
            value={timeRange}
            onChange={handleTimeRangeChange}
            options={timeRangeOptions}
            size="sm"
            testIdPrefix="delivery-time-range"
          />
        </div>

        {timeRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-2" data-testid="delivery-custom-range">
            <span className="text-sm text-muted-foreground">{t('customRange.start')}</span>
            <Input
              type="date"
              aria-label={t('timeRange.startDate')}
              value={draft.start}
              max={draft.end || today}
              onChange={(e) => handleDraftChange({ start: e.target.value })}
              className="w-40"
            />
            <span className="text-sm text-muted-foreground">—</span>
            <span className="text-sm text-muted-foreground">{t('customRange.end')}</span>
            <Input
              type="date"
              aria-label={t('timeRange.endDate')}
              value={draft.end}
              min={draft.start}
              max={today}
              onChange={(e) => handleDraftChange({ end: e.target.value })}
              className="w-40"
            />
            {rangeError && (
              <p className="text-sm text-destructive" role="alert">{rangeError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
