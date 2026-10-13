'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Database, Server } from 'lucide-react';
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
import { useChartTheme } from './useChartTheme';
import { formatMetric, formatMetricBytes } from './format_metric';
import { degradeMessage } from '@/lib/monitoring/degrade';
import { createTimeAxisFormatter, createTimeTooltipFormatter } from '@/lib/monitoring/chart-time';
import type { TimeRange, DatabaseMetricState, DatabaseResp } from '@/types/monitoring';

interface DatabaseTabProps {
  node: string;
  range: TimeRange;
}

export function DatabaseTab({ node, range }: DatabaseTabProps) {
  const t = useTranslations('infrastructure');
  const locale = useLocale();
  const chartColors = useChartTheme();
  const { data, isLoading, isError } = useDatabase(node, range);
  const databaseDisplayName = data?.db_backend?.toLowerCase() === 'opengauss' ? 'openGauss' : data?.db_backend;
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
  const timeAxisPointer = useMemo(() => {
    const formatTooltipTime = createTimeTooltipFormatter(locale);
    return { label: { formatter: ({ value }: { value: string | number }) => formatTooltipTime(String(value)) } };
  }, [locale]);
  const statisticsTimeFormatter = useMemo(() => {
    const formatTime = createTimeTooltipFormatter(locale);
    const zoneFormatter = new Intl.DateTimeFormat(locale, { timeZoneName: 'short' });
    return (value: string) => {
      const zone = zoneFormatter.formatToParts(new Date(value)).find(part => part.type === 'timeZoneName')?.value;
      return [formatTime(value), zone].filter(Boolean).join(' ');
    };
  }, [locale]);
  function formatTimestamp(value: string | undefined) {
    if (!value || Number.isNaN(new Date(value).getTime())) return t('database.sourceNotProvided');
    const displayTime = statisticsTimeFormatter(value);
    return <time dateTime={value} title={displayTime}>{displayTime}</time>;
  }

  const trendKey = metric === 'connections' ? 'conn_trend' : 'latency_trend';
  const trendOption = useMemo(() => {
    const pts = performance.data?.[trendKey]?.points;
    if (!pts?.length) return null;
    return {
      textStyle: { color: chartColors.foreground },
      tooltip: { trigger: 'axis' as const, valueFormatter: (value: unknown) => `${formatMetric(value, locale, metric === 'connections' ? 0 : 2)}${metric === 'connections' ? '' : ' ms'}`, backgroundColor: chartColors.background, borderColor: chartColors.border, textStyle: { color: chartColors.foreground }, axisPointer: { lineStyle: { color: chartColors.muted } } },
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      xAxis: { type: 'category' as const, data: pts.map((p) => p.ts), axisPointer: timeAxisPointer, axisLabel: { showMaxLabel: true, formatter: timeAxisFormatter, color: chartColors.muted }, axisLine: { lineStyle: { color: chartColors.border } }, axisTick: { lineStyle: { color: chartColors.border } } },
      yAxis: { type: 'value' as const, minInterval: metric === 'connections' ? 1 : undefined, axisLabel: { formatter: (value: number) => `${formatMetric(value, locale, metric === 'connections' ? 0 : 2)}${metric === 'connections' ? '' : ' ms'}`, color: chartColors.muted }, splitLine: { lineStyle: { color: chartColors.border } } },
      series: [{ type: 'line', data: pts.map((p) => p.value), smooth: true, lineStyle: { width: 2 }, itemStyle: { color: chartColors.primary }, areaStyle: { opacity: 0.1 } }],
    };
  }, [performance.data, timeAxisFormatter, timeAxisPointer, trendKey, metric, chartColors, locale]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
  const rankingMatchesNode = data?.sql_ranking?.node === node
    && data.sql_ranking.scope === 'selected_node_visible_entries' && data.sql_ranking.node_filter_applied;
  const slowQueries = rankingMatchesNode ? data?.slow_queries ?? [] : [];
  const locksMatchNode = data?.lock_wait_info?.node === node
    && data.lock_wait_info.scope === 'selected_node_visible_requests';
  const lockWaits = locksMatchNode ? data?.lock_waits ?? [] : [];
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
  const dbFailed = ['error', 'down', 'no_receiver'].includes(dbReplication?.state ?? '') || diagnostics.connections === 'error';
  const redisFailed = ['error', 'down'].includes(redisStatus?.replication?.state ?? '') || ['error', 'down'].includes(redisState);
  const dbHealthy = !dbFailed && diagnostics.connections === 'ok' && dbStatus?.status === 'ok';
  const redisHealthy = !redisFailed && redisState === 'ok';
  const cardStyle = 'gap-0 rounded-xl bg-card py-0 shadow-sm';
  const iconTone = (failed: boolean, healthy: boolean) => failed ? 'text-destructive' : healthy ? 'text-success' : 'text-muted-foreground';

  return (
    <div className="space-y-4" data-testid="monitor-infrastructure-database">
      {data?.degraded && !localDBErrors && (
        <DegradedBanner message={degradeMessage(data.degraded_code, t)} />
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="monitor-infrastructure-db-status-cards">
        <Card data-testid="monitor-infrastructure-db-card" className={`${cardStyle} ${dbFailed ? 'border-destructive' : 'border-border'}`}>
          <CardContent className="p-4">
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Database className={`size-8 shrink-0 ${iconTone(dbFailed, dbHealthy)}`} aria-hidden="true" data-testid="monitor-infrastructure-db-icon" />
                <div>
                  <div className="text-base font-medium" data-testid="monitor-infrastructure-db-name">{databaseDisplayName ?? 'Database'}</div>
                  <div className="text-sm text-muted-foreground">{t('database.replication.title')}</div>
                </div>
              </div>
              <div className="ml-auto max-w-full text-right">
                {diagnostics.connections === 'error' ? (
                  <DegradedBanner message={t('database.connectionQueryFailed')} />
                ) : diagnostics.connections === 'unsupported' ? (
                  <Badge variant="secondary" data-testid="monitor-infrastructure-db-health">{t('database.connectionUnsupported')}</Badge>
                ) : <div className="space-y-1">
                  <Badge variant="secondary" className={dbHealthy ? 'bg-success/10 text-success' : undefined} data-testid="monitor-infrastructure-db-health">
                    {t(dbStatus?.status === 'ok' ? 'database.queryAvailable' : 'database.metricStates.missing')}
                  </Badge>
                  {dbStatus?.latency_ms != null && (
                    <div className="text-xs text-muted-foreground">{formatMetric(dbStatus.latency_ms, locale)}ms</div>
                  )}
                </div>}
              </div>
            </div>
            <DatabaseReplicationStatus replication={dbReplication} source="db" />
          </CardContent>
        </Card>
        <Card data-testid="monitor-infrastructure-cache-card" className={`${cardStyle} ${redisFailed ? 'border-destructive' : 'border-border'}`}>
          <CardContent className="p-4">
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Server className={`size-8 shrink-0 ${iconTone(redisFailed, redisHealthy)}`} aria-hidden="true" data-testid="monitor-infrastructure-redis-icon" />
                <div>
                  <div className="text-base font-medium" data-testid="monitor-infrastructure-redis-name">{t('database.redis')}</div>
                  <div className="text-sm text-muted-foreground">{t('database.replication.title')}</div>
                </div>
              </div>
              <div className="ml-auto max-w-full space-y-1 text-right">
                  <Badge variant={redisState === 'error' || redisState === 'down' ? 'destructive' : 'secondary'} className={redisHealthy ? 'bg-success/10 text-success' : undefined} data-state={redisState} data-testid="monitor-infrastructure-redis-health">
                    {metricStateLabel(redisState)}
                  </Badge>
                  {redisState === 'ok' && redisStatus?.latency_ms != null && (
                    <div className="text-xs text-muted-foreground">PING {formatMetric(redisStatus.latency_ms, locale)}ms</div>
                  )}
              </div>
            </div>
            <DatabaseReplicationStatus replication={redisStatus?.replication} source="redis" />
          </CardContent>
        </Card>
      </div>

      {data?.db_backend?.toUpperCase() === 'OPENGAUSS' && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{t('database.cacheHitRatio')}</div>
              <div className="mt-1 text-2xl font-semibold">
                {currentValue('cache_hit_ratio', data.cache_hit_ratio, (value) => `${formatMetric(value, locale, 1)}%`)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{t('database.activeConns')}</div>
              <div className="mt-1 text-2xl font-semibold">
                {currentValue('active_conns', data.active_conns, (value) => formatMetric(value, locale, 0))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{t('database.dbSize')}</div>
              <div className="mt-1 text-2xl font-semibold">
                {currentValue('db_size_bytes', data.db_size_bytes, (value) => formatMetricBytes(value, locale))}
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
                tooltip: { trigger: 'axis' as const, valueFormatter: (value: unknown) => formatMetric(value, locale) },
                grid: { left: 48, right: 16, top: 24, bottom: 32 },
                xAxis: { type: 'category' as const, data: data.dml_rate.points.map((p) => p.ts), axisPointer: timeAxisPointer, axisLabel: { showMaxLabel: true, formatter: timeAxisFormatter } },
                yAxis: { type: 'value' as const, axisLabel: { formatter: (value: number) => formatMetric(value, locale) } },
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
              <div className="flex items-center gap-1 rounded-md bg-muted p-1" role="group" aria-label={t('database.sourceSelection')}>
                {(['db', 'redis'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={source === value}
                    className={`rounded px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${source === value
                      ? 'bg-background font-medium text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'}`}
                    data-testid={`monitor-infrastructure-db-source-${value}`} onClick={() => selectSource(value)}>
                    {value === 'redis' ? t('database.redis') : databaseDisplayName || t('database.relationalDatabase')}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('database.metricSelection')}>
                {metrics.map((value) => (
                  <button key={value} type="button" aria-pressed={metric === value}
                    className={`rounded px-2 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring ${metric === value
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
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
          <p className="text-xs text-muted-foreground" data-testid="monitor-infrastructure-sql-ranking-scope" data-node={node}>{t('database.sqlRankingScope', { node })}</p>
          <p className="text-xs text-muted-foreground">{t('database.sqlRankingTimeScope')}</p>
        </CardHeader>
        <CardContent>
          {diagnostics.slow_queries === 'error' ? (
            <div data-testid="monitor-infrastructure-slow-query-error"><DegradedBanner message={t('database.slowQueryFailed')} /></div>
          ) : diagnostics.slow_queries === 'unsupported' ? (
            <div data-testid="monitor-infrastructure-slow-query-unsupported"><EmptyState message={t('database.slowQueryUnsupported')} /></div>
          ) : !rankingMatchesNode ? (
            <div data-testid="monitor-infrastructure-sql-ranking-node-unavailable"><EmptyState message={t('database.sqlRankingNodeUnavailable')} /></div>
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
                              <p>{t('database.execCount')}: {formatMetric(q.exec_count, locale, 0)}</p>
                              <p>{t('database.avgMs')}: {formatMetric(q.avg_ms, locale)}ms</p>
                              <p>{t('database.totalMs')}: {formatMetric(q.total_ms, locale)}ms</p>
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
                    <TableCell className="text-right">{formatMetric(q.exec_count, locale, 0)}</TableCell>
                    <TableCell className="text-right">{formatMetric(q.avg_ms, locale)}ms</TableCell>
                    <TableCell className="text-right">{formatMetric(q.total_ms, locale)}ms</TableCell>
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
          <p className="text-xs text-muted-foreground" data-testid="monitor-infrastructure-lock-wait-scope" data-node={node}>{t('database.lockWaitScope', { node })}</p>
          <p className="text-xs text-muted-foreground">{t('database.lockWaitTimeBasis')}</p>
        </CardHeader>
        <CardContent>
          {!locksMatchNode || diagnostics.lock_waits === 'error' ? (
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
                    <TableCell className="text-right" data-testid={`monitor-infrastructure-lock-statement-age-${i + 1}`}>{elapsed != null && Number.isFinite(elapsed) && elapsed >= 0 ? `${formatMetric(elapsed, locale)}ms` : t('database.sourceNotProvided')}</TableCell>
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
