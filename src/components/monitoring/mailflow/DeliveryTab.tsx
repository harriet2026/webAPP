'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, DegradedBanner, TimeoutBanner } from './StateBanners';
import { useMailflowDelivery, useMailflowBounce, isTimeoutError } from './hooks';
import { degradeMessage } from '@/lib/monitoring/degrade';
import { createTimeAxisFormatter } from '@/lib/monitoring/chart-time';
import type { TimeRange, MailflowDirection } from '@/types/monitoring';

interface DeliveryTabProps {
  range: TimeRange;
  direction: MailflowDirection;
}

const LATENCY_COLORS: Record<'avg' | 'p95' | 'p99', string> = {
  avg: '#10b981',
  p95: '#f59e0b',
  p99: '#ef4444',
};

// ClusterAggregateHint marks a card whose data is a cluster-wide aggregate
// (central-DB source, not per-node) per spec §3.1.
function ClusterAggregateHint({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="cursor-help text-muted-foreground" />}>
          <Info className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function DeliveryTab({ range, direction }: DeliveryTabProps) {
  const t = useTranslations('mailflow');
  const locale = useLocale();
  const { data, isLoading, isError, error, refetch } = useMailflowDelivery(range, direction);
  const { data: bounceData } = useMailflowBounce(range, direction);

  const latencyOption = useMemo(() => {
    const trend = data?.trend ?? [];
    if (trend.length === 0) return null;
    const xs = trend.map((p) => p.ts);
    const keys = ['avg', 'p95', 'p99'] as const;
    return {
      tooltip: {
        trigger: 'axis' as const,
        valueFormatter: (v: number) => `${(v ?? 0).toFixed(2)}s`,
      },
      legend: { data: keys.map((k) => t(`latency.${k}`)), top: 0 },
      grid: { left: 48, right: 16, top: 36, bottom: 32 },
      xAxis: {
        type: 'category' as const,
        data: xs,
        axisLabel: {
          showMaxLabel: true,
          formatter: createTimeAxisFormatter(locale, range === '7d'),
        },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        axisLabel: { formatter: '{value}s' },
      },
      series: keys.map((k) => ({
        name: t(`latency.${k}`),
        type: 'line',
        smooth: true,
        lineStyle: { width: 2 },
        itemStyle: { color: LATENCY_COLORS[k] },
        data: trend.map((p) => p[k]),
      })),
    };
  }, [data, t, locale, range]);

  const reasonOption = useMemo(() => {
    const reasons = bounceData?.reasons ?? [];
    if (reasons.length === 0) return null;
    const ordered = [...reasons].sort((a, b) => b.count - a.count);
    const labels = ordered.map((r) => (r.code === 'Other' ? t('reasonOther') : r.code));
    const percents = ordered.map((r) => Number(r.percent.toFixed(1)));
    const counts = ordered.map((r) => r.count);
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: Array<{ dataIndex: number; name: string; value: number }>) => {
          const p = params[0];
          if (!p) return '';
          const idx = p.dataIndex;
          return `${p.name}<br/>${p.value}% (${counts[idx]})`;
        },
      },
      grid: { left: 64, right: 32, top: 16, bottom: 24 },
      xAxis: {
        type: 'value' as const,
        max: 100,
        axisLabel: { formatter: '{value}%' },
      },
      yAxis: {
        type: 'category' as const,
        data: labels,
        axisLabel: { width: 80, overflow: 'truncate' as const },
      },
      series: [
        {
          type: 'bar',
          data: percents,
          itemStyle: { color: '#f59e0b', borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right' as const, formatter: '{c}%' },
        },
      ],
    };
  }, [bounceData, t]);

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full rounded-lg" />;
  }

  if (isError && !data) {
    // Cold-start timeout (no cached data yet): timeout banner, not the
    // "collection anomaly" degraded banner (spec §3.6 / review GAP-3).
    if (isTimeoutError(error)) {
      return <TimeoutBanner onRetry={() => refetch()} />;
    }
    return <DegradedBanner message={t('agentOffline')} />;
  }

  if (!data) {
    return <EmptyState message={t('noData')} />;
  }

  const timedOut = isError && isTimeoutError(error);
  const topDomains = (bounceData?.top_domains ?? []).slice(0, 10);
  const degraded = data.degraded || bounceData?.degraded;
  const degradedCode = data.degraded ? data.degraded_code : bounceData?.degraded_code;

  return (
    <div className="space-y-4" data-testid="monitor-mailflow-delivery">
      {timedOut && <TimeoutBanner onRetry={() => refetch()} />}
      {degraded && <DegradedBanner message={degradeMessage(degradedCode, t)} />}
      <Card data-testid="monitor-mailflow-delivery-trend">
        <CardHeader className="flex flex-row items-center gap-2">
          <CardTitle>{t('charts.latencyTrend')}</CardTitle>
          <ClusterAggregateHint text={t('clusterAggregate')} />
          {data.approx === true && (
            <Badge variant="secondary">{t('approximate')}</Badge>
          )}
        </CardHeader>
        <CardContent>
          {!latencyOption ? (
            <EmptyState message={t('noData')} />
          ) : (
            <ReactECharts option={latencyOption} style={{ height: 300 }} />
          )}
        </CardContent>
      </Card>

      <Card data-testid="monitor-mailflow-bounce-top10">
        <CardHeader className="flex flex-row items-center gap-2">
          <CardTitle>{t('charts.bounceTop10')}</CardTitle>
          <ClusterAggregateHint text={t('clusterAggregate')} />
        </CardHeader>
        <CardContent>
          {topDomains.length === 0 ? (
            <EmptyState message={t('noData')} />
          ) : (
            <div className="overflow-x-auto">
            <Table data-testid="monitor-mailflow-bounce-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tables.domain')}</TableHead>
                  <TableHead className="text-right">{t('tables.rate5xx')}</TableHead>
                  <TableHead className="text-right">{t('tables.rate4xx')}</TableHead>
                  <TableHead className="text-right">{t('tables.attempts')}</TableHead>
                  <TableHead>{t('tables.lastBounce')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {topDomains.map((d) => {
                  const critical = d.rate_5xx_status === 'critical';
                  return (
                    <TableRow
                      key={d.domain}
                      data-testid={`monitor-mailflow-bounce-row-${d.domain}`}
                      className={critical ? 'bg-red-50 dark:bg-red-950/40' : undefined}
                    >
                      <TableCell className="font-medium">{d.domain}</TableCell>
                      <TableCell className={`text-right tabular-nums ${critical ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`}>
                        {d.rate_5xx.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {d.rate_4xx.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.attempts}</TableCell>
                      <TableCell className="text-muted-foreground">{d.last_bounce}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          render={<Link href={`/${locale}/logs/email?recipient_domain=${encodeURIComponent(d.domain)}`} />}
                        >
                          {t('tables.viewLogs')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="monitor-mailflow-bounce-reasons">
        <CardHeader className="flex flex-row items-center gap-2">
          <CardTitle>{t('charts.bounceReasons')}</CardTitle>
          <ClusterAggregateHint text={t('clusterAggregate')} />
        </CardHeader>
        <CardContent>
          {!reasonOption ? (
            <EmptyState message={t('noData')} />
          ) : (
            <ReactECharts option={reasonOption} style={{ height: 240 }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
