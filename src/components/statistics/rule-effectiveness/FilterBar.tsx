'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Circle, Funnel, RotateCcw, CalendarIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { MAX_RANGE_DAYS, validateCustomRange, type CustomRange } from './date-range';
import { OBSERVE_DURATION_BUCKETS, RULE_EFFECTIVENESS_STAGES, type ModuleFilterOption, type RuleEffectivenessStageId } from './constants';
import type { ObserveDurationBucket, TimeRange } from '@/lib/api/rule-effectiveness-view';

interface FilterBarProps {
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  customRange: CustomRange;
  onCustomRangeChange: (r: CustomRange) => void;
  stage: RuleEffectivenessStageId | 'all';
  visibleStages: typeof RULE_EFFECTIVENESS_STAGES;
  onStageChange: (stage: RuleEffectivenessStageId | 'all') => void;
  // 相似检测下相似邮件检测/相同主题检测是两条独立策略，筛选项按策略拆分展示，
  // 而不是用 PolicyModule 三选一（那样相似检测只能整体勾选/取消，无法单独看某一条策略）。
  moduleOptions: ModuleFilterOption[];
  visibleModuleOptions: ModuleFilterOption[];
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
  stage,
  visibleStages,
  onStageChange,
  moduleOptions,
  visibleModuleOptions,
  onModuleOptionsChange,
  durationBuckets,
  onDurationBucketsChange,
  onReset,
  leftSlot,
}: FilterBarProps) {
  const t = useTranslations('ruleEffectiveness.filter');
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

      <Popover>
        <PopoverTrigger render={
          <Button
            variant="outline"
            size="sm"
            className="h-11 min-w-44 justify-between rounded-lg px-4 text-base font-normal"
            data-testid="rule-effectiveness-timerange-filter"
            aria-label="时间范围筛选"
          >
            <span>{t(`timeRange.${timeRange}`)}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        } />
        <PopoverContent align="start" className="w-44 p-2">
          <div className="space-y-1">
            {TIME_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => onTimeRangeChange(range)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted ${timeRange === range ? 'bg-primary text-primary-foreground hover:bg-primary' : ''}`}
              >
                <span>{t(`timeRange.${range}`)}</span>
                {timeRange === range && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {timeRange === 'custom' && (
        <Popover>
          <PopoverTrigger render={
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-11 min-w-64 justify-start rounded-lg px-3 text-left text-sm font-normal',
                !draft.start && !draft.end && 'text-muted-foreground',
              )}
              data-testid="rule-effectiveness-custom-date-filter"
              aria-label="自定义日期范围"
            >
              <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              {draft.start && draft.end
                ? `${draft.start} ~ ${draft.end}`
                : draft.start || draft.end || '选择日期范围'}
            </Button>
          } />
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={
                draft.start || draft.end
                  ? {
                      from: draft.start ? parseISO(draft.start) : undefined,
                      to: draft.end ? parseISO(draft.end) : undefined,
                    }
                  : undefined
              }
              onSelect={(range) => {
                const next = {
                  start: range?.from ? format(range.from, 'yyyy-MM-dd') : '',
                  end: range?.to ? format(range.to, 'yyyy-MM-dd') : '',
                };
                editDraft(next);
              }}
            />
            {error && (
              <p role="alert" className="border-t border-border px-3 py-2 text-sm text-danger">
                {t(`customRange.error.${error}`, { max: MAX_RANGE_DAYS })}
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}

      <Popover>
        <PopoverTrigger render={
          <Button type="button" variant="outline" size="sm" className="h-11 min-w-60 justify-between rounded-lg border-l-4 border-l-muted-foreground px-4 text-base font-normal" data-testid="rule-effectiveness-stage-filter" aria-label="策略阶段筛选">
            <span className="flex items-center gap-2">
              {stage === 'all' ? (
                <span className="flex items-center gap-1" aria-hidden="true">
                  <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />
                  <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />
                </span>
              ) : (
                <Circle className="h-3 w-3 fill-current" style={{ color: RULE_EFFECTIVENESS_STAGES.find((item) => item.id === stage)?.color }} aria-hidden="true" />
              )}
              {stage === 'all' ? '全部阶段' : visibleStages.find((item) => item.id === stage)?.label}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        } />
        <PopoverContent align="start" className="w-72 p-2">
          <div className="space-y-1">
            <button type="button" onClick={() => onStageChange('all')} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${stage === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <span className="flex items-center gap-2"><Circle className="h-3 w-3 fill-current text-muted-foreground" />全部阶段</span>
              {stage === 'all' && <Check className="h-4 w-4" />}
            </button>
            {visibleStages.map((item) => (
              <button key={item.id} type="button" onClick={() => onStageChange(item.id)} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${stage === item.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                <span className="flex items-center gap-2"><Circle className="h-3 w-3 fill-current" style={{ color: item.color }} />{item.label}<span className="text-muted-foreground">({item.modules.length})</span></span>
                {stage === item.id && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger render={
          <Button variant="outline" size="sm" className="h-11 min-w-60 justify-between rounded-lg px-4 text-base font-normal" data-testid="rule-effectiveness-module-filter">
            {moduleOptions.length === 0 ? '策略模块' : `已选 ${moduleOptions.length} 个策略模块`}
            {moduleOptions.length > 0 && moduleOptions.length < visibleModuleOptions.length && (
              <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">{moduleOptions.length}</Badge>
            )}
            <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        } />
        <PopoverContent align="start" className="w-56 p-2">
          <div className="space-y-1">
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {visibleStages.map((stageItem) => {
                const modules = stageItem.modules.filter((module) => visibleModuleOptions.includes(module));
                if (modules.length === 0) return null;
                return (
                  <div key={stageItem.id}>
                    <div className="flex items-center gap-2 bg-muted px-2 py-1 text-xs text-muted-foreground">
                      <Circle className="h-2.5 w-2.5 fill-current" style={{ color: stageItem.color }} />
                      {stageItem.label}
                    </div>
                    {modules.map((m) => {
                      const checked = moduleOptions.length === 0 || moduleOptions.includes(m);
                      return (
                        <button key={m} type="button" onClick={() => toggleModule(m)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted">
                          <span>{m === 'recipient_check' ? '收件人检测' : m === 'intent_engine' ? '意图引擎' : t(`modules.${m}`)}</span>
                          {checked && <Check className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
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
