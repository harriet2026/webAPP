'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { ChevronRight, ChevronDown } from 'lucide-react';
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
import { NON_SERIES_KEYS, type DetailTableData, type ViewBy } from '@/lib/api/security-overview';
import { seriesColor, blockRateBgClass } from './constants';

interface DetailTableProps {
  data?: DetailTableData;
  isLoading: boolean;
  viewBy: ViewBy;
}

export const DETAIL_SERIES_ORDER: Partial<Record<ViewBy, readonly string[]>> = {
  email_type: [
    'normal',
    'subscription',
    'spam',
    'advertising',
    'harmful',
    'phishing',
    'account_compromised',
    'suspicious',
    'spoofing',
    'virus',
    'sensitive',
  ],
  action: [
    'deliver',
    'mark_deliver',
    'quarantine',
    'review',
    'block',
    'drop',
    'recall',
  ],
  threat_level: ['normal', 'low', 'medium', 'high', 'critical'],
  delivery_result: ['delivered', 'failed', 'cancelled', 'in_delivery', 'partial_delivered', 'unknown'],
};

// sideline（后端灰名单动作）和 greylist 已从执行动作枚举中移除，安全总览同步过滤。
const EXCLUDED_ACTION_KEYS = new Set(['sideline', 'greylist', 'mark_deliver']);

function orderedSeriesKeys(row: Record<string, unknown>, viewBy: ViewBy): string[] {
  const available = Object.keys(row).filter((key) => {
    if (key === 'date' || NON_SERIES_KEYS.has(key)) return false;
    if (viewBy === 'action' && EXCLUDED_ACTION_KEYS.has(key)) return false;
    return true;
  });
  const preferred = DETAIL_SERIES_ORDER[viewBy] ?? [];
  const preferredSet = new Set(preferred);
  return [
    ...preferred.filter((key) => available.includes(key)),
    ...available.filter((key) => !preferredSet.has(key)),
  ];
}

