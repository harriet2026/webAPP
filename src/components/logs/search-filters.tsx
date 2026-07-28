'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Search, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { AdvancedFilterBuilder } from '@/components/logs/advanced-filter-builder';
import type { SearchFieldDef, AdvancedFilter } from '@/types/log';
import { apiRequest } from '@/lib/api/client';
import {
  SearchFilterPanel,
  type SearchFilterCondition,
} from '@/components/shared/search-filter-panel';

const searchSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  sender: z.string().optional(),
  recipient: z.string().optional(),
  subject: z.string().optional(),
  action: z.string().optional(),
});

type SearchForm = z.infer<typeof searchSchema>;

const EMPTY_SEARCH_FORM: SearchForm = {
  start_date: '',
  end_date: '',
  sender: '',
  recipient: '',
  subject: '',
  action: '',
};

interface SearchFiltersProps {
  onSearch: (params: SearchForm & { advanced_filters?: string }) => void;
  onReset: () => void;
  defaultValues?: Partial<SearchForm>;
  initialAdvancedFilters?: AdvancedFilter;
}

export function SearchFilters({ onSearch, onReset, defaultValues, initialAdvancedFilters }: SearchFiltersProps) {
  const t = useTranslations();
  const form = useForm<SearchForm>({
    resolver: zodResolver(searchSchema),
    defaultValues: { ...EMPTY_SEARCH_FORM, ...defaultValues },
  });

  const [advancedOpen, setAdvancedOpen] = useState(
    () => initialAdvancedFilters?.groups.some((group) => group.conditions.length > 0) ?? false,
  );
  const [fields, setFields] = useState<SearchFieldDef[]>([]);
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilter>(initialAdvancedFilters || { operator: 'AND', groups: [] });
  const startDate = useWatch({ control: form.control, name: 'start_date' });
  const endDate = useWatch({ control: form.control, name: 'end_date' });
  const action = useWatch({ control: form.control, name: 'action' });

  useEffect(() => {
    apiRequest<{ fields: SearchFieldDef[] }>('/mail-logs/fields')
      .then((res) => setFields(res.fields))
      .catch(() => {});
  }, []);

  const handleSubmit = useCallback(
    (data: SearchForm) => {
      const hasAdvanced = advancedFilter.groups.some((g) => g.conditions.length > 0);
      onSearch({
        ...data,
        advanced_filters: hasAdvanced ? JSON.stringify(advancedFilter) : undefined,
      });
    },
    [onSearch, advancedFilter]
  );

  const handleReset = useCallback(() => {
    // SearchFilterPanel is intentionally not a native <form>. Supplying every
    // field explicitly keeps react-hook-form from falling back to
    // HTMLFormElement.reset(), which would have no form ancestor to target.
    form.reset(EMPTY_SEARCH_FORM);
    setAdvancedFilter({ operator: 'AND', groups: [] });
    onReset();
  }, [form, onReset]);

  const conditions: SearchFilterCondition[] = [
    {
      key: 'date-range',
      className: 'md:col-span-2',
      control: (
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger>
              <Button data-testid="email-logs-filter-start-date" variant="outline" className={cn("h-9 w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate || t('logs.startDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate ? new Date(startDate) : undefined}
                onSelect={(date) => form.setValue('start_date', date ? format(date, 'yyyy-MM-dd') : '')}
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger>
              <Button data-testid="email-logs-filter-end-date" variant="outline" className={cn("h-9 w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate || t('logs.endDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate ? new Date(endDate) : undefined}
                onSelect={(date) => form.setValue('end_date', date ? format(date, 'yyyy-MM-dd') : '')}
              />
            </PopoverContent>
          </Popover>
        </div>
      ),
    },
    {
      key: 'sender',
      control: <Input data-testid="email-logs-filter-sender" placeholder={t('logs.sender')} {...form.register('sender')} />,
    },
    {
      key: 'recipient',
      control: <Input data-testid="email-logs-filter-recipient" placeholder={t('logs.recipient')} {...form.register('recipient')} />,
    },
    {
      key: 'subject',
      control: <Input data-testid="email-logs-filter-subject" placeholder={t('logs.subject')} {...form.register('subject')} />,
    },
    {
      key: 'action',
      control: (
        <Select value={action || ''} onValueChange={(value) => form.setValue('action', value || '')}>
          <SelectTrigger data-testid="email-logs-filter-action"><SelectValue placeholder={t('logs.action')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            <SelectItem value="accept">{t('rules.accept')}</SelectItem>
            <SelectItem value="reject">{t('rules.reject')}</SelectItem>
            <SelectItem value="quarantine">{t('rules.quarantine')}</SelectItem>
            <SelectItem value="sideline">{t('rules.sideline')}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <SearchFilterPanel
      testId="email-logs-search-panel"
      contentClassName="space-y-5"
      conditions={conditions}
      conditionGridClassName="md:grid-cols-2 lg:grid-cols-6"
      afterConditions={
        <div>
        <button
          type="button"
          data-testid="email-logs-advanced-toggle"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {t('advancedFilter.title')}
          {advancedFilter.groups.some((g) => g.conditions.length > 0) && (
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
              {advancedFilter.groups.reduce((sum, g) => sum + g.conditions.length, 0)}
            </span>
          )}
        </button>
        {advancedOpen && fields.length > 0 && (
          <div className="mt-3">
            <AdvancedFilterBuilder fields={fields} value={advancedFilter} onChange={setAdvancedFilter} />
          </div>
        )}
        </div>
      }
      actionsPlacement="footer"
      actionsClassName="justify-end border-t border-border/60 pt-4"
      onSearch={() => {
        void form.handleSubmit(handleSubmit)();
      }}
      onReset={handleReset}
      searchLabel={t('common.search')}
      resetLabel={t('common.reset')}
      searchIcon={<Search className="h-4 w-4" />}
      resetIcon={<RotateCcw className="h-4 w-4" />}
      searchTestId="email-logs-filter-search"
      resetTestId="email-logs-filter-reset"
      searchButtonClassName="gap-2"
      resetButtonClassName="gap-2"
    />
  );
}

export type { SearchForm };
