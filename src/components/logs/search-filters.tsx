'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
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

const searchSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  sender: z.string().optional(),
  recipient: z.string().optional(),
  subject: z.string().optional(),
  action: z.string().optional(),
});

type SearchForm = z.infer<typeof searchSchema>;

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
    defaultValues: defaultValues || {},
  });

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fields, setFields] = useState<SearchFieldDef[]>([]);
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilter>(initialAdvancedFilters || { operator: 'AND', groups: [] });

  useEffect(() => {
    if (initialAdvancedFilters && initialAdvancedFilters.groups.some((g) => g.conditions.length > 0)) {
      setAdvancedFilter(initialAdvancedFilters);
      setAdvancedOpen(true);
    }
  }, [initialAdvancedFilters]);

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
    form.reset();
    setAdvancedFilter({ operator: 'AND', groups: [] });
    onReset();
  }, [form, onReset]);

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        <div className="col-span-2 flex gap-2">
          <Popover>
            <PopoverTrigger>
              <Button variant="outline" className={cn("h-9 w-full justify-start text-left font-normal", !form.watch('start_date') && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {form.watch('start_date') || t('logs.startDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={form.watch('start_date') ? new Date(form.watch('start_date')!) : undefined}
                onSelect={(date) => form.setValue('start_date', date ? format(date, 'yyyy-MM-dd') : '')}
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger>
              <Button variant="outline" className={cn("h-9 w-full justify-start text-left font-normal", !form.watch('end_date') && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {form.watch('end_date') || t('logs.endDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={form.watch('end_date') ? new Date(form.watch('end_date')!) : undefined}
                onSelect={(date) => form.setValue('end_date', date ? format(date, 'yyyy-MM-dd') : '')}
              />
            </PopoverContent>
          </Popover>
        </div>

        <Input placeholder={t('logs.sender')} {...form.register('sender')} />
        <Input placeholder={t('logs.recipient')} {...form.register('recipient')} />
        <Input placeholder={t('logs.subject')} {...form.register('subject')} />

        <Select value={form.watch('action') || ''} onValueChange={(v) => form.setValue('action', v || '')}>
          <SelectTrigger><SelectValue placeholder={t('logs.action')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            <SelectItem value="accept">{t('rules.accept')}</SelectItem>
            <SelectItem value="reject">{t('rules.reject')}</SelectItem>
            <SelectItem value="quarantine">{t('rules.quarantine')}</SelectItem>
            <SelectItem value="sideline">{t('rules.sideline')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <button
          type="button"
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

      <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
        <Button type="button" variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />{t('common.reset')}
        </Button>
        <Button type="submit"><Search className="h-4 w-4 mr-2" />{t('common.search')}</Button>
      </div>
    </form>
  );
}

export type { SearchForm };
