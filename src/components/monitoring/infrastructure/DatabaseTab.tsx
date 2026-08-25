'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EmptyState, DegradedBanner } from './StateBanners';
import { useDatabase } from './hooks';
import { degradeMessage } from '@/lib/monitoring/degrade';
import { createTimeAxisFormatter } from '@/lib/monitoring/chart-time';
import type { TimeRange } from '@/types/monitoring';

interface DatabaseTabProps {
  node: string;
  range: TimeRange;
}

export function DatabaseTab({ node, range }: DatabaseTabProps) {
  const t = useTranslations('infrastructure');
  const locale = useLocale();
  const { data, isLoading, isError } = useDatabase(node, range);
  const timeAxisFormatter = useMemo(
    () => createTimeAxisFormatter(locale, range === '7d'),
    [locale, range],
  );

  const connOption = useMemo(() => {
    if (!data?.conn_trend?.points?.length) return null;
    const pts = data.conn_trend.points;
    return {
      tooltip: { trigger: 'axis' as const },
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      xAxis: { type: 'category' as const, data: pts.map((p) => p.ts), axisLabel: { showMaxLabel: true, formatter: timeAxisFormatter } },
      yAxis: { type: 'value' as const },
      series: [{ type: 'line', data: pts.map((p) => p.value), smooth: true, lineStyle: { width: 2 }, itemStyle: { color: '#3b82f6' }, areaStyle: { opacity: 0.1 } }],
    };
  }, [data, timeAxisFormatter]);

  const latOption = useMemo(() => {
    if (!data?.latency_trend?.points?.length) return null;
    const pts = data.latency_trend.points;
    return {
      tooltip: { trigger: 'axis' as const },
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      xAxis: { type: 'category' as const, data: pts.map((p) => p.ts), axisLabel: { showMaxLabel: true, formatter: timeAxisFormatter } },
      yAxis: { type: 'value' as const, axisLabel: { formatter: '{value} ms' } },
      series: [{ type: 'line', data: pts.map((p) => p.value), smooth: true, lineStyle: { width: 2 }, itemStyle: { color: '#f59e0b' }, areaStyle: { opacity: 0.1 } }],
    };
  }, [data, timeAxisFormatter]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <Skeleton className="h-[300px] rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return <DegradedBanner message={t('agentOffline')} />;
  }

  if (data?.supported === false) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">{t('backendUnsupported')}</p>
      </div>
    );
  }

  const dbStatus = data?.status?.db;
  const redisStatus = data?.status?.redis;
  const slowQueries = data?.slow_queries ?? [];
  const lockWaits = data?.lock_waits ?? [];

  return (
    <div className="space-y-4" data-testid="monitor-infrastructure-database">
      {data?.degraded && (
        <DegradedBanner message={degradeMessage(data.degraded_code, t)} />
      )}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{data?.db_backend ?? 'Database'}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={dbStatus?.status === 'ok' ? 'default' : 'destructive'}>
                    {dbStatus?.status ?? '-'}
                  </Badge>
                  {dbStatus?.latency_ms != null && (
                    <span className="text-xs text-muted-foreground">{dbStatus.latency_ms}ms</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{t('database.redis')}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={redisStatus?.status === 'ok' ? 'default' : 'destructive'}>
                    {redisStatus?.status ?? '-'}
                  </Badge>
                  {redisStatus?.latency_ms != null && (
                    <span className="text-xs text-muted-foreground">{redisStatus.latency_ms}ms</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {data?.db_backend?.toUpperCase() === 'OPENGAUSS' && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{t('database.cacheHitRatio')}</div>
              <div className="mt-1 text-2xl font-semibold">
                {data.cache_hit_ratio != null ? `${data.cache_hit_ratio.toFixed(1)}%` : '—'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{t('database.activeConns')}</div>
              <div className="mt-1 text-2xl font-semibold">
                {data.active_conns != null ? data.active_conns : '—'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{t('database.dbSize')}</div>
              <div className="mt-1 text-2xl font-semibold">
                {data.db_size_bytes != null
                  ? `${(data.db_size_bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
                  : '—'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {data?.db_backend?.toUpperCase() === 'OPENGAUSS' && data?.dml_rate?.points?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('database.dmlRate')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts
              option={{
                tooltip: { trigger: 'axis' as const },
                grid: { left: 48, right: 16, top: 24, bottom: 32 },
                xAxis: { type: 'category' as const, data: data.dml_rate.points.map((p) => p.ts), axisLabel: { showMaxLabel: true, formatter: timeAxisFormatter } },
                yAxis: { type: 'value' as const },
                series: [{ type: 'line', data: data.dml_rate.points.map((p) => p.value), smooth: true, lineStyle: { width: 2 }, itemStyle: { color: '#10b981' }, areaStyle: { opacity: 0.1 } }],
              }}
              style={{ height: 250 }}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="monitor-infrastructure-slow-query-card">
        <CardHeader>
          <CardTitle>{t('database.connections')} / {t('database.avgLatency')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!connOption && !latOption ? (
            <EmptyState message={t('noData')} />
          ) : (
            <div className="space-y-6">
              {connOption && <ReactECharts option={connOption} style={{ height: 250 }} />}
              {latOption && <ReactECharts option={latOption} style={{ height: 250 }} />}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('database.slowQuery')}</CardTitle>
        </CardHeader>
        <CardContent>
          {slowQueries.length === 0 ? (
            <EmptyState message={t('noData')} />
          ) : (
            <Table data-testid="monitor-infrastructure-slow-query-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('database.query')}</TableHead>
                  <TableHead className="text-right">{t('database.execCount')}</TableHead>
                  <TableHead className="text-right">{t('database.avgMs')}</TableHead>
                  <TableHead className="text-right">{t('database.totalMs')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slowQueries.map((q, i) => (
                  <TableRow key={i} data-testid={`monitor-infrastructure-slow-query-row-${i + 1}`}>
                    <TableCell className="max-w-[300px] font-mono text-xs">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            className="block w-full truncate cursor-help bg-transparent p-0 text-left font-mono text-xs"
                            data-testid={`monitor-infrastructure-slow-query-trigger-${i + 1}`}
                          >
                            {q.query}
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            align="start"
                            className="max-w-[600px] whitespace-pre-wrap break-all font-mono text-xs"
                            data-testid={`monitor-infrastructure-slow-query-tooltip-${i + 1}`}
                          >
                            <div className="space-y-1">
                              <p>{q.query}</p>
                              <p>{t('database.execCount')}: {q.exec_count}</p>
                              <p>{t('database.avgMs')}: {q.avg_ms}ms</p>
                              <p>{t('database.totalMs')}: {q.total_ms}ms</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right">{q.exec_count}</TableCell>
                    <TableCell className="text-right">{q.avg_ms}ms</TableCell>
                    <TableCell className="text-right">{q.total_ms}ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('database.lockWait')}</CardTitle>
        </CardHeader>
        <CardContent>
          {lockWaits.length === 0 ? (
            <EmptyState message={t('noData')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('database.lockWaitType')}</TableHead>
                  <TableHead>{t('database.lockObject')}</TableHead>
                  <TableHead className="text-right">{t('database.waitMs')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lockWaits.map((w, i) => (
                  <TableRow key={i}>
                    <TableCell>{w.wait_type}</TableCell>
                    <TableCell className="font-mono text-xs">{w.wait_object}</TableCell>
                    <TableCell className="text-right">{w.wait_ms}ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
