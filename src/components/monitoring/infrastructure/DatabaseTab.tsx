'use client';

import { useMemo, useState } from 'react';
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
import { DatabaseReplicationStatus } from './DatabaseReplicationStatus';
import { DatabasePerformanceSummary } from './DatabasePerformanceSummary';
import { degradeMessage } from '@/lib/monitoring/degrade';
import { createTimeAxisFormatter } from '@/lib/monitoring/chart-time';
import type { TimeRange, DatabaseMetricState, DatabaseResp } from '@/types/monitoring';

interface DatabaseTabProps {
  node: string;
  range: TimeRange;
}

export function DatabaseTab({ node, range }: DatabaseTabProps) {
  const t = useTranslations('infrastructure');
  const locale = useLocale();
  const { data, isLoading, isError } = useDatabase(node, range);
  const [source, setSource] = useState<'db' | 'redis'>('db');
  const [metric, setMetric] = useState('connections');
  // Keep status/diagnostic cards on the DB response. Source selection changes
  // only the performance panel, as in the specification.
  const performance = useDatabase(node, range, source, metric);
  const metrics = source === 'redis' ? ['connections', 'avg_latency', 'p99'] : ['connections', 'avg_latency', 'p50', 'p95', 'p99'];
  const metricLabel = (value: string) => value === 'connections' ? t(source === 'redis' ? 'database.clientConnections' : 'database.activeConns')
    : value === 'avg_latency' ? t('database.avgLatency') : value.toUpperCase();
  function selectSource(next: 'db' | 'redis') {
    setSource(next);
    if (next === 'redis' && (metric === 'p50' || metric === 'p95')) setMetric('connections');
  }
  const timeAxisFormatter = useMemo(
    () => createTimeAxisFormatter(locale, range === '7d'),
    [locale, range],
  );
  const statisticsTimeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }), [locale]);
  function formatTimestamp(value: string | undefined) {
    if (!value || Number.isNaN(new Date(value).getTime())) return t('database.sourceNotProvided');
    return <time dateTime={value} title={value}>{statisticsTimeFormatter.format(new Date(value))}</time>;
  }

  const trendKey = metric === 'connections' ? 'conn_trend' : 'latency_trend';
  const trendOption = useMemo(() => {
    const pts = performance.data?.[trendKey]?.points;
    if (!pts?.length) return null;
    return {
      tooltip: { trigger: 'axis' as const },
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      xAxis: { type: 'category' as const, data: pts.map((p) => p.ts), axisLabel: { showMaxLabel: true, formatter: timeAxisFormatter } },
      yAxis: { type: 'value' as const, axisLabel: { formatter: metric === 'connections' ? '{value}' : '{value} ms' } },
      series: [{ type: 'line', data: pts.map((p) => p.value), smooth: true, lineStyle: { width: 2 }, itemStyle: { color: '#3b82f6' }, areaStyle: { opacity: 0.1 } }],
    };
  }, [performance.data, timeAxisFormatter, trendKey, metric]);

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

  const dbStatus = data?.status?.db;
  // Older APIs report the fixed monitoring DB's role. Never present that as
  // the selected node's role during a rolling upgrade or a node switch.
  const dbReplication = dbStatus?.replication?.node === node && ['selected_node', 'db_receive_to_apply'].includes(dbStatus.replication.scope)
    ? dbStatus.replication : undefined;
  const redisStatus = data?.status?.redis;
  const slowQueries = data?.slow_queries ?? [];
  const lockWaits = data?.lock_waits ?? [];
  // Older servers have only the aggregate flag. Do not let that flag hide
  // independent TSDB/Redis metrics; unknown DB errors are not "no records".
  const legacyState = data?.degraded_code === 'metrics_db_unavailable' ? 'error'
    : data?.supported === false ? 'unsupported' : 'ok';
  const diagnostics = data?.diagnostics ?? {
    slow_queries: slowQueries.length ? 'ok' : legacyState,
    lock_waits: lockWaits.length ? 'ok' : legacyState,
    connections: dbStatus?.status === 'ok' ? 'ok' : legacyState,
  };
  const localDBErrors = data?.diagnostics && data?.degraded_code === 'metrics_db_unavailable';
  const metricStateLabel = (state: DatabaseMetricState) => t(`database.metricStates.${state}`);
  function currentValue(key: 'active_conns' | 'cache_hit_ratio' | 'db_size_bytes', value: number | undefined, format: (n: number) => string) {
    const state = data?.metric_states?.[key] ?? (value == null ? 'missing' : 'ok');
    return <span data-testid={`monitor-infrastructure-db-${key}`} data-state={state}>
      {state === 'ok' && value != null ? format(value) : metricStateLabel(state === 'ok' ? 'missing' : state)}
    </span>;
  }
  function trendMessage(response: DatabaseResp | undefined, key: 'conn_trend' | 'latency_trend' | 'dml_rate') {
    const state = response?.metric_states?.[key] ?? 'missing';
    return state === 'error'
      ? <DegradedBanner message={metricStateLabel(state)} />
      : <EmptyState message={metricStateLabel(state === 'ok' ? 'missing' : state)} />;
  }
  const redisState: DatabaseMetricState = data?.metric_states?.redis_latency
    ?? (redisStatus?.status === 'ok' && redisStatus.latency_ms != null ? 'ok' : 'missing');

  return (
    <div className="space-y-4" data-testid="monitor-infrastructure-database">
      {data?.degraded && !localDBErrors && (
        <DegradedBanner message={degradeMessage(data.degraded_code, t)} />
      )}
      <div className="grid grid-cols-2 gap-4">
        <Card data-testid="monitor-infrastructure-db-card" className={['error', 'down', 'no_receiver'].includes(dbReplication?.state ?? '') || diagnostics.connections === 'error' ? 'border-destructive' : undefined}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{data?.db_backend ?? 'Database'}</div>
                {diagnostics.connections === 'error' ? (
                  <DegradedBanner message={t('database.connectionQueryFailed')} />
                ) : diagnostics.connections === 'unsupported' ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t('database.connectionUnsupported')}</p>
                ) : <div className="mt-1 flex items-center gap-2">
                  <Badge variant={dbStatus?.status === 'ok' ? 'default' : 'destructive'}>
                    {t(dbStatus?.status === 'ok' ? 'database.queryAvailable' : 'database.metricStates.missing')}
                  </Badge>
                  {dbStatus?.latency_ms != null && (
                    <span className="text-xs text-muted-foreground">{dbStatus.latency_ms}ms</span>
                  )}
                </div>}
                <DatabaseReplicationStatus replication={dbReplication} source="db" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="monitor-infrastructure-cache-card" className={['error', 'down'].includes(redisStatus?.replication?.state ?? '') || ['error', 'down'].includes(redisState) ? 'border-destructive' : undefined}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{t('database.redis')}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={redisState === 'ok' ? 'default' : redisState === 'error' || redisState === 'down' ? 'destructive' : 'secondary'} data-state={redisState}>
                    {metricStateLabel(redisState)}
                  </Badge>
                  {redisState === 'ok' && redisStatus?.latency_ms != null && (
                    <span className="text-xs text-muted-foreground">PING {redisStatus.latency_ms}ms</span>
                  )}
                </div>
                <DatabaseReplicationStatus replication={redisStatus?.replication} source="redis" />
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
                {currentValue('cache_hit_ratio', data.cache_hit_ratio, (value) => `${value.toFixed(1)}%`)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{t('database.activeConns')}</div>
              <div className="mt-1 text-2xl font-semibold">
                {currentValue('active_conns', data.active_conns, String)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{t('database.dbSize')}</div>
              <div className="mt-1 text-2xl font-semibold">
                {currentValue('db_size_bytes', data.db_size_bytes, (value) => `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {data?.db_backend?.toUpperCase() === 'OPENGAUSS' && (data?.dml_rate || data?.metric_states?.dml_rate) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('database.dmlRate')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.dml_rate?.points?.length && (!data.metric_states?.dml_rate || data.metric_states.dml_rate === 'ok') ? <ReactECharts
              option={{
                tooltip: { trigger: 'axis' as const },
                grid: { left: 48, right: 16, top: 24, bottom: 32 },
                xAxis: { type: 'category' as const, data: data.dml_rate.points.map((p) => p.ts), axisLabel: { showMaxLabel: true, formatter: timeAxisFormatter } },
                yAxis: { type: 'value' as const },
                series: [{ type: 'line', data: data.dml_rate.points.map((p) => p.value), smooth: true, lineStyle: { width: 2 }, itemStyle: { color: '#10b981' }, areaStyle: { opacity: 0.1 } }],
              }}
              style={{ height: 250 }}
            /> : trendMessage(data, 'dml_rate')}
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="monitor-infrastructure-database-performance-card">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">{t('database.performanceTrend')}</CardTitle>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1 rounded-md bg-gray-100 p-1 dark:bg-gray-700" role="group" aria-label={t('database.sourceSelection')}>
                {(['db', 'redis'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={source === value}
                    className={`rounded px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${source === value
                      ? 'bg-white font-medium text-blue-600 shadow-sm dark:bg-gray-600 dark:text-blue-400'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}
                    data-testid={`monitor-infrastructure-db-source-${value}`} onClick={() => selectSource(value)}>
                    {value === 'redis' ? t('database.redis') : data?.db_backend || t('database.relationalDatabase')}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('database.metricSelection')}>
                {metrics.map((value) => (
                  <button key={value} type="button" aria-pressed={metric === value}
                    className={`rounded px-2 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring ${metric === value
                      ? 'bg-blue-100 font-medium text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                      : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                    data-testid={`monitor-infrastructure-db-metric-${value}`} onClick={() => setMetric(value)}>
                    {metricLabel(value)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {metric !== 'connections' && (
            <p className="mb-3 text-xs text-muted-foreground" data-testid="monitor-infrastructure-latency-scope">
              {t(source === 'redis' ? 'database.redisLatencyScope' : 'database.dbLatencyScope')}
            </p>
          )}
          {performance.isLoading ? (
            <Skeleton className="h-[250px] w-full rounded-lg" />
          ) : performance.isError ? (
            <DegradedBanner message={t('agentOffline')} />
          ) : metric !== 'connections' && (performance.data?.metric_unavailable
            || performance.data?.latency_scope !== (source === 'redis' ? 'redis_ping_native' : 'app_db_calls')
            || performance.data?.latency_metric !== metric) ? (
            // A rolling-upgrade response must explicitly identify both metric
            // and scope before its values can be shown as latency percentiles.
            <div data-testid="monitor-infrastructure-db-metric-unavailable">
              <EmptyState message={t('database.metricNotConnected', { metric: metricLabel(metric) })} />
            </div>
          ) : !trendOption || (performance.data?.metric_states?.[trendKey] && performance.data.metric_states[trendKey] !== 'ok') ? (
            trendMessage(performance.data, trendKey)
          ) : (
            <ReactECharts option={trendOption} notMerge style={{ height: 250 }} />
          )}
          {source !== 'db' && performance.data?.degraded && <DegradedBanner message={degradeMessage(performance.data.degraded_code, t)} />}
          <DatabasePerformanceSummary node={node} range={range} source={source} />
        </CardContent>
      </Card>

      <Card data-testid="monitor-infrastructure-slow-query-card">
        <CardHeader>
          <CardTitle>{t('database.slowQuery')}</CardTitle>
          <p className="text-xs text-muted-foreground" data-testid="monitor-infrastructure-sql-ranking-scope">{t('database.sqlRankingScope')}</p>
          <p className="text-xs text-muted-foreground">{t('database.sqlRankingTimeScope')}</p>
        </CardHeader>
        <CardContent>
          {diagnostics.slow_queries === 'error' ? (
            <div data-testid="monitor-infrastructure-slow-query-error"><DegradedBanner message={t('database.slowQueryFailed')} /></div>
          ) : diagnostics.slow_queries === 'unsupported' ? (
            <div data-testid="monitor-infrastructure-slow-query-unsupported"><EmptyState message={t('database.slowQueryUnsupported')} /></div>
          ) : slowQueries.length === 0 ? (
            <EmptyState message={t('database.noSlowQueries')} />
          ) : (
            <Table data-testid="monitor-infrastructure-slow-query-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('database.query')}</TableHead>
                  <TableHead>{t('database.statementIdentity')}</TableHead>
                  <TableHead className="text-right">{t('database.execCount')}</TableHead>
                  <TableHead className="text-right">{t('database.avgMs')}</TableHead>
                  <TableHead className="text-right" aria-sort="descending">{t('database.totalMs')} ↓</TableHead>
                  <TableHead>{t('database.statisticsUpdatedAt')}</TableHead>
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
                            {q.query || t('database.sourceNotProvided')}
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            align="start"
                            className="max-w-[600px] whitespace-pre-wrap break-all font-mono text-xs"
                            data-testid={`monitor-infrastructure-slow-query-tooltip-${i + 1}`}
                          >
                            <div className="space-y-1">
                              <p>{q.query || t('database.sourceNotProvided')}</p>
                              <p>{t('database.sqlTextScope')}</p>
                              <p>{t('database.queryId')}: {q.query_id || t('database.sourceNotProvided')}</p>
                              <p>{t('database.statementNode')}: {q.node_name || '—'} / {q.node_id || '—'}</p>
                              <p>{t('database.statementUser')}: {q.user_name || '—'} / {q.user_id || '—'}</p>
                              <p>{t('database.statementDatabase')}: {q.database_name || '—'} / {q.database_id || '—'}</p>
                              {q.top_level != null && <p>{t(q.top_level ? 'database.topLevelStatement' : 'database.nestedStatement')}</p>}
                              <p>{t('database.execCount')}: {q.exec_count}</p>
                              <p>{t('database.avgMs')}: {q.avg_ms}ms</p>
                              <p>{t('database.totalMs')}: {q.total_ms}ms</p>
                              <p data-testid={`monitor-infrastructure-sql-last-executed-${i + 1}`}>{t('database.lastExecutedAt')}: {t('database.sourceNotProvided')}</p>
                              <p>{t('database.statisticsUpdatedAt')}: {formatTimestamp(q.statistics_updated_at)}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-xs" data-testid={`monitor-infrastructure-sql-identity-${i + 1}`}>
                      <div className="font-mono">{t('database.queryId')}: {q.query_id || '—'}</div>
                      <div>{t('database.statementUser')}: {q.user_name || q.user_id || '—'}</div>
                      <div>{t(q.node_id || q.node_name ? 'database.statementNode' : 'database.statementDatabase')}: {q.node_name || q.node_id || q.database_name || q.database_id || '—'}</div>
                      {q.top_level != null && <div>{t(q.top_level ? 'database.topLevelStatement' : 'database.nestedStatement')}</div>}
                    </TableCell>
                    <TableCell className="text-right">{q.exec_count}</TableCell>
                    <TableCell className="text-right">{q.avg_ms}ms</TableCell>
                    <TableCell className="text-right">{q.total_ms}ms</TableCell>
                    <TableCell className="text-xs" data-testid={`monitor-infrastructure-sql-updated-${i + 1}`}>{formatTimestamp(q.statistics_updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card data-testid="monitor-infrastructure-lock-wait-card">
        <CardHeader>
          <CardTitle>{t('database.lockWait')}</CardTitle>
          <p className="text-xs text-muted-foreground" data-testid="monitor-infrastructure-lock-wait-scope">{t('database.lockWaitScope')}</p>
          <p className="text-xs text-muted-foreground">{t('database.lockWaitTimeBasis')}</p>
        </CardHeader>
        <CardContent>
          {diagnostics.lock_waits === 'error' ? (
            <div data-testid="monitor-infrastructure-lock-wait-error"><DegradedBanner message={t('database.lockWaitFailed')} /></div>
          ) : diagnostics.lock_waits === 'unsupported' ? (
            <div data-testid="monitor-infrastructure-lock-wait-unsupported"><EmptyState message={t('database.lockWaitUnsupported')} /></div>
          ) : lockWaits.length === 0 ? (
            <EmptyState message={t('database.noLockWaits')} />
          ) : (
            <>
            <p className="mb-3 text-sm text-muted-foreground" data-testid="monitor-infrastructure-lock-wait-count" data-truncated={data?.lock_wait_info?.truncated}>
              {data?.lock_wait_info?.total != null
                ? t('database.lockWaitCount', { shown: lockWaits.length, total: data.lock_wait_info.total })
                : t('database.lockWaitCountUnknown')}
              {data?.lock_wait_info?.truncated && <span className="ml-2 font-medium text-destructive">{t('database.lockWaitTruncated')}</span>}
            </p>
            <Table data-testid="monitor-infrastructure-lock-wait-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('database.waitingSession')}</TableHead>
                  <TableHead>{t('database.statementDatabase')}</TableHead>
                  <TableHead>{t('database.lockWaitType')}</TableHead>
                  <TableHead>{t('database.lockMode')}</TableHead>
                  <TableHead>{t('database.lockObject')}</TableHead>
                  <TableHead>{t('database.query')}</TableHead>
                  <TableHead className="text-right" aria-sort={data?.lock_wait_info ? 'descending' : undefined}>{t('database.waitMs')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lockWaits.map((w, i) => {
                  const elapsed = w.statement_elapsed_ms ?? w.wait_ms;
                  return <TableRow key={i} data-testid={`monitor-infrastructure-lock-wait-row-${i + 1}`}>
                    <TableCell className="text-xs">
                      <div>PID: {w.pid || '—'}</div>
                      {w.session_id && <div>{t('database.sessionId')}: {w.session_id}</div>}
                      <div>{t('database.statementUser')}: {w.user_name || '—'}</div>
                    </TableCell>
                    <TableCell className="text-xs">{w.database_name || '—'} / {w.database_id || '—'}</TableCell>
                    <TableCell>{w.wait_type}</TableCell>
                    <TableCell className="font-mono text-xs">{w.mode || '—'}</TableCell>
                    <TableCell className="max-w-[300px] whitespace-normal break-all font-mono text-xs">{w.wait_object || t('database.sourceNotProvided')}</TableCell>
                    <TableCell className="max-w-[250px] text-xs">
                      <TooltipProvider><Tooltip>
                        <TooltipTrigger className="block w-full truncate text-left font-mono" data-testid={`monitor-infrastructure-lock-query-trigger-${i + 1}`}>{w.query || t('database.sourceNotProvided')}</TooltipTrigger>
                        <TooltipContent className="max-w-[600px] whitespace-pre-wrap break-all text-xs" data-testid={`monitor-infrastructure-lock-query-tooltip-${i + 1}`}>
                          <p className="font-mono">{w.query || t('database.sourceNotProvided')}</p>
                          <p>{t('database.statementStartedAt')}: {formatTimestamp(w.query_started_at)}</p>
                        </TooltipContent>
                      </Tooltip></TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right" data-testid={`monitor-infrastructure-lock-statement-age-${i + 1}`}>{elapsed != null && Number.isFinite(elapsed) && elapsed >= 0 ? `${elapsed.toFixed(0)}ms` : t('database.sourceNotProvided')}</TableCell>
                  </TableRow>
                })}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
