'use client';

import { useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type TimeRangeKey = 'today' | '7d' | '30d' | 'custom';

export interface RunFilterState {
  keyword: string;
  rangeKey: TimeRangeKey;
  start: string;
  end: string;
  status: string[];
  recall_status: string[];
  risk_level: string[];
}

interface MultiSelectProps {
  options: { value: string; labelKey: string }[];
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
  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? t(`${labelPrefix}.${value[0]}`)
        : `${value.length} ${tc('selected')}`;
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="h-9 justify-between font-normal" />}>
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

const DEFAULT_FILTERS: RunFilterState = {
  keyword: '',
  rangeKey: 'today',
  start: '',
  end: '',
  status: [],
  recall_status: [],
  risk_level: [],
};

export { DEFAULT_FILTERS };

interface RunFiltersProps {
  value: RunFilterState;
  onChange: (next: RunFilterState) => void;
  onReset: () => void;
}

export function RunFilters({ value, onChange, onReset }: RunFiltersProps) {
  const t = useTranslations('threatRetro');
  const tc = useTranslations('common');

  const update = <K extends keyof RunFilterState>(key: K, next: RunFilterState[K]) => {
    onChange({ ...value, [key]: next });
  };

  const dirty =
    value.keyword !== '' ||
    value.rangeKey !== 'today' ||
    value.start !== '' ||
    value.end !== '' ||
    value.status.length > 0 ||
    value.recall_status.length > 0 ||
    value.risk_level.length > 0;
  const invalidCustomRange = value.rangeKey === 'custom' && value.start !== '' && value.end !== '' && value.end < value.start;

  return (
    <div className="flex flex-wrap items-center gap-2">
        <Input
          value={value.keyword}
          onChange={(e) => update('keyword', e.target.value)}
          placeholder={t('filters.keywordPlaceholder')}
		  className="h-9 min-w-[220px] flex-1"
        />
		<Select value={value.rangeKey} onValueChange={(next) => update('rangeKey', next as TimeRangeKey)}>
		  <SelectTrigger className="h-9 w-[110px] shrink-0">
			<SelectValue>{t(`filters.range.${value.rangeKey}`)}</SelectValue>
		  </SelectTrigger>
		  <SelectContent>
			{(['today', '7d', '30d', 'custom'] as TimeRangeKey[]).map((key) => (
			  <SelectItem key={key} value={key}>{t(`filters.range.${key}`)}</SelectItem>
			))}
		  </SelectContent>
		</Select>
        <MultiSelect
          options={[
            { value: 'pending', labelKey: 'taskStatus.pending' },
            { value: 'running', labelKey: 'taskStatus.running' },
            { value: 'completed', labelKey: 'taskStatus.completed' },
            { value: 'failed', labelKey: 'taskStatus.failed' },
            { value: 'cancelled', labelKey: 'taskStatus.cancelled' },
          ]}
          value={value.status}
          onChange={(next) => update('status', next)}
          placeholder={t('filters.taskStatus')}
          labelPrefix="taskStatus"
          t={t}
          tc={tc}
        />
        <MultiSelect
          options={[
            { value: 'recalled', labelKey: 'recallStatus.recalled' },
            { value: 'pending_recall', labelKey: 'recallStatus.pending_recall' },
            { value: 'recall_failed', labelKey: 'recallStatus.recall_failed' },
            { value: 'no_need', labelKey: 'recallStatus.no_need' },
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
            { value: 'high', labelKey: 'riskLevel.high' },
            { value: 'medium', labelKey: 'riskLevel.medium' },
            { value: 'low', labelKey: 'riskLevel.low' },
          ]}
          value={value.risk_level}
          onChange={(next) => update('risk_level', next)}
          placeholder={t('filters.riskLevel')}
          labelPrefix="riskLevel"
          t={t}
          tc={tc}
        />
        {dirty ? (
          <Button variant="outline" size="sm" onClick={onReset}>
            {tc('reset')}
          </Button>
        ) : null}
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
              min={value.start || undefined}
              aria-invalid={invalidCustomRange}
              onChange={(e) => update('end', e.target.value)}
              className="h-9 w-48"
            />
          </div>
        )}
        {invalidCustomRange ? <p className="text-xs text-destructive">{t('filters.invalidRange')}</p> : null}
    </div>
  );
}