export function DetailTable({ data, isLoading, viewBy }: DetailTableProps) {
  const t = useTranslations('securityOverview');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const rows = data?.[viewBy] ?? [];
  // Exclude synthetic non-count keys (NON_SERIES_KEYS): the delivery_result rows
  // carry a `success_rate` percentage, and every view carries the backend's
  // per-row summary fields `total` / `block_rate` / `change` / `change_pct`.
  // None of them is a stackable count, so none belongs in the dynamic
  // (per-series) columns.
  const dynamicKeys = rows.length > 0
    ? orderedSeriesKeys(rows[0], viewBy)
    : [];
  const allZeroKeys = new Set(dynamicKeys.filter((key) => rows.every((row) => Number(row[key] ?? 0) === 0)));
  // GT-11934: the summary columns are rendered on the right, from the values the
  // backend already computed — not recomputed here, and not treated as series.
  const firstRow = rows[0];
  const hasTotalColumn = firstRow != null && firstRow.total !== undefined;
  const hasBlockRateColumn = firstRow != null && firstRow.block_rate !== undefined;
  const hasChangeColumn = firstRow != null && firstRow.change_pct !== undefined;
  const summaryColCount =
    (hasTotalColumn ? 1 : 0) + (hasBlockRateColumn ? 1 : 0) + (hasChangeColumn ? 1 : 0);

  function seriesLabel(key: string): string {
    const nsMap: Partial<Record<ViewBy, string>> = {
      threat_type: 'threatTypes',
      action: 'actions',
      threat_level: 'threatLevels',
      delivery_result: 'deliveryResults',
      email_type: 'emailTypes',
    };
    const ns = nsMap[viewBy];
    if (!ns) return key;
    const result = t(`${ns}.${key}` as Parameters<typeof t>[0]);
    // next-intl returns the key path for missing keys instead of throwing
    return result.includes('.') ? key : result;
  }

  function toggleRow(date: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  return (
    <Card data-testid="security-overview-detail-table">
      <CardHeader>
        <CardTitle>{t('detail.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">—</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* expand toggle column */}
                  <TableHead className="w-8 sticky left-0 bg-card z-10" />
                  {/* date column */}
                  <TableHead className="w-32 sticky left-8 bg-card z-10">{t('table.date')}</TableHead>
                  {hasTotalColumn && (
                    <TableHead className="text-right min-w-[90px]">{t('table.total')}</TableHead>
                  )}
                  {dynamicKeys.map((k) => (
                    <TableHead key={k} title={seriesLabel(k)} className={`text-right cursor-help ${allZeroKeys.has(k) ? 'text-muted-foreground/50' : ''}`}>
                      {seriesLabel(k)}{allZeroKeys.has(k) ? ` (${t('table.allZero')})` : ''}
                    </TableHead>
                  ))}
                  {/* summary columns (GT-11934): fixed, right-hand, backend-computed */}
                  {hasBlockRateColumn && (
                    <TableHead className="text-right min-w-[80px]">{t('table.blockRate')}</TableHead>
                  )}
                  {hasChangeColumn && (
                    <TableHead className="text-right sticky right-0 bg-card z-10 min-w-[90px]">
                      {t('table.change')}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, rowIdx) => {
                  const rowDate = row.date ?? String(rowIdx);
                  // GT-11934: use the backend's own block_rate. The old code
                  // recomputed it as block / sum(dynamicKeys) — and dynamicKeys
                  // then still contained `total`, `block_rate` and `change`, so a
                  // count, a percentage and a delta were all summed into the
                  // denominator and the rate came out wrong.
                  const totalVal = typeof row.total === 'number' ? row.total : undefined;
                  const blockRate = typeof row.block_rate === 'number' ? row.block_rate : undefined;
                  const changePct = typeof row.change_pct === 'number' ? row.change_pct : undefined;
                  const isExpanded = expandedRows.has(rowDate);

                  return (
                    <React.Fragment key={rowDate}>
                      <TableRow>
                        {/* expand toggle */}
                        <TableCell className="sticky left-0 bg-card z-10 w-8 p-1">
                          <button
                            onClick={() => toggleRow(rowDate)}
                            className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors"
                            aria-label={isExpanded ? 'collapse' : 'expand'}
                          >
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </button>
                        </TableCell>
                        {/* date */}
                        <TableCell className="font-medium sticky left-8 bg-card z-10">{row.date}</TableCell>
                        {hasTotalColumn && (
                          <TableCell className="text-right tabular-nums font-medium">
                            {totalVal !== undefined ? totalVal.toLocaleString() : '—'}
                          </TableCell>
                        )}
                        {dynamicKeys.map((k) => {
                          const val = row[k];
                          const isZero = val === 0 || val === '0';
                          return (
                            <TableCell key={k} className={`text-right tabular-nums ${isZero ? 'text-muted-foreground/40' : ''}`}>
                              {typeof val === 'number' ? val.toLocaleString() : val}
                            </TableCell>
                          );
                        })}
                        {/* summary cells (GT-11934) */}
                        {hasBlockRateColumn && (
                          <TableCell className="text-right tabular-nums">
                            {blockRate !== undefined ? (
                              <span className="inline-flex items-center gap-1.5 justify-end">
                                <span className={`inline-block h-2 w-2 rounded-full ${blockRateBgClass(blockRate)}`} />
                                {blockRate.toFixed(1)}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        )}
                        {hasChangeColumn && (
                          <TableCell className="text-right tabular-nums sticky right-0 bg-card z-10">
                            {changePct !== undefined ? (
                              <span className={changePct > 0 ? 'text-destructive' : changePct < 0 ? 'text-emerald-600' : 'text-muted-foreground'}>
                                {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={dynamicKeys.length + 1 + summaryColCount}>
                            <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center">
                              <ReactECharts
                                option={{
                                  tooltip: { trigger: 'item' },
                                  series: [{
                                    type: 'pie',
                                    radius: ['48%', '76%'],
                                    label: { show: false },
                                    data: dynamicKeys
                                      .map((key) => ({ name: seriesLabel(key), value: Number(row[key] ?? 0), itemStyle: { color: seriesColor(key) } }))
                                      .filter((item) => item.value > 0),
                                  }],
                                }}
                                style={{ width: 132, height: 104 }}
                                notMerge
                              />
                              <div className="flex flex-1 flex-wrap gap-3">
                              {dynamicKeys.map((k) => {
                                const val = typeof row[k] === 'number' ? row[k] as number : 0;
                                const percent = totalVal && totalVal > 0 ? (val / totalVal) * 100 : 0;
                                return (
                                  <span key={k} className="flex items-center gap-1 text-xs">
                                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: seriesColor(k) }} />
                                    <span className="text-muted-foreground">{seriesLabel(k)}:</span>
                                    <span className="font-medium">{val.toLocaleString()} ({percent.toFixed(1)}%)</span>
                                  </span>
                                );
                              })}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
