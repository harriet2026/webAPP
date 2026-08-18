'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReactECharts from 'echarts-for-react';
import type { LatencyData, LatencyBucket } from '@/lib/api/delivery-traffic';

interface LatencyChartProps {
  latency?: LatencyData;
  isLoading: boolean;
}

export function LatencyChart({ latency, isLoading }: LatencyChartProps) {
  const t = useTranslations('deliveryTraffic');

  const option = useMemo(() => {
    if (!latency) return null;

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
  }, [latency]);

  const titleKey = 'chart.latencyDistribution';

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
