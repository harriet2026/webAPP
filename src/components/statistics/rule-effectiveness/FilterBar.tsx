'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { MAX_RANGE_DAYS, validateCustomRange, type CustomRange } from './date-range';
import { POLICY_MODULES, OBSERVE_DURATION_BUCKETS } from './constants';
import type { ObserveDurationBucket, PolicyModule, TimeRange } from '@/lib/api/rule-effectiveness';

interface FilterBarProps {
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  customRange: CustomRange;
  onCustomRangeChange: (r: CustomRange) => void;
  modules: PolicyModule[];
  onModulesChange: (m: PolicyModule[]) => void;
  durationBuckets: ObserveDurationBucket[];
  onDurationBucketsChange: (b: ObserveDurationBucket[]) => void;
  leftSlot?: ReactNode;
}

const TIME_RANGES: TimeRange[] = ['today', '7d', '30d', 'custom'];

export const CUSTOM_RANGE_DEBOUNCE_MS = 500;

export function FilterBar({
  timeRange,
  onTimeRangeChange,
  customRange,
  onCustomRangeChange,
  modules,
  onModulesChange,
  durationBuckets,
  onDurationBucketsChange,
  leftSlot,
}: FilterBarProps) {
  const t = useTranslations('ruleEffectiveness.filter');
  const startId = useId();
  const endId = useId();

  const [draft, setDraft] = useState<CustomRange>(customRange);
  const [error, setError] = useState<ReturnType<typeof validateCustomRange>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- 受控草稿需要在父级范围/模式变化时同步丢弃非法值 */
  useEffect(() => {
    cancelPending();
    setDraft(customRange);
    setError(null);
  }, [customRange, timeRange, cancelPending]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => cancelPending, [cancelPending]);

  const editDraft = (patch: Partial<CustomRange>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const err = validateCustomRange(next);
    setError(err);
    cancelPending();
    if (err !== null) return;
    timer.current = setTimeout(() => onCustomRangeChange(next), CUSTOM_RANGE_DEBOUNCE_MS);
  };

  const toggleModule = (m: PolicyModule) => {
    if (modules.includes(m)) {
      onModulesChange(modules.filter((x) => x !== m));
    } else {
      onModulesChange([...modules, m]);
    }
  };

  const toggleBucket = (b: ObserveDurationBucket) => {
    if (durationBuckets.includes(b)) {
      onDurationBucketsChange(durationBuckets.filter((x) => x !== b));
    } else {
      onDurationBucketsChange([...durationBuckets, b]);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid="rule-effectiveness-filter-bar"
    >
      {leftSlot}

      <SegmentedControl
        value={timeRange}
        onChange={onTimeRangeChange}
        size="sm"
        testIdPrefix="rule-effectiveness-timerange"
        options={TIME_RANGES.map((r) => ({ value: r, label: t(`timeRange.${r}`) }))}
      />

      {timeRange === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={startId} className="text-sm text-muted-foreground whitespace-nowrap">
            {t('customRange.start')}
          </label>
          <input
            id={startId}
            data-testid="rule-effectiveness-custom-start"
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
            data-testid="rule-effectiveness-custom-end"
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

      <Popover>
        <PopoverTrigger render={
          <Button variant="outline" size="sm" data-testid="rule-effectiveness-module-filter">
            {t('modules.label')}
            {modules.length > 0 && modules.length < POLICY_MODULES.length && (
              <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">{modules.length}</Badge>
            )}
          </Button>
        } />
        <PopoverContent align="start" className="w-56 p-2">
          <div className="space-y-1">
            {POLICY_MODULES.map((m) => {
              const checked = modules.length === 0 || modules.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleModule(m)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span>{t(`modules.${m}`)}</span>
                  {checked && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger render={
          <Button variant="outline" size="sm" data-testid="rule-effectiveness-duration-filter">
            {t('durationBucket.label')}
            {durationBuckets.length > 0 && durationBuckets.length < OBSERVE_DURATION_BUCKETS.length && (
              <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">{durationBuckets.length}</Badge>
            )}
          </Button>
        } />
        <PopoverContent align="start" className="w-48 p-2">
          <div className="space-y-1">
            {OBSERVE_DURATION_BUCKETS.map((b) => {
              const checked = durationBuckets.length === 0 || durationBuckets.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleBucket(b)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span>{t(`durationBucket.${b}`)}</span>
                  {checked && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
