'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { enUS, ru as ruLocale, th as thLocale, zhCN } from 'date-fns/locale';
import { Search, Sparkles, RotateCcw, Filter, ChevronUp, ChevronDown, CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  SearchFilterPanel,
  type SearchFilterCondition,
} from '@/components/shared/search-filter-panel';

export interface LinkFilterValues {
  messageId: string;
  clicker: string;
  sender: string;
  srcUrl: string;
  triggerStage: string;
  finalResult: string;
  userAction: string;
  clickSource: string;
  // html_spec §2.1「点击时间」单日期（yyyy-MM-dd；空=不限）；页面层展开为
  // 当日 [00:00, 24:00) 的 start/end 传给后端区间参数。
  clickDate: string;
}

interface LinkFiltersProps {
  values: LinkFilterValues;
  onChange: (patch: Partial<LinkFilterValues>) => void;
  onSearch: () => void;
  onReset: () => void;
  /** Tenant-scope dropdown slot, rendered only when cloud + platform (spec §4.1). */
  tenantScope?: React.ReactNode;
}

// 与 demo LocalizedDateInput 一致的按语言日期展示格式（ru 为 demo 未覆盖语言，取俄语惯例）。
const DATE_FORMATS: Record<string, { fmt: string; locale: typeof zhCN }> = {
  zh: { fmt: 'yyyy年MM月dd日', locale: zhCN },
  en: { fmt: 'MM/dd/yyyy', locale: enUS },
  th: { fmt: 'dd/MM/yyyy', locale: thLocale },
  ru: { fmt: 'dd.MM.yyyy', locale: ruLocale },
};

