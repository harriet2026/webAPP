'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useLoginHistory } from './api';
import { formatTimestamp } from '@/lib/format-time';
import { ServerPagination } from '@/components/shared/server-pagination';
import type { LoginResult } from './types';

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

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [query, setQuery] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isFetching } = useLoginHistory({
    start: query.start || undefined,
    end: query.end || undefined,
    page,
    page_size: pageSize,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const runQuery = () => {
    setQuery({ start, end });
    setPage(1);
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium">{t('tabs.history')}</h3>
      <div className="my-4 border-t border-border" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{tc('timeRange')}</span>
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-40"
          aria-label={t('history.startDate')}
          data-testid="profile-history-start-date"
        />
        <span className="text-muted-foreground">→</span>
        <Input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-40"
          aria-label={t('history.endDate')}
          data-testid="profile-history-end-date"
        />
        <Button onClick={runQuery} data-testid="profile-history-query">{t('history.query')}</Button>
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
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  {t('history.empty')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn(r.abnormal && 'bg-amber-50/60 dark:bg-amber-950/10')}
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
