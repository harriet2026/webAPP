'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { TrendPoint } from '@/lib/api/delivery-traffic';

export function QueueTrendChart({ points, isLoading }: { points?: TrendPoint[]; isLoading: boolean }) {
  const t = useTranslations('deliveryTraffic');
  const option = useMemo(() => {
    if (!points?.length) return null;
    return {
      tooltip: { trigger: 'axis' as const },
      grid: { left: 52, right: 16, top: 24, bottom: 32 },
      xAxis: { type: 'category' as const, data: points.map((point) => point.date) },
      yAxis: { type: 'value' as const },
      series: [{
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.18 },
        lineStyle: { width: 2 },
        itemStyle: { color: '#f59e0b' },
        data: points.map((point) => Number(point.count ?? point.value ?? point.queue ?? point.backlog ?? 0)),
      }],
    };
  }, [points]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-amber-500" />
          {t('chart.queueTrend')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-[300px] w-full rounded-lg" /> : !option ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">{t('noData')}</div>
        ) : <ReactECharts option={option} style={{ height: 300 }} />}
      </CardContent>
    </Card>
  );
}
