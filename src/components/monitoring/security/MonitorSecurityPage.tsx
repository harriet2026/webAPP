'use client';

import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Box, Bug, Globe, Loader2, RefreshCw, Shield } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import {
  AccessDenied,
  DegradedBanner,
  EmptyState,
} from '@/components/monitoring/infrastructure/StateBanners';
import { createTimeAxisFormatter } from '@/lib/monitoring/chart-time';
import { cn } from '@/lib/utils';
import type {
  SecurityEngine,
  SecurityEngineCard,
  SecurityEngineDetailRow,
  SecurityTimeRange,
} from '@/types/monitoring';
import { useSecurityEngine } from './hooks';

const ENGINE_CONFIG = {
  antispam: {
    icon: Shield,
    color: '#1890ff',
    primaryUnit: 'mailPerSecond',
    primaryMetric: 'scanThroughput',
    leftMetric: 'scanThroughput',
    leftUnit: 'mailPerSecond',
    rightMetric: 'averageScanTime',
    rightUnit: 'ms',
  },
  antivirus: {
    icon: Bug,
    color: '#52c41a',
    primaryUnit: 'ms',
    primaryMetric: 'scanTime',
    leftMetric: 'attachmentThroughput',
    leftUnit: 'attachmentPerSecond',
    rightMetric: 'averageScanTime',
    rightUnit: 'ms',
  },
  sandbox: {
    icon: Box,
    color: '#fa8c16',
    primaryUnit: 'seconds',
    primaryMetric: 'averageAnalysis',
    leftMetric: 'averageAnalysisTime',
    leftUnit: 'seconds',
    rightMetric: 'queueWait',
    rightUnit: 'items',
  },
  rbl: {
    icon: Globe,
    color: '#722ed1',
    primaryUnit: 'adaptiveLatency',
    primaryMetric: 'averageResponse',
    leftMetric: 'averageResponseTime',
    leftUnit: 'ms',
    rightMetric: 'timeoutRate',
    rightUnit: 'percent',
  },
} as const;

const ENGINES = Object.keys(ENGINE_CONFIG) as SecurityEngine[];

const TABLE_COLUMNS: Record<SecurityEngine, string[]> = {
  antispam: ['instanceId', 'timePeriod', 'scanThroughput', 'averageLatency', 'queueBacklog'],
  antivirus: ['instanceId', 'timePeriod', 'attachmentThroughput', 'averageLatency', 'largeFileTimeout'],
  sandbox: ['nodeName', 'nodeStatus', 'averageAnalysisTime', 'queueLength', 'nodeLoad'],
  rbl: ['rblSource', 'averageResponseTime', 'timeoutRate', 'queryThroughput'],
};

function detailCells(engine: SecurityEngine, row: SecurityEngineDetailRow): Array<string | number> {
  if (engine === 'antispam') {
    return [row.instance_id ?? '—', row.time_period ?? '—', row.scan_throughput ?? '—', row.average_latency_ms ?? '—', row.queue_backlog ?? '—'];
  }
  if (engine === 'antivirus') {
    return [row.instance_id ?? '—', row.time_period ?? '—', row.attachment_throughput ?? '—', row.average_latency_ms ?? '—', row.large_file_timeout ?? '—'];
  }
  if (engine === 'sandbox') {
    return [
      row.node_name ?? '—',
      row.node_status ?? 'error',
      row.average_analysis_seconds === undefined ? '—' : `${row.average_analysis_seconds}s`,
      row.queue_length ?? '—',
      row.node_load_pct === undefined ? '—' : `${row.node_load_pct}%`,
    ];
  }
  return [
    row.rbl_source ?? '—',
    row.average_response_ms === undefined ? '—' : `${row.average_response_ms}ms`,
    row.timeout_rate === undefined ? '—' : `${row.timeout_rate}%`,
    row.query_throughput ?? '—',
  ];
}

