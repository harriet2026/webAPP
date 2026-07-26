'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReactECharts from 'echarts-for-react';
import type { LatencyData, LatencyBucket, Direction } from '@/lib/api/delivery-traffic';

interface LatencyChartProps {
  latency?: LatencyData;
  direction: Direction;
  isLoading: boolean;
}

export function LatencyChart({ latency, direction, isLoading }: LatencyChartProps) {
  const t = useTranslations('deliveryTraffic');

  const option = useMemo(() => {
    if (!latency) return null;

    if (direction === 'send' && latency.percentiles && latency.percentiles.length > 0) {
      const dates = latency.percentiles.map((p) => p.date);
      const p50 = latency.percentiles.map((p) => (p.p50 as number) ?? 0);
      const p90 = latency.percentiles.map((p) => (p.p90 as number) ?? 0);
      const p99 = latency.percentiles.map((p) => (p.p99 as number) ?? 0);

      return {
        tooltip: { trigger: 'axis' as const },
        legend: { data: ['P50', 'P90', 'P99'] },
        grid: { left: 56, right: 16, top: 48, bottom: 32 },
        xAxis: { type: 'category' as const, data: dates },
        yAxis: { type: 'value' as const, name: 'ms' },
        series: [
          { name: 'P50', type: 'line', data: p50, smooth: true, lineStyle: { width: 2 }, itemStyle: { color: '#22c55e' } },
          { name: 'P90', type: 'line', data: p90, smooth: true, lineStyle: { width: 2 }, itemStyle: { color: '#f59e0b' } },
          { name: 'P99', type: 'line', data: p99, smooth: true, lineStyle: { width: 2 }, itemStyle: { color: '#ef4444' } },
        ],
      };
    }

    if (latency.buckets && latency.buckets.length > 0) {
      return {
        tooltip: {
          trigger: 'axis' as const,
          formatter: (params: unknown) => {
            const p = (params as { name: string; value: number }[])[0];
            if (!p) return '';
            const bucket = (latency.buckets as LatencyBucket[]).find((b) => b.name === p.name);
            const healthy = bucket ? (bucket.healthy ? ' ✓' : ' ✗') : '';
            return `${p.name}: ${p.value}%${healthy}`;
          },
        },
        grid: { left: 72, right: 16, top: 16, bottom: 32 },
        xAxis: { type: 'value' as const, name: '%' },
        yAxis: { type: 'category' as const, data: latency.buckets.map((b) => b.name) },
        series: [{
          type: 'bar',
          data: latency.buckets.map((b) => ({
            value: b.value,
            itemStyle: { color: b.healthy ? '#22c55e' : '#ef4444' },
          })),
          barWidth: 16,
        }],
      };
    }

    return null;
  }, [latency, direction]);

  const titleKey = direction === 'send' && (latency?.percentiles?.length ?? 0) > 0
    ? 'chart.latencyPercentiles'
    : 'chart.latencyDistribution';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(titleKey)}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full rounded-lg" />
        ) : !option ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            {t('noData') as string}
          </div>
        ) : (
          <ReactECharts option={option} style={{ height: 300 }} />
        )}
      </CardContent>
    </Card>
  );
}
