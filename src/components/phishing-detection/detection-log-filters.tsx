'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { DISPLAY_STATUSES, type DisplayStatus } from '@/types/email-disposal';
import type { DetectionMode, Disposition, RecallStatus, RiskLevel } from '@/types/phishing-detection';

function MultiSelect<T extends string>({ options, value, onChange, placeholder, selectedLabel }: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T[];
  onChange: (next: T[]) => void;
  placeholder: string;
  selectedLabel: (count: number) => string;
}) {
  const summary = value.length === 0 ? placeholder : value.length === 1 ? options.find((item) => item.value === value[0])?.label ?? value[0] : selectedLabel(value.length);
  return <Popover><PopoverTrigger render={<Button variant="outline" className="h-9 w-full min-w-0 justify-between font-normal" />}><span className="truncate">{summary}</span><ChevronDown className="ml-2 size-4 shrink-0 opacity-60" /></PopoverTrigger><PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1">{options.map((option) => {
    const checked = value.includes(option.value);
    return <MultiSelectOption key={option.value} checked={checked} label={option.label} onToggle={() => onChange(checked ? value.filter((item) => item !== option.value) : [...value, option.value])} />;
  })}</PopoverContent></Popover>;
}

function MultiSelectOption({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  const { pointerHoverProps } = usePointerHover<HTMLLabelElement>();
  return <label {...pointerHoverProps} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[hovered=true]:bg-accent"><Checkbox checked={checked} onCheckedChange={onToggle} /><span className="flex-1">{label}</span>{checked ? <Check className="size-3 opacity-50" /> : null}</label>;
}

function DateTimeRangeInput({ start, end, onStartChange, onEndChange, startLabel, endLabel }: {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  startLabel: string;
  endLabel: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center rounded-md border border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <input aria-label={startLabel} type="datetime-local" value={start} onChange={(event) => onStartChange(event.target.value)} className="h-9 min-w-0 bg-transparent px-3 text-sm outline-none" />
      <span className="text-sm text-muted-foreground">—</span>
      <input aria-label={endLabel} type="datetime-local" value={end} onChange={(event) => onEndChange(event.target.value)} className="h-9 min-w-0 bg-transparent px-3 text-sm outline-none" />
    </div>
  );
}

export type TimeRangeKey = 'today' | '7d' | '30d' | 'custom';
export interface DetectionFilterState {
  keyword: string;
  disposition: Disposition[];
  detection_mode: DetectionMode[];
  recall_status: RecallStatus[];
  risk_level: RiskLevel[];
  mail_status: DisplayStatus[];
  rangeKey: TimeRangeKey;
  start: string;
  end: string;
}

export function DetectionLogFilters({ value, onChange, onReset }: {
  value: DetectionFilterState;
  onChange: (next: DetectionFilterState) => void;
  onReset: () => void;
}) {
  const t = useTranslations('phishingDetection');
  const tc = useTranslations('common');
  const td = useTranslations('emailDisposal');
  const [keyword, setKeyword] = useState(value.keyword);
  const update = <K extends keyof DetectionFilterState>(key: K, next: DetectionFilterState[K]) => onChange({ ...value, [key]: next });
  const submit = () => update('keyword', keyword.trim());
  const selectedLabel = (count: number) => t('filters.selectedCount', { count });
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} placeholder={t('filters.keywordPlaceholder')} className="h-9 w-full pl-9" /></div>
      <div className="w-40 shrink-0"><MultiSelect value={value.mail_status} onChange={(next) => update('mail_status', next)} placeholder={t('filters.mailStatus')} selectedLabel={selectedLabel} options={DISPLAY_STATUSES.map((status) => ({ value: status, label: td(`filters.statuses.${status}`) }))} /></div>
      <div className="w-40 shrink-0"><MultiSelect value={value.detection_mode} onChange={(next) => update('detection_mode', next)} placeholder={t('filters.detectionMode')} selectedLabel={selectedLabel} options={(['realtime', 'observe'] satisfies DetectionMode[]).map((mode) => ({ value: mode, label: t(`detectionMode.${mode}`) }))} /></div>
      <div className="w-40 shrink-0"><MultiSelect value={value.risk_level} onChange={(next) => update('risk_level', next)} placeholder={t('filters.riskLevel')} selectedLabel={selectedLabel} options={(['suspicious', 'low', 'medium', 'high'] satisfies RiskLevel[]).map((risk) => ({ value: risk, label: t(`riskLevel.${risk}`) }))} /></div>
      <Button size="sm" className="h-9 shrink-0 gap-1.5" onClick={submit}><Search className="size-4" />{tc('search')}</Button><Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5" onClick={() => { setKeyword(''); onReset(); }}><RotateCcw className="size-4" />{tc('reset')}</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-md border border-border">{(['today', '7d', '30d', 'custom'] as TimeRangeKey[]).map((range) => <Button key={range} type="button" size="sm" variant={value.rangeKey === range ? 'default' : 'ghost'} onClick={() => update('rangeKey', range)} className={cn('h-9 rounded-none border-0 px-4 text-sm shadow-none', value.rangeKey !== range && 'text-muted-foreground data-[hovered=true]:bg-accent')}>{t(`filters.range.${range}`)}</Button>)}</div>
      {value.rangeKey === 'custom' ? <DateTimeRangeInput start={value.start} end={value.end} onStartChange={(next) => update('start', next)} onEndChange={(next) => update('end', next)} startLabel={t('filters.start')} endLabel={t('filters.end')} /> : null}
    </div>
  </div>;
}
