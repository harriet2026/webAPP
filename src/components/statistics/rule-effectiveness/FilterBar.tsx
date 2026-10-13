'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarIcon, Check, ChevronDown, Circle, Funnel, RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { enUS, ru, th, zhCN } from 'date-fns/locale';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MAX_RANGE_DAYS, validateCustomRange, type CustomRange } from './date-range';
import { MODULE_FILTER_OPTIONS, RULE_EFFECTIVENESS_STAGES, OBSERVE_DURATION_BUCKETS, type ModuleFilterOption, type RuleEffectivenessStageId } from './constants';
import type { ObserveDurationBucket, TimeRange } from '@/lib/api/rule-effectiveness-view';

interface FilterBarProps {
  stage?: RuleEffectivenessStageId | 'all';
  onStageChange?: (stage: RuleEffectivenessStageId | 'all') => void;
  visibleModuleOptions?: ModuleFilterOption[];
  visibleStages?: typeof RULE_EFFECTIVENESS_STAGES;
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

// 空数组表示全选（勾选状态按此渲染），切换必须在实际选中集合上进行（GT-14375）：
// 取消最后一项时返回 null（保持不变），勾满时回到空数组，请求不带筛选参数。
function toggleInSelection<T>(all: readonly T[], selected: T[], item: T): T[] | null {
  const effective = selected.length === 0 ? all : selected;
  const next = effective.includes(item) ? effective.filter((x) => x !== item) : [...effective, item];
  if (next.length === 0) return null;
  if (all.every((x) => next.includes(x))) return [];
  return all.filter((x) => next.includes(x));
}

export function FilterBar({
  stage = 'all', onStageChange, visibleModuleOptions = MODULE_FILTER_OPTIONS, visibleStages = RULE_EFFECTIVENESS_STAGES,
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
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const calendarLocale = { zh: zhCN, en: enUS, ru, th }[locale] ?? enUS;
  const [timeRangeOpen, setTimeRangeOpen] = useState(false);

  const [draft, setDraft] = useState<CustomRange>(customRange);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
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
    setPendingStart(null);
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
    const next = toggleInSelection(visibleModuleOptions, moduleOptions, m);
    if (next) onModuleOptionsChange(next);
  };

  const toggleBucket = (b: ObserveDurationBucket) => {
    const next = toggleInSelection(OBSERVE_DURATION_BUCKETS, durationBuckets, b);
    if (next) onDurationBucketsChange(next);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-6 py-5 shadow-sm md:flex-nowrap"
      data-testid="rule-effectiveness-filter-bar"
    >
      {leftSlot ?? <Funnel className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}

      <Popover open={timeRangeOpen} onOpenChange={setTimeRangeOpen}>
        <PopoverTrigger render={
          <Button variant="outline" size="sm" className="h-11 min-w-44 justify-between rounded-lg px-4 text-base font-normal"
            data-testid="rule-effectiveness-timerange-filter" aria-label={t('timeRangeLabel')}>
            <span>{t('timeRangeValue', { range: t(`timeRange.${timeRange}`) })}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        } />
        <PopoverContent align="start" className="w-44 p-2">
          <div className="space-y-1">
            {TIME_RANGES.map((range) => (
              <button key={range} type="button" data-testid={`rule-effectiveness-timerange-${range}`}
                aria-pressed={timeRange === range}
                onClick={() => { cancelPending(); onTimeRangeChange(range); setTimeRangeOpen(false); }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted ${timeRange === range ? 'bg-primary text-primary-foreground hover:bg-primary' : ''}`}>
                <span>{t(`timeRange.${range}`)}</span>
                {timeRange === range && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {timeRange === 'custom' && (
        <Popover onOpenChange={(open) => {
          if (!open && pendingStart) {
            cancelPending();
            setDraft(customRange);
            setPendingStart(null);
            setError(null);
          }
        }}>
          <PopoverTrigger render={
            <Button variant="outline" size="sm" className={cn('h-11 min-w-64 justify-start rounded-lg px-3 text-left text-sm font-normal', !draft.start && !draft.end && 'text-muted-foreground')}
              data-testid="rule-effectiveness-custom-date-filter" aria-label={t('customRange.label')}>
              <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              {draft.start || draft.end
                ? t('timeRangeValue', { range: [draft.start, draft.end].filter(Boolean).join(' ~ ') })
                : t('customRange.placeholder')}
            </Button>
          } />
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" locale={calendarLocale} numberOfMonths={2}
              data-testid="rule-effectiveness-custom-calendar"
              components={{
                PreviousMonthButton: (props) => <button {...props} data-testid="rule-effectiveness-custom-date-filter-previous-month" />,
                NextMonthButton: (props) => <button {...props} data-testid="rule-effectiveness-custom-date-filter-next-month" />,
                DayButton: (props) => <CalendarDayButton {...props} locale={calendarLocale}
                  data-testid={props.modifiers.outside ? undefined : `rule-effectiveness-custom-date-filter-day-${format(props.day.date, 'yyyy-MM-dd')}`} />,
              }}
              defaultMonth={draft.start ? parseISO(draft.start) : undefined}
              selected={draft.start ? { from: parseISO(draft.start), to: draft.end ? parseISO(draft.end) : undefined } : undefined}
              onSelect={(_range, day) => {
                const date = format(day, 'yyyy-MM-dd');
                if (pendingStart === null) {
                  cancelPending();
                  setPendingStart(date);
                  setDraft({ start: date, end: '' });
                  setError(null);
                } else {
                  const [start, end] = [pendingStart, date].sort();
                  setPendingStart(null);
                  editDraft({ start, end });
                }
              }}
            />
            {error && <p role="alert" className="border-t border-border px-3 py-2 text-sm text-danger">
              {t(`customRange.error.${error}`, { max: MAX_RANGE_DAYS })}
            </p>}
          </PopoverContent>
        </Popover>
      )}

      {onStageChange && <Popover>
        <PopoverTrigger render={
          <Button type="button" variant="outline" size="sm" className="h-11 min-w-60 justify-between rounded-lg border-l-4 border-l-muted-foreground px-4 text-base font-normal" data-testid="rule-effectiveness-stage-filter" aria-label={t('stages.label')}>
            <span className="flex items-center gap-2">
              {stage === 'all' ? (
                <span className="flex items-center gap-1" aria-hidden="true">
                  <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />
                  <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />
                </span>
              ) : (
                <Circle className="h-3 w-3 fill-current" style={{ color: RULE_EFFECTIVENESS_STAGES.find((item) => item.id === stage)?.color }} aria-hidden="true" />
              )}
              {t(`stages.${stage}`)}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        } />
        <PopoverContent align="start" className="w-72 p-2">
          <div className="space-y-1">
            <button type="button" data-testid="rule-effectiveness-stage-all" aria-pressed={stage === 'all'} onClick={() => onStageChange('all')} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${stage === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <span className="flex items-center gap-2"><Circle className="h-3 w-3 fill-current text-muted-foreground" />{t('stages.all')}</span>
              {stage === 'all' && <Check className="h-4 w-4" />}
            </button>
            {visibleStages.map((item) => (
              <button key={item.id} type="button" data-testid={`rule-effectiveness-stage-${item.id}`} aria-pressed={stage === item.id} onClick={() => onStageChange(item.id)} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${stage === item.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                <span className="flex items-center gap-2"><Circle className="h-3 w-3 fill-current" style={{ color: item.color }} />{t(`stages.${item.id}`)}<span className="text-muted-foreground">({item.modules.length})</span></span>
                {stage === item.id && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>}

      <Popover>
        <PopoverTrigger render={
          <Button variant="outline" size="sm" className="h-11 min-w-60 justify-between rounded-lg px-4 text-base font-normal" data-testid="rule-effectiveness-module-filter">
            {moduleOptions.length === 0 ? t('modules.label') : t('modules.selectedCount', { count: moduleOptions.length })}
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
                      {t(`stages.${stageItem.id}`)}
                    </div>
                    {modules.map((m) => {
                      const checked = moduleOptions.length === 0 || moduleOptions.includes(m);
                      return (
                        <button key={m} type="button" data-testid={`rule-effectiveness-module-option-${m}`} onClick={() => toggleModule(m)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted">
                          <span>{t(`modules.${m}`)}</span>
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
                  data-testid={`rule-effectiveness-duration-option-${b}`}
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
        <RotateCcw data-icon="inline-start" aria-hidden="true" />
        {tCommon('reset')}
      </Button>
    </div>
  );
}
