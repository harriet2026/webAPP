'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const DEFAULT_KEYWORD = '';

interface MultiSelectOption {
  value: string;
  labelKey: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  labelPrefix: string;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}

function MultiSelect({ options, value, onChange, placeholder, labelPrefix, t, tc }: MultiSelectProps) {
  const toggle = (val: string) => {
    onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);
  };
  const summary = value.length === 0
    ? placeholder
    : value.length === 1
      ? t(`${labelPrefix}.${value[0]}`)
      : `${value.length} ${tc('selected')}`;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" className="h-9 justify-between font-normal" />
        }
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-56 p-1')}>
        {options.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(option.value)}
                className="shrink-0"
              />
              <span className="flex-1 truncate">{t(option.labelKey)}</span>
              {checked ? <Check className="h-3 w-3 opacity-50" /> : null}
            </label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export type TimeRangeKey = 'today' | '7d' | '30d' | 'custom';

export interface DetectionFilterState {
  keyword: string;
  disposition: string[];
  detection_mode: string[];
  recall_status: string[];
  risk_level: string[];
  rangeKey: TimeRangeKey;
  start: string;
  end: string;
}

interface DetectionLogFiltersProps {
  value: DetectionFilterState;
  onChange: (next: DetectionFilterState) => void;
  onReset: () => void;
}

export function DetectionLogFilters({ value, onChange, onReset }: DetectionLogFiltersProps) {
  const t = useTranslations('phishingDetection');
  const tc = useTranslations('common');
  const [keywordDraft, setKeywordDraft] = useState(value.keyword);

  const update = <K extends keyof DetectionFilterState>(key: K, next: DetectionFilterState[K]) => {
    onChange({ ...value, [key]: next });
  };
  const submitKeyword = () => {
    const nextKeyword = keywordDraft.trim();
    setKeywordDraft(nextKeyword);
    update('keyword', nextKeyword);
  };
  const resetFilters = () => {
    setKeywordDraft(DEFAULT_KEYWORD);
    onReset();
  };

  return (
    <div className="space-y-3" data-testid="phishing-log-filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            data-testid="phishing-log-keyword"
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitKeyword();
              }
            }}
            placeholder={t('filters.keywordPlaceholder')}
            className="h-9 w-full pl-9"
          />
        </div>

        <MultiSelect
          options={[
            { value: 'quarantine', labelKey: 'disposition.quarantine' },
            { value: 'mark', labelKey: 'disposition.mark' },
            { value: 'pass', labelKey: 'disposition.pass' },
            { value: 'audit', labelKey: 'disposition.audit' },
            { value: 'pending', labelKey: 'disposition.pending' },
            { value: 'processing', labelKey: 'disposition.processing' },
            { value: 'failed', labelKey: 'disposition.failed' },
            { value: 'manual_hold', labelKey: 'disposition.manual_hold' },
            { value: 'unknown', labelKey: 'disposition.unknown' },
          ]}
          value={value.disposition}
          onChange={(next) => update('disposition', next)}
          placeholder={t('filters.disposition')}
          labelPrefix="disposition"
          t={t}
          tc={tc}
        />

        <MultiSelect
          options={[
            { value: 'realtime', labelKey: 'detectionMode.realtime' },
            { value: 'observe', labelKey: 'detectionMode.observe' },
          ]}
          value={value.detection_mode}
          onChange={(next) => update('detection_mode', next)}
          placeholder={t('filters.detectionMode')}
          labelPrefix="detectionMode"
          t={t}
          tc={tc}
        />

        <MultiSelect
          options={[
            { value: 'none', labelKey: 'recallStatus.none' },
            { value: 'pending_processing', labelKey: 'recallStatus.pending_processing' },
            { value: 'pending_recall', labelKey: 'recallStatus.pending_recall' },
            { value: 'recalled', labelKey: 'recallStatus.recalled' },
            { value: 'recall_failed', labelKey: 'recallStatus.recall_failed' },
            { value: 'expanded', labelKey: 'recallStatus.expanded' },
          ]}
          value={value.recall_status}
          onChange={(next) => update('recall_status', next)}
          placeholder={t('filters.recallStatus')}
          labelPrefix="recallStatus"
          t={t}
          tc={tc}
        />

        <MultiSelect
          options={[
            { value: 'critical', labelKey: 'riskLevel.critical' },
            { value: 'high', labelKey: 'riskLevel.high' },
            { value: 'medium', labelKey: 'riskLevel.medium' },
            { value: 'low', labelKey: 'riskLevel.low' },
            { value: 'none', labelKey: 'riskLevel.none' },
          ]}
          value={value.risk_level}
          onChange={(next) => update('risk_level', next)}
          placeholder={t('filters.riskLevel')}
          labelPrefix="riskLevel"
          t={t}
          tc={tc}
        />

        <Button
          data-testid="phishing-log-search"
          size="sm"
          className="h-9 flex-shrink-0 gap-1.5 bg-blue-600 px-4 text-white hover:bg-blue-700"
          onClick={submitKeyword}
        >
          <Search className="h-4 w-4" />
          {tc('search')}
        </Button>

        <Button data-testid="phishing-log-reset" variant="outline" size="sm" className="h-9 flex-shrink-0 gap-1.5 px-3" onClick={resetFilters}>
          <RotateCcw className="h-4 w-4" />
          {tc('reset')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(['today', '7d', '30d', 'custom'] as TimeRangeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => update('rangeKey', key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                value.rangeKey === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent',
              )}
            >
              {t(`filters.range.${key}`)}
            </button>
          ))}
        </div>
        {value.rangeKey === 'custom' && (
          <div className="flex items-center gap-2">
            <Input
              type="datetime-local"
              value={value.start}
              onChange={(e) => update('start', e.target.value)}
              className="h-9 w-48"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <Input
              type="datetime-local"
              value={value.end}
              onChange={(e) => update('end', e.target.value)}
              className="h-9 w-48"
            />
          </div>
        )}
      </div>
    </div>
  );
}
