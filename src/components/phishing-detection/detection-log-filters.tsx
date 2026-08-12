'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PHISHING_MAIL_STATUS_OPTIONS } from '@/lib/display-status';

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
  // disposition 与 recall_status 不再由本组件的下拉框直接暴露给用户筛选——
  // 筛选栏里原来的「执行动作」下拉已替换为下方的「邮件状态」(mail_status)，
  // 但这两个字段仍保留在筛选状态里，供 KPI 卡片点击穿透使用
  // （见 phishing-overview-page.tsx 的 applyKpiFilter）。
  disposition: string[];
  detection_mode: string[];
  recall_status: string[];
  risk_level: string[];
  // 「邮件状态」：由 disposition + recall_status 派生的邮件处置中心同款状态，
  // 取值见 PHISHING_MAIL_STATUS_OPTIONS。真实后端接口未提供该维度的查询参数，
  // 因此该筛选目前仅在 Mock 模式下保证结果准确（见 mockPhishingLogMatchesQuery）。
  mail_status: string[];
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
  // 「邮件状态」选项直接复用「邮件处置中心」的文案 key，保证同一状态在两个
  // 模块的筛选下拉框和表格列里显示的文案完全一致。
  const ted = useTranslations('emailDisposal');
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
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
          options={PHISHING_MAIL_STATUS_OPTIONS.map((status) => ({
            value: status,
            labelKey: `filters.statuses.${status}`,
          }))}
          value={value.mail_status}
          onChange={(next) => update('mail_status', next)}
          placeholder={t('filters.mailStatus')}
          labelPrefix="filters.statuses"
          t={ted}
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
          size="sm"
          className="h-9 flex-shrink-0 gap-1.5 bg-blue-600 px-4 text-white hover:bg-blue-700"
          onClick={submitKeyword}
        >
          <Search className="h-4 w-4" />
          {tc('search')}
        </Button>

        <Button variant="outline" size="sm" className="h-9 flex-shrink-0 gap-1.5 px-3" onClick={resetFilters}>
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
