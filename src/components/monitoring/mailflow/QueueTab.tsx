'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, DegradedBanner, TimeoutBanner } from './StateBanners';
import { useMailflowQueue, useMailflowQueueTrend } from './hooks';
import { isTimeoutError } from './hooks';
import { degradeMessage } from '@/lib/monitoring/degrade';
import type { MailflowDirection, TimeRange } from '@/types/monitoring';

interface QueueTabProps {
  node: string;
  range: TimeRange;
  direction: MailflowDirection;
}

const QUEUE_KEYS = ['incoming', 'active', 'deferred', 'held', 'corrupt'] as const;
const QUEUE_COLORS: Record<string, string> = {
  incoming: '#10b981',
  active: '#3b82f6',
  deferred: '#f59e0b',
  held: '#8b5cf6',
  corrupt: '#ef4444',
};

const AGE_BUCKETS = ['0-5min', '5-30min', '30min-4h', 'gt4h'] as const;
const AGE_COLORS: Record<string, string> = {
  '0-5min': '#10b981',
  '5-30min': '#3b82f6',
  '30min-4h': '#f59e0b',
  gt4h: '#ef4444',
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  if (status === 'critical') {
    return (
      <Badge
        variant="destructive"
        className="animate-pulse"
      >
        {label}
      </Badge>
    );
  }
  if (status === 'warning') {
    return (
      <Badge
        className="border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
      >
        {label}
      </Badge>
    );
  }
  return (
    <Badge
      className="border-transparent bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
    >
      {label}
    </Badge>
  );
}

export function QueueTab({ node, range, direction }: QueueTabProps) {
  const t = useTranslations('mailflow');
  const { data, isLoading, isError, error, refetch } = useMailflowQueue(node, range, direction);
  const { data: trendData } = useMailflowQueueTrend(node, range);

  const trendOption = useMemo(() => {
    const seriesMap = trendData?.series ?? {};
    const tsSet = new Set<string>();
    for (const key of QUEUE_KEYS) {
      const pts = seriesMap[key]?.points ?? [];
      for (const p of pts) tsSet.add(p.ts);
    }
    const timestamps = Array.from(tsSet).sort();
    if (timestamps.length === 0) return null;

    const valueMaps: Record<string, Map<string, number>> = {};
    for (const key of QUEUE_KEYS) {
      const pts = seriesMap[key]?.points ?? [];
      valueMaps[key] = new Map(pts.map((p) => [p.ts, p.value]));
    }

    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: QUEUE_KEYS.map((k) => t(`queues.${k}`)), top: 0 },
      grid: { left: 48, right: 16, top: 36, bottom: 32 },
      xAxis: {
        type: 'category' as const,
        data: timestamps,
        axisLabel: { showMaxLabel: true },
      },
      yAxis: { type: 'value' as const, min: 0 },
      series: QUEUE_KEYS.map((key) => ({
        name: t(`queues.${key}`),
        type: 'line',
        stack: 'queue',
        areaStyle: { opacity: 0.3 },
        smooth: true,
        lineStyle: { width: 1 },
        itemStyle: { color: QUEUE_COLORS[key] },
        data: timestamps.map((ts) => valueMaps[key].get(ts) ?? 0),
      })),
    };
  }, [trendData, t]);

  const ageOption = useMemo(() => {
    const buckets = data?.age ?? [];
    if (buckets.length === 0) return null;
    const byKey = new Map(buckets.map((b) => [b.bucket, b.pct]));
    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {d}%' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data: AGE_BUCKETS.filter((b) => byKey.has(b)).map((b) => ({
            name: t(`age.${b}`),
            value: byKey.get(b) ?? 0,
            itemStyle: { color: AGE_COLORS[b] },
          })),
        },
      ],
    };
  }, [data, t]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[120px] w-full rounded-lg" />
        <Skeleton className="h-[300px] w-full rounded-lg" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </div>
    );
  }

  if (isError && !data) {
    // Cold-start timeout (no cached data yet): show the timeout banner, not the
    // "collection anomaly" degraded banner (spec §3.6 / review GAP-3).
    if (isTimeoutError(error)) {
      return <TimeoutBanner onRetry={() => refetch()} />;
    }
    return <DegradedBanner message={t('agentOffline')} />;
  }

  if (!data) {
    return <EmptyState message={t('noData')} />;
  }

  // Defensive defaults: a partial/empty payload (missing depth/latency) must
  // render an empty view, not crash the whole page (the crash previously blanked
  // the page including the header — see the empty-data e2e case).
  const depthMap = new Map((data.depth ?? []).map((d) => [d.queue, d]));
  const latency = data.latency ?? {
    avg: 0, p95: 0, p99: 0,
    avg_status: 'normal', p95_status: 'normal', p99_status: 'normal',
  };
  const timedOut = isError && isTimeoutError(error);

  return (
    <div className="space-y-4" data-testid="monitor-mailflow-queue">
      {timedOut && <TimeoutBanner onRetry={() => refetch()} />}
      {data.degraded && (
        <DegradedBanner message={degradeMessage(data.degraded_code, t)} />
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {QUEUE_KEYS.map((key) => {
          const card = depthMap.get(key);
          return (
            <Card key={key} data-testid={`monitor-mailflow-queue-card-${key}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t(`queues.${key}`)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold tabular-nums">
                    {card?.value ?? 0}
                  </span>
                  <StatusBadge status={card?.status ?? 'normal'} label={t(`status.${card?.status ?? 'normal'}`)} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card data-testid="monitor-mailflow-queue-trend">
        <CardHeader>
          <CardTitle>{t('charts.trend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!trendOption ? (
            <EmptyState message={t('noData')} />
          ) : (
            <ReactECharts option={trendOption} style={{ height: 300 }} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="monitor-mailflow-queue-age">
          <CardHeader>
            <CardTitle>{t('charts.ageDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!ageOption ? (
              <EmptyState message={t('noData')} />
            ) : (
              <>
                <ReactECharts option={ageOption} style={{ height: 260 }} />
                {(() => {
                  // Surface the gt4h over-threshold status (review finding 5):
                  // the pie chart alone doesn't communicate that >4h backlog
                  // has crossed the warning/critical threshold. Render a badge
                  // so operators get an explicit alert signal.
                  const gt4h = (data?.age ?? []).find((b) => b.bucket === 'gt4h');
                  if (!gt4h || gt4h.status === 'normal') return null;
                  return (
                    <div className="mt-3 flex items-center justify-center">
                      <StatusBadge
                        status={gt4h.status}
                        label={t(`age.gt4hAlert.${gt4h.status}`, { pct: (gt4h.pct ?? 0).toFixed(1) })}
                      />
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="monitor-mailflow-queue-latency">
          <CardHeader>
            <CardTitle>{t('latency.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <LatencyRow
                label={t('latency.avg')}
                value={latency.avg}
                status={latency.avg_status}
                statusLabel={t(`status.${latency.avg_status}`)}
              />
              <LatencyRow
                label={t('latency.p95')}
                value={latency.p95}
                status={latency.p95_status}
                statusLabel={t(`status.${latency.p95_status}`)}
              />
              <LatencyRow
                label={t('latency.p99')}
                value={latency.p99}
                status={latency.p99_status}
                statusLabel={t(`status.${latency.p99_status}`)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LatencyRow({
  label,
  value,
  status,
  statusLabel,
}: {
  label: string;
  value: number;
  status: string;
  statusLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold tabular-nums">
          {value.toFixed(2)}s
        </span>
        <StatusBadge status={status} label={statusLabel} />
      </div>
    </div>
  );
}
