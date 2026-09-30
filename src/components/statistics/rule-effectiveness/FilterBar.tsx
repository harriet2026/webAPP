'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Circle, Funnel, RotateCcw } from 'lucide-react';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { MAX_RANGE_DAYS, validateCustomRange, type CustomRange } from './date-range';
import { MODULE_FILTER_OPTIONS, OBSERVE_DURATION_BUCKETS, type ModuleFilterOption } from './constants';
import type { ObserveDurationBucket, TimeRange } from '@/lib/api/rule-effectiveness-view';

interface FilterBarProps {
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  customRange: CustomRange;
  onCustomRangeChange: (r: CustomRange) => void;
  // 相似检测下相似邮件检测/相同主题检测是两条独立策略，筛选项按策略拆分展示，
  // 而不是用 PolicyModule 三选一（那样相似检测只能整体勾选/取消，无法单独看某一条策略）。
  moduleOptions: ModuleFilterOption[];
  onModuleOptionsChange: (m: ModuleFilterOption[]) => void;
  durationBuckets: ObserveDurationBucket[];
  onDurationBucketsChange: (b: ObserveDurationBucket[]) => void;
  onReset: () => void;
  leftSlot?: ReactNode;
}

const TIME_RANGES: TimeRange[] = ['today', '7d', '30d', 'custom'];

export const CUSTOM_RANGE_DEBOUNCE_MS = 500;

export function FilterBar({
  timeRange,
  onTimeRangeChange,
  customRange,
  onCustomRangeChange,
  moduleOptions,
  onModuleOptionsChange,
  durationBuckets,
  onDurationBucketsChange,
  onReset,
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

  const toggleModule = (m: ModuleFilterOption) => {
    if (moduleOptions.includes(m)) {
      onModuleOptionsChange(moduleOptions.filter((x) => x !== m));
    } else {
      onModuleOptionsChange([...moduleOptions, m]);
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
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-6 py-5 shadow-sm md:flex-nowrap"
      data-testid="rule-effectiveness-filter-bar"
    >
      {leftSlot ?? <Funnel className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}

      <SegmentedControl
        value={timeRange}
        onChange={onTimeRangeChange}
        size="sm"
        testIdPrefix="rule-effectiveness-timerange"
        options={TIME_RANGES.map((r) => ({ value: r, label: t(`timeRange.${r}`) }))}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 min-w-60 justify-between rounded-lg border-l-4 border-l-muted-foreground px-4 text-base font-normal"
        data-testid="rule-effectiveness-stage-filter"
        aria-label="策略阶段筛选"
      >
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1" aria-hidden="true">
            <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />
            <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />
          </span>
          全部阶段
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </Button>

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
          <Button variant="outline" size="sm" className="h-11 min-w-60 justify-between rounded-lg px-4 text-base font-normal" data-testid="rule-effectiveness-module-filter">
            {moduleOptions.length === 0 ? '策略模块' : `已选 ${moduleOptions.length} 个策略模块`}
            {moduleOptions.length > 0 && moduleOptions.length < MODULE_FILTER_OPTIONS.length && (
              <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">{moduleOptions.length}</Badge>
            )}
            <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        } />
        <PopoverContent align="start" className="w-56 p-2">
          <div className="space-y-1">
            {MODULE_FILTER_OPTIONS.map((m) => {
              const checked = moduleOptions.length === 0 || moduleOptions.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleModule(m)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span>
                    {m === 'recipient_check' ? '收件人检测' : m === 'intent_engine' ? '意图引擎' : t(`modules.${m}`)}
                  </span>
                  {checked && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger render={
          <Button variant="outline" size="sm" className="h-11 min-w-60 justify-between rounded-lg px-4 text-base font-normal" data-testid="rule-effectiveness-duration-filter">
            {t('durationBucket.label')}
            {durationBuckets.length > 0 && durationBuckets.length < OBSERVE_DURATION_BUCKETS.length && (
              <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">{durationBuckets.length}</Badge>
            )}
            <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
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

      <Button type="button" variant="ghost" size="sm" onClick={onReset} data-testid="rule-effectiveness-reset">
        <RotateCcw data-icon="inline-start" />
        重置
      </Button>
    </div>
  );
}