export function MonitorSecurityPage() {
  const t = useTranslations('monitorSecurity');
  const locale = useLocale();
  const { isSystemAdmin } = useAuth();
  const [engine, setEngine] = useState<SecurityEngine>('antispam');
  const [range, setRange] = useState<SecurityTimeRange>('24h');
  const query = useSecurityEngine(engine, range);
  const config = ENGINE_CONFIG[engine];
  const trend = useMemo(() => query.data?.trend ?? [], [query.data?.trend]);
  const rows = query.data?.details ?? [];
  const cards = new Map((query.data?.cards ?? []).map((item) => [item.key, item]));

  const trendOption = useMemo(() => ({
    animationDuration: 300,
    color: [config.color, '#8c8c8c'],
    tooltip: { trigger: 'axis' },
    legend: {
      bottom: 0,
      data: [
        `${t(`metric.${config.leftMetric}`)} (${t(`unit.${config.leftUnit}`)})`,
        `${t(`metric.${config.rightMetric}`)} (${t(`unit.${config.rightUnit}`)})`,
      ],
    },
    grid: { left: 54, right: 54, top: 24, bottom: 54 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((item) => item.ts),
      axisLabel: { formatter: createTimeAxisFormatter(locale, range === '7d' || range === '30d') },
    },
    yAxis: [
      { type: 'value', name: t(`unit.${config.leftUnit}`), splitLine: { lineStyle: { opacity: 0.18 } } },
      { type: 'value', name: t(`unit.${config.rightUnit}`), splitLine: { show: false } },
    ],
    series: [
      {
        name: `${t(`metric.${config.leftMetric}`)} (${t(`unit.${config.leftUnit}`)})`,
        type: 'line',
        smooth: true,
        symbol: 'none',
        areaStyle: { opacity: 0.08 },
        data: trend.map((item) => item.primary),
      },
      {
        name: `${t(`metric.${config.rightMetric}`)} (${t(`unit.${config.rightUnit}`)})`,
        type: 'line',
        smooth: true,
        symbol: 'none',
        yAxisIndex: 1,
        data: trend.map((item) => item.secondary),
      },
    ],
  }), [config, t, trend, locale, range]);

  if (!isSystemAdmin) {
    return (
      <div data-testid="monitor-security-access-denied">
        <AccessDenied />
      </div>
    );
  }

  const formatPrimary = (item: SecurityEngine, card?: SecurityEngineCard) => {
    if (!card || card.status === 'error' || card.primary_value === null) return '—';
    const value = card.primary_value;
    const unit = ENGINE_CONFIG[item].primaryUnit;
    if (unit === 'adaptiveLatency') {
      return value < 1000
        ? `${value}${t('unit.ms')}`
        : `${(value / 1000).toFixed(1)}${t('unit.seconds')}`;
    }
    return `${value}${t(`unit.${unit}`)}`;
  };

  return (
    <PageShell data-testid="monitor-security-page">
      <PageHeader
        title={t('title')}
        actions={(
          <div className="flex flex-wrap items-center gap-2" data-testid="monitor-security-controls">
            <Select value={range} onValueChange={(value) => setRange(value as SecurityTimeRange)}>
              <SelectTrigger className="w-32" data-testid="monitor-security-range-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent data-testid="monitor-security-range-content">
                {(['24h', '7d', '30d'] as SecurityTimeRange[]).map((item) => (
                  <SelectItem key={item} value={item} data-testid={`monitor-security-range-${item}`}>
                    {t(`range.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              title={t('refresh')}
              aria-label={t('refresh')}
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              data-testid="monitor-security-refresh"
            >
              <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
            </Button>
          </div>
        )}
      />

      {query.isLoading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground" data-testid="monitor-security-loading">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('loading')}
        </div>
      )}
      {query.isError && (
        <div data-testid="monitor-security-error">
          <DegradedBanner message={t('loadFailed')} />
        </div>
      )}
      {query.data?.degraded && (
        <div data-testid="monitor-security-degraded">
          <DegradedBanner message={t('degraded')} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="monitor-security-engine-list">
        {ENGINES.map((item) => {
          const itemConfig = ENGINE_CONFIG[item];
          const card = cards.get(item);
          const Icon = itemConfig.icon;
          const selected = item === engine;
          const normal = card?.status === 'normal';
          return (
            <button
              key={item}
              type="button"
              onClick={() => setEngine(item)}
              aria-pressed={selected}
              data-testid={`monitor-security-engine-${item}`}
              className={cn(
                'rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-primary/60',
                selected && 'border-primary bg-primary/5 ring-2 ring-primary/20',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex rounded-md p-2" style={{ color: itemConfig.color, background: `${itemConfig.color}14` }}>
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={cn('inline-flex items-center gap-1 text-xs', normal ? 'text-emerald-600' : 'text-destructive')}
                  data-testid={`monitor-security-engine-status-${item}`}
                >
                  <span className={cn('h-2 w-2 rounded-full', normal ? 'bg-emerald-500' : 'bg-destructive')} />
                  {normal ? t('normal') : t('abnormal')}
                </span>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">{t(`engine.${item}`)}</div>
              <div className="mt-1 text-2xl font-semibold">{formatPrimary(item, card)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t(`metric.${itemConfig.primaryMetric}`)}</div>
            </button>
          );
        })}
      </div>

      <Card data-testid="monitor-security-trend-card">
        <CardHeader>
          <CardTitle>{t('performanceTrend', { engine: t(`engine.${engine}`), range: t(`range.${range}`) })}</CardTitle>
        </CardHeader>
        <CardContent data-testid="monitor-security-trend-chart">
          {trend.length > 0
            ? <ReactECharts option={trendOption} style={{ height: 340 }} notMerge />
            : <div data-testid="monitor-security-trend-empty"><EmptyState message={t('noData')} /></div>}
        </CardContent>
      </Card>

      <Card data-testid="monitor-security-detail-card">
        <CardHeader>
          <CardTitle>{t('detailTitle', { engine: t(`engine.${engine}`) })}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div data-testid="monitor-security-detail-empty"><EmptyState message={t('noData')} /></div>
          ) : (
            <Table data-testid="monitor-security-detail-table">
              <TableHeader>
                <TableRow>
                  {TABLE_COLUMNS[engine].map((column) => <TableHead key={column}>{t(`table.${column}`)}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} data-testid={`monitor-security-detail-row-${row.id}`}>
                    {detailCells(engine, row).map((cell, index) => (
                      <TableCell key={`${row.id}-${TABLE_COLUMNS[engine][index]}`}>
                        {cell === 'normal' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            {t('normal')}
                          </span>
                        ) : cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {query.data?.approximate && (
        <div className="text-xs text-muted-foreground" data-testid="monitor-security-approximate">{t('approximate')}</div>
      )}
      <div className="text-right text-xs text-muted-foreground" data-testid="monitor-security-last-updated">
        {t('lastUpdated', { time: query.data?.collected_at ? new Date(query.data.collected_at).toLocaleTimeString() : '—' })}
      </div>
    </PageShell>
  );
}
