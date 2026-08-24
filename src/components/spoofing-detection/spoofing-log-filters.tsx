'use client';

import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Clock, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type SpoofTimeRangeKey = 'today' | '7d' | '30d' | 'custom';

export interface SpoofFilterState {
  keyword: string;
  disposition: string[];
  spoof_method: string[];
  category: string[];
  rangeKey: SpoofTimeRangeKey;
  start: string;
  end: string;
}

function MultiSelect({ options, value, onChange, placeholder, labelPrefix, t, tc }: {
  options: { value: string; labelKey: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  labelPrefix: string;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary = value.length === 0 ? placeholder
    : value.length === 1 ? t(`${labelPrefix}.${value[0]}`) : `${value.length} ${tc('selected')}`;
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="h-9 w-[176px] justify-between gap-2 bg-cyan-50/60 font-normal shadow-none" />}>
        <span className="truncate">{summary}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {options.map((o) => {
          const checked = value.includes(o.value);
          return (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox checked={checked} onCheckedChange={() => toggle(o.value)} className="shrink-0" />
              <span className="flex-1 truncate">{t(o.labelKey)}</span>
              {checked ? <Check className="h-3 w-3 opacity-50" /> : null}
            </label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function SpoofingLogFilters({ value, onChange, onReset, onSearch }: {
  value: SpoofFilterState;
  onChange: (next: SpoofFilterState) => void;
  onReset: () => void;
  onSearch: () => void;
}) {
  const t = useTranslations('spoofingDetection');
  const tc = useTranslations('common');
  const update = <K extends keyof SpoofFilterState>(k: K, v: SpoofFilterState[K]) => onChange({ ...value, [k]: v });
  const dispositionValue = value.disposition[0] ?? 'all';
  const dispositionLabel = dispositionValue === 'all' ? t('filters.allDisposal') : t(`disposition.${dispositionValue}`);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[280px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.keyword}
          onChange={(e) => update('keyword', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch();
          }}
          placeholder={t('filters.keywordPlaceholder')}
          className="h-9 w-full pl-9"
        />
      </div>
      <Popover>
        <PopoverTrigger render={<Button variant="outline" className="h-9 gap-1.5 bg-cyan-50/60 px-3 font-normal shadow-none" />}>
          <Clock className="h-4 w-4 text-muted-foreground" />
          {t(`filters.range.${value.rangeKey}`)}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[300px] p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {(['today', '7d', '30d'] as SpoofTimeRangeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => update('rangeKey', k)}
                className={cn(
                  'rounded-md border px-3 py-1 text-xs transition-colors',
                  value.rangeKey === k
                    ? 'border-blue-200 bg-blue-50 text-blue-600'
                    : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/50',
                )}
              >
                {t(`filters.range.${k}`)}
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => update('rangeKey', 'custom')}
              className={cn(
                'rounded-md border px-3 py-1 text-xs transition-colors',
                value.rangeKey === 'custom'
                  ? 'border-blue-200 bg-blue-50 text-blue-600'
                  : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/50',
              )}
            >
              {t('filters.range.custom')}
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <Select
        value={dispositionValue}
        onValueChange={(next) => update('disposition', !next || next === 'all' ? [] : [next])}
      >
        <SelectTrigger className="h-9 w-[120px] bg-background">
          <SelectValue>{dispositionLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allDisposal')}</SelectItem>
          <SelectItem value="accept">{t('disposition.accept')}</SelectItem>
          <SelectItem value="quarantine">{t('disposition.quarantine')}</SelectItem>
          <SelectItem value="reject">{t('disposition.reject')}</SelectItem>
          <SelectItem value="discard">{t('disposition.discard')}</SelectItem>
        </SelectContent>
      </Select>
      <MultiSelect
        t={t}
        tc={tc}
        labelPrefix="spoofMethod"
        placeholder={t('filters.allSpoofMethods')}
        value={value.spoof_method}
        onChange={(n) => update('spoof_method', n)}
        options={[
          { value: 'display_name_spoof', labelKey: 'spoofMethod.display_name_spoof' },
          { value: 'domain_typosquatting', labelKey: 'spoofMethod.domain_typosquatting' },
        ]}
      />
      <Button size="sm" onClick={onSearch} className="h-9 gap-1.5 bg-blue-600 px-4 text-white hover:bg-blue-700">
        <Search className="h-4 w-4" />
        {t('filters.search')}
      </Button>
      <Button variant="outline" size="sm" onClick={onReset} className="h-9 gap-1.5 bg-cyan-50/60 px-3 shadow-none">
        <RotateCcw className="h-4 w-4" />
        {t('filters.reset')}
      </Button>
      {value.rangeKey === 'custom' ? (
        <div className="flex w-full flex-wrap items-center gap-2 pt-1">
          <div className="flex items-center gap-2">
            <Input type="datetime-local" value={value.start} onChange={(e) => update('start', e.target.value)} className="h-9 w-48" />
            <span className="text-xs text-muted-foreground">—</span>
            <Input type="datetime-local" value={value.end} onChange={(e) => update('end', e.target.value)} className="h-9 w-48" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
