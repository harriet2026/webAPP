'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DetailTableRow, Direction } from '@/lib/api/delivery-traffic';

interface DetailTableProps {
  data?: DetailTableRow[];
  direction: Direction;
  isLoading: boolean;
}

interface ColDef {
  key: string;
  labelKey: string;
  align?: 'left' | 'right';
  format?: (v: unknown) => string;
}

export const COLUMNS_BY_DIRECTION: Record<Direction, ColDef[]> = {
  // GT-11989: the 全部 view shipped 6 columns while receive/send had 延迟投递 and
  // 取消. `cancelled` was already on the wire for `all`; `deferred` was not
  // computed by deliveryTrafficDetailAll at all (it is now). Both are rendered
  // here so 全部 matches the other directions — and so total reconciles.
  all: [
    { key: 'date', labelKey: 'date' },
    { key: 'total', labelKey: 'total', align: 'right' },
    { key: 'success', labelKey: 'success', align: 'right' },
    { key: 'failure', labelKey: 'failure', align: 'right' },
    { key: 'deferred', labelKey: 'deferred', align: 'right' },
    { key: 'cancelled', labelKey: 'cancelled', align: 'right' },
    { key: 'success_rate', labelKey: 'successRate', align: 'right', format: (v) => `${Number(v).toFixed(1)}%` },
    { key: 'change', labelKey: 'change', align: 'right', format: (v) => (v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`) },
  ],
  receive: [
    { key: 'date', labelKey: 'date' },
    { key: 'total', labelKey: 'total', align: 'right' },
    { key: 'success', labelKey: 'success', align: 'right' },
    { key: 'failure', labelKey: 'failure', align: 'right' },
    { key: 'deferred', labelKey: 'deferred', align: 'right' },
    { key: 'cancelled', labelKey: 'cancelled', align: 'right' },
    { key: 'user_not_exist', labelKey: 'userNotExist', align: 'right' },
    { key: 'mailbox_full', labelKey: 'mailboxFull', align: 'right' },
    { key: 'success_rate', labelKey: 'successRate', align: 'right', format: (v) => `${Number(v).toFixed(1)}%` },
    { key: 'change', labelKey: 'change', align: 'right', format: (v) => (v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`) },
  ],
  send: [
    { key: 'date', labelKey: 'date' },
    { key: 'total', labelKey: 'total', align: 'right' },
    { key: 'success', labelKey: 'success', align: 'right' },
    { key: 'failure', labelKey: 'failure', align: 'right' },
    { key: 'deferred', labelKey: 'deferred', align: 'right' },
    { key: 'cancelled', labelKey: 'cancelled', align: 'right' },
    { key: 'target_reject', labelKey: 'targetReject', align: 'right' },
    { key: 'dns_fail', labelKey: 'dnsFail', align: 'right' },
    { key: 'rbl_block', labelKey: 'rblBlock', align: 'right' },
    { key: 'success_rate', labelKey: 'successRate', align: 'right', format: (v) => `${Number(v).toFixed(1)}%` },
    { key: 'change', labelKey: 'change', align: 'right', format: (v) => (v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`) },
  ],
  internal: [
    { key: 'date', labelKey: 'date' },
    { key: 'total', labelKey: 'total', align: 'right' },
    { key: 'success', labelKey: 'success', align: 'right' },
    { key: 'failure', labelKey: 'failure', align: 'right' },
    { key: 'internal_spam', labelKey: 'internalSpam', align: 'right' },
    { key: 'internal_phishing', labelKey: 'internalPhishing', align: 'right' },
    { key: 'internal_virus', labelKey: 'internalVirus', align: 'right' },
    { key: 'success_rate', labelKey: 'successRate', align: 'right', format: (v) => `${Number(v).toFixed(1)}%` },
    { key: 'change', labelKey: 'change', align: 'right', format: (v) => (v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`) },
  ],
};

function changeColor(val: unknown): string {
  if (val == null) return '';
  const n = Number(val);
  if (n > 0) return 'text-red-500 dark:text-red-400';
  if (n < 0) return 'text-green-500 dark:text-green-400';
  return '';
}

function metricColor(key: string): string {
  if (key === 'success' || key === 'success_rate') return 'text-green-600 dark:text-green-400';
  if (key === 'failure') return 'text-red-600 dark:text-red-400';
  if (key === 'deferred') return 'text-orange-500 dark:text-orange-400';
  if (key === 'cancelled') return 'text-muted-foreground';
  return '';
}

export function DetailTable({ data, direction, isLoading }: DetailTableProps) {
  const t = useTranslations('deliveryTraffic.table');
  const tPage = useTranslations('deliveryTraffic');

  const columns = COLUMNS_BY_DIRECTION[direction] ?? COLUMNS_BY_DIRECTION.all;

  return (
    <Card className="rounded-xl bg-card shadow-sm backdrop-blur-none">
      <CardHeader className="grid-rows-[auto_auto]">
        <CardTitle className="leading-6">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className={`h-auto px-2 py-3 ${col.key !== 'date' ? 'text-right' : 'sticky left-0 z-10 bg-card text-left'} ${col.key === 'change' ? 'sticky right-0 z-10 bg-card' : ''}`}
                    >
                      {t(col.labelKey)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:last-child]:border-b">
                {!data || data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-[200px] text-center text-muted-foreground">
                      {tPage('noData')}
                    </TableCell>
                  </TableRow>
                ) : data.map((row, rowIdx) => (
                <TableRow key={row.date ?? rowIdx}>
                  {columns.map((col) => {
                    const raw = row[col.key];
                    const display = col.format ? col.format(raw) : (typeof raw === 'number' ? raw.toLocaleString() : String(raw ?? '—'));
                    const isZero = raw === 0 || raw === '0';
                    const colorClass = col.key === 'change' ? changeColor(raw) : metricColor(col.key);

                    return (
                      <TableCell
                        key={col.key}
                        className={`px-2 py-3 ${col.key !== 'date' ? 'text-right tabular-nums' : 'sticky left-0 z-10 bg-card'} ${col.key === 'change' ? 'sticky right-0 z-10 bg-card' : ''} ${isZero ? 'text-muted-foreground/40' : ''} ${colorClass}`}
                      >
                        {col.key === 'date' ? raw : display}
                      </TableCell>
                    );
                  })}
                </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