export function LinkFilters({ values, onChange, onSearch, onReset, tenantScope }: LinkFiltersProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [aiInput, setAiInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(true); // default-expanded (spec §八)
  const suggestions = t.raw('linkLogs.aiSuggestions') as string[];
  const { fmt: dateFmt, locale: dateLocale } = DATE_FORMATS[locale] ?? DATE_FORMATS.zh;

  // Base UI's <Select.Value> renders the raw selected *value* unless given a
  // formatter; without these maps the triggers read "all" / "passed" instead of
  // the localized labels. 未选择时统一显示「全部」（html_spec §2.1）。
  const triggerStageLabels: Record<string, string> = {
    all: t('common.all'),
    cloud_intel: t('linkLogs.stages.cloud_intel'),
    local_blacklist: t('linkLogs.stages.local_blacklist'),
    phishing_agent: t('linkLogs.stages.phishing_agent'),
  };
  const finalResultLabels: Record<string, string> = {
    all: t('common.all'),
    alerted: t('linkLogs.results.alerted'),
    passed: t('linkLogs.results.passed'),
  };
  const userActionLabels: Record<string, string> = {
    all: t('common.all'),
    proceeded: t('linkLogs.actions.proceeded'),
    abandoned: t('linkLogs.actions.abandoned'),
    skipped_deep_inspect: t('linkLogs.actions.skippedDeepInspect'),
  };
  const clickSourceLabels: Record<string, string> = {
    all: t('common.all'),
    body: t('linkLogs.sources.body'),
    attachment: t('linkLogs.sources.attachment'),
  };

  const conditions: SearchFilterCondition[] = [
    ...(tenantScope
      ? [{
          key: 'tenant-scope',
          label: t('linkLogs.tenantScope'),
          control: tenantScope,
        }]
      : []),
    {
      key: 'click-date',
      label: t('linkLogs.columns.clickTime'),
      control: (
        <Popover>
          {/* base-ui Trigger 自带 <button>，用 render 合并进 Button，避免嵌套 button。 */}
          <PopoverTrigger render={
            <Button data-testid="link-logs-filter-click-date" variant="outline"
              className={cn('h-9 w-full justify-start text-left font-normal', !values.clickDate && 'text-muted-foreground')} />
          }>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {values.clickDate
              ? format(new Date(`${values.clickDate}T00:00:00`), dateFmt, { locale: dateLocale })
              : t('linkLogs.filters.selectDate')}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={dateLocale}
              selected={values.clickDate ? new Date(`${values.clickDate}T00:00:00`) : undefined}
              onSelect={(d) => onChange({ clickDate: d ? format(d, 'yyyy-MM-dd') : '' })}
            />
          </PopoverContent>
        </Popover>
      ),
    },
    {
      key: 'message-id',
      label: t('linkLogs.columns.tid'),
      control: (
        <Input
          data-testid="link-logs-filter-message-id"
          placeholder={t('linkLogs.filters.tidPlaceholder')}
          value={values.messageId}
          onChange={(e) => onChange({ messageId: e.target.value })}
          className="h-9 w-full"
        />
      ),
    },
    {
      key: 'clicker',
      label: t('linkLogs.columns.clicker'),
      control: (
        <Input
          data-testid="link-logs-filter-clicker"
          placeholder={t('linkLogs.filters.emailPlaceholder')}
          value={values.clicker}
          onChange={(e) => onChange({ clicker: e.target.value })}
          className="h-9 w-full"
        />
      ),
    },
    {
      key: 'sender',
      label: t('linkLogs.filters.sender'),
      control: (
        <Input
          data-testid="link-logs-filter-sender"
          placeholder={t('linkLogs.filters.emailPlaceholder')}
          value={values.sender}
          onChange={(e) => onChange({ sender: e.target.value })}
          className="h-9 w-full"
        />
      ),
    },
    {
      key: 'src-url',
      label: t('linkLogs.columns.originalUrl'),
      control: (
        <Input
          data-testid="link-logs-filter-src-url"
          placeholder={t('linkLogs.filters.urlPlaceholder')}
          value={values.srcUrl}
          onChange={(e) => onChange({ srcUrl: e.target.value })}
          className="h-9 w-full"
        />
      ),
    },
    {
      key: 'trigger-stage',
      label: t('linkLogs.columns.triggerStage'),
      control: (
        <Select value={values.triggerStage || 'all'} onValueChange={(v) => onChange({ triggerStage: v == null || v === 'all' ? '' : v })}>
          <SelectTrigger data-testid="link-logs-filter-trigger-stage" className="h-9 w-full">
            <SelectValue>{(v: string) => triggerStageLabels[v] ?? t('common.all')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="cloud_intel">{t('linkLogs.stages.cloud_intel')}</SelectItem>
            <SelectItem value="local_blacklist">{t('linkLogs.stages.local_blacklist')}</SelectItem>
            <SelectItem value="phishing_agent">{t('linkLogs.stages.phishing_agent')}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'final-result',
      label: t('linkLogs.columns.finalResult'),
      control: (
        <Select value={values.finalResult || 'all'} onValueChange={(v) => onChange({ finalResult: v == null || v === 'all' ? '' : v })}>
          <SelectTrigger data-testid="link-logs-filter-final-result" className="h-9 w-full">
            <SelectValue>{(v: string) => finalResultLabels[v] ?? t('common.all')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="alerted">{t('linkLogs.results.alerted')}</SelectItem>
            <SelectItem value="passed">{t('linkLogs.results.passed')}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'user-action',
      label: t('linkLogs.columns.userAction'),
      control: (
        <Select value={values.userAction || 'all'} onValueChange={(v) => onChange({ userAction: v == null || v === 'all' ? '' : v })}>
          <SelectTrigger data-testid="link-logs-filter-user-action" className="h-9 w-full">
            <SelectValue>{(v: string) => userActionLabels[v] ?? t('common.all')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="proceeded">{t('linkLogs.actions.proceeded')}</SelectItem>
            <SelectItem value="abandoned">{t('linkLogs.actions.abandoned')}</SelectItem>
            <SelectItem value="skipped_deep_inspect">{t('linkLogs.actions.skippedDeepInspect')}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'click-source',
      label: t('linkLogs.detail.clickSource'),
      control: (
        <Select value={values.clickSource || 'all'} onValueChange={(v) => onChange({ clickSource: v == null || v === 'all' ? '' : v })}>
          <SelectTrigger data-testid="link-logs-filter-click-source" className="h-9 w-full">
            <SelectValue>{(v: string) => clickSourceLabels[v] ?? t('common.all')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="body">{t('linkLogs.sources.body')}</SelectItem>
            <SelectItem value="attachment">{t('linkLogs.sources.attachment')}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <SearchFilterPanel
      toolbar={
        <div className="relative">
          <Input
            data-testid="link-logs-ai-input"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder={t('linkLogs.aiPlaceholder')}
            className={cn('h-9 w-full pr-10', aiInput.trim() && 'border-blue-500')}
          />
          <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
      }
      toolbarClassName="items-center"
      toolbarContentClassName="max-w-[60%]"
      suggestions={
        suggestions?.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {suggestions.map((suggestion, index) => (
              <span key={suggestion} className="flex items-center">
                {index > 0 && <span className="mx-2 text-gray-300">|</span>}
                <button
                  type="button"
                  data-testid={`link-logs-ai-suggestion-${index + 1}`}
                  onClick={() => setAiInput(suggestion)}
                  className="text-muted-foreground hover:text-blue-600"
                >
                  {suggestion}
                </button>
              </span>
            ))}
          </div>
        ) : null
      }
      conditions={conditions}
      showConditions={showAdvanced}
      conditionsTestId="link-logs-advanced-panel"
      conditionsSectionClassName="border-t pt-4"
      conditionGridClassName="grid-cols-4"
      actionsPlacement="toolbar"
      onSearch={onSearch}
      onReset={onReset}
      searchLabel={t('linkLogs.search')}
      resetLabel={t('linkLogs.reset')}
      searchIcon={<Search className="h-4 w-4" />}
      resetIcon={<RotateCcw className="h-4 w-4" />}
      searchTestId="link-logs-search"
      resetTestId="link-logs-reset"
      searchButtonClassName="h-9 gap-1.5"
      resetButtonClassName="h-9 gap-1.5"
      extraActions={
        <>
          <Button data-testid="link-logs-advanced-toggle" onClick={() => setShowAdvanced((v) => !v)} variant="outline" size="sm"
            className={cn('h-9 gap-1.5', showAdvanced && 'bg-blue-50 border-blue-300 text-blue-600')}>
            <Filter className="h-4 w-4" />
            {showAdvanced ? t('linkLogs.collapse') : t('linkLogs.advancedFilter')}
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </>
      }
    />
  );
}
