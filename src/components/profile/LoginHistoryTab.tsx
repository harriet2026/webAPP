'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru as ruLocale, th as thLocale, zhCN } from 'date-fns/locale';
import type { Matcher } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';
import { useLoginHistory } from './api';
import { formatTimestamp } from '@/lib/format-time';
import { ServerPagination } from '@/components/shared/server-pagination';
import type { LoginResult } from './types';
import { browserLocalDayBoundary } from './login-history-date-range';

const DATE_FORMATS: Record<string, { fmt: string; locale: typeof zhCN }> = {
  zh: { fmt: 'yyyy年MM月dd日', locale: zhCN },
  en: { fmt: 'MM/dd/yyyy', locale: enUS },
  th: { fmt: 'dd/MM/yyyy', locale: thLocale },
  ru: { fmt: 'dd.MM.yyyy', locale: ruLocale },
};

function localCalendarDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

interface HistoryDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  localeCode: string;
  min?: string;
  max?: string;
  invalid: boolean;
  errorId: string;
  testId: string;
}

function HistoryDatePicker({
  value,
  onChange,
  placeholder,
  localeCode,
  min,
  max,
  invalid,
  errorId,
  testId,
}: HistoryDatePickerProps) {
  const [open, setOpen] = useState(false);
  const dateConfig = DATE_FORMATS[localeCode] ?? DATE_FORMATS.zh;
  const selected = value ? localCalendarDate(value) : undefined;
  const disabledDates: Matcher[] = [];
  if (min) disabledDates.push({ before: localCalendarDate(min) });
  if (max) disabledDates.push({ after: localCalendarDate(max) });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-44 justify-start text-left font-normal',
              !value && 'text-muted-foreground',
            )}
            aria-label={placeholder}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            data-testid={testId}
          />
        }
      >
        <CalendarIcon className="mr-1 h-4 w-4" />
        {selected ? format(selected, dateConfig.fmt, { locale: dateConfig.locale }) : placeholder}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={dateConfig.locale}
          selected={selected}
          disabled={disabledDates}
          onSelect={(date) => {
            onChange(date ? format(date, 'yyyy-MM-dd') : '');
            if (date) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function ResultBadge({ result, t }: { result: LoginResult; t: (k: string) => string }) {
  return result === 'success' ? (
    <Badge variant="outline" className="border-green-200 bg-green-50 font-normal text-green-600 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
      {t('history.success')}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-200 bg-red-50 font-normal text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
      {t('history.fail')}
    </Badge>
  );
}

export function LoginHistoryTab() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const locale = useLocale().split('-')[0];

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [query, setQuery] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isFetching } = useLoginHistory({
    start: browserLocalDayBoundary(query.start, 'start'),
    end: browserLocalDayBoundary(query.end, 'end'),
    page,
    page_size: pageSize,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  // ISO calendar dates sort lexicographically, so this comparison is both
  // timezone-free and identical to the values sent to the API.
  const invalidRange = Boolean(start && end && start > end);
  const rangeErrorId = 'profile-history-range-error';

  const runQuery = () => {
    if (invalidRange) return;
    setQuery({ start, end });
    setPage(1);
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium">{t('tabs.history')}</h3>
      <div className="my-4 border-t border-border" />

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{tc('timeRange')}</span>
          <HistoryDatePicker
            value={start}
            max={end || undefined}
            onChange={setStart}
            placeholder={t('history.startDate')}
            localeCode={locale}
            invalid={invalidRange}
            errorId={rangeErrorId}
            testId="profile-history-start-date"
          />
          <span className="text-muted-foreground">→</span>
          <HistoryDatePicker
            value={end}
            min={start || undefined}
            onChange={setEnd}
            placeholder={t('history.endDate')}
            localeCode={locale}
            invalid={invalidRange}
            errorId={rangeErrorId}
            testId="profile-history-end-date"
          />
          <Button onClick={runQuery} data-testid="profile-history-query">{t('history.query')}</Button>
        </div>
        {invalidRange ? (
          <p
            id={rangeErrorId}
            role="alert"
            className="mt-2 text-sm text-destructive"
            data-testid="profile-history-range-error"
          >
            {t('history.invalidRange')}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border" data-testid="profile-history-table">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>{t('history.time')}</TableHead>
              <TableHead>{t('history.ip')}</TableHead>
              <TableHead>{t('history.client')}</TableHead>
              <TableHead>{t('history.location')}</TableHead>
              <TableHead>{t('history.result')}</TableHead>
              <TableHead>{t('history.abnormal')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground" data-testid="profile-history-empty">
                  {t('history.empty')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(r.abnormal && 'bg-amber-50/60 dark:bg-amber-950/10')}
                  data-testid={`profile-history-row-${r.id}`}
                >
                  <TableCell className="text-foreground">{formatTimestamp(r.time) || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.ip}</TableCell>
                  <TableCell className="text-muted-foreground">{r.client}</TableCell>
                  <TableCell className="text-muted-foreground">{r.location || '—'}</TableCell>
                  <TableCell>
                    <ResultBadge result={r.result} t={t} />
                  </TableCell>
                  <TableCell>
                    {r.abnormal ? (
                      <Tooltip>
                        <TooltipTrigger render={<span className="inline-flex" />}>
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          {r.abnormal_reason || t('history.abnormalDefault')}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4">
        <ServerPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
        />
      </div>

      {isFetching && !isLoading ? (
        <div className="mt-2 text-xs text-muted-foreground">{tc('loading')}</div>
      ) : null}
    </Card>
  );
}
