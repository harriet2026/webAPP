'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { MAX_RANGE_DAYS, validateCustomRange, type CustomRange } from './date-range';
import type { Direction, TimeRange } from '@/lib/api/security-overview';

interface FilterBarProps {
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  customRange: CustomRange;
  onCustomRangeChange: (r: CustomRange) => void;
  comparePrevious: boolean;
  onComparePreviousChange: (v: boolean) => void;
  leftSlot?: ReactNode;
}

const DIRECTIONS: Direction[] = ['all', 'receive', 'send', 'internal'];
const TIME_RANGES: TimeRange[] = ['today', '7d', '30d', 'this_month', 'last_month', 'custom'];

// The two endpoints are edited one at a time, so the intermediate state after
// the first edit is a range the user never asked for — and it is often a valid
// one, e.g. moving start from 2026-07-01 to 2025-08-01 while end is still
// 2026-07-12 yields a 347-day window. Propagating that would fire the overview /
// geo / time / escape queries over ~a year of mail_log before the user has even
// touched the end field. Settle first, then propagate.
export const CUSTOM_RANGE_DEBOUNCE_MS = 500;

export function FilterBar({
  direction,
  onDirectionChange,
  timeRange,
  onTimeRangeChange,
  customRange,
  onCustomRangeChange,
  comparePrevious,
  onComparePreviousChange,
  leftSlot,
}: FilterBarProps) {
  const t = useTranslations('securityOverview.filter');
  const startId = useId();
  const endId = useId();

  // The draft the user is editing. Kept HERE rather than in the page so a
  // half-typed or illegal interval never reaches the query — the page's
  // customRange only ever advances to a range that passed validateCustomRange.
  const [draft, setDraft] = useState<CustomRange>(customRange);
  const [error, setError] = useState<ReturnType<typeof validateCustomRange>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // Re-seed on the range the page hands down AND on every timeRange switch.
  //
  // `timeRange` is load-bearing: FilterBar is never unmounted when the user
  // leaves 自定义 — only the date-input JSX is conditional — so without it a
  // rejected draft would survive. Leave an invalid range, click 近7天, click
  // 自定义 again, and you would be shown the bad dates and a red error while the
  // charts render a different (last-valid) range. Keying on customRange alone
  // cannot fix this: an invalid draft never propagates, so customRange never
  // changes on exactly the path that needs the reset.
  /* eslint-disable react-hooks/set-state-in-effect -- the controlled draft must
     synchronously discard an invalid value when the parent range/mode changes. */
  useEffect(() => {
    cancelPending();
    setDraft(customRange);
    setError(null);
  }, [customRange, timeRange, cancelPending]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => cancelPending, [cancelPending]);

  const editDraft = (patch: Partial<CustomRange>) => {
    const next = { ...draft, ...patch };
    setDraft(next); // keep the bad value on screen so the user can fix it
    const err = validateCustomRange(next);
    setError(err);
    cancelPending();
    if (err !== null) return;
    timer.current = setTimeout(() => onCustomRangeChange(next), CUSTOM_RANGE_DEBOUNCE_MS);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      {leftSlot}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground whitespace-nowrap">{t('direction.label')}</span>
        <SegmentedControl
          value={direction}
          onChange={onDirectionChange}
          options={DIRECTIONS.map((d) => ({ value: d, label: t(`direction.${d}`) }))}
        />
      </div>

      <SegmentedControl
        value={timeRange}
        onChange={onTimeRangeChange}
        size="sm"
        options={TIME_RANGES.map((r) => ({ value: r, label: t(`timeRange.${r}`) }))}
      />

      {timeRange === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={startId} className="text-sm text-muted-foreground whitespace-nowrap">
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
          <label htmlFor={endId} className="text-sm text-muted-foreground whitespace-nowrap">
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

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <Checkbox
          checked={comparePrevious}
          onCheckedChange={(v) => onComparePreviousChange(v === true)}
        />
        <span className="text-sm text-muted-foreground">{t('comparePrevious')}</span>
      </label>
    </div>
  );
}
