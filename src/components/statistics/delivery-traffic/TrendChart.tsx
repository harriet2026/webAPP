'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReactECharts from 'echarts-for-react';
import { Activity } from 'lucide-react';
import type { TrendData, Direction } from '@/lib/api/delivery-traffic';
import { useDarkMode } from './useDarkMode';

interface TrendChartProps {
  trend?: TrendData;
  direction: Direction;
  isLoading: boolean;
}

const COLORS: Record<string, string> = {
  receive: '#3b82f6',
  send: '#22c55e',
  internal: '#8b5cf6',
  total: '#3b82f6',
  success: '#22c55e',
  failed: '#ef4444',
};

export function TrendChart({ trend, direction, isLoading }: TrendChartProps) {
  const t = useTranslations('deliveryTraffic');
  const isDark = useDarkMode();
  const chartRef = useRef<ReactECharts>(null);
  const chartContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = chartContentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const resize = (width = content.clientWidth) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        chartRef.current?.getEchartsInstance().resize({ width: Math.floor(width) });
      });
    };
    const observer = new ResizeObserver(([entry]) => resize(entry.contentRect.width));
    observer.observe(content);
    const resizeFromWindow = () => resize();
    window.addEventListener('resize', resizeFromWindow);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resizeFromWindow);
    };
  }, []);

  const option = useMemo(() => {
    if (!trend || !trend.points || trend.points.length === 0) return null;

    const isHourly = trend.granularity === 'hour';
    const xLabels = trend.points.map((p) => {
      if (!isHourly) return p.date;
      const timeSeparator = Math.max(p.date.lastIndexOf('T'), p.date.lastIndexOf(' '));
      return timeSeparator >= 0 ? p.date.slice(timeSeparator + 1, timeSeparator + 6) : p.date;
    });

    const axisColor = isDark ? '#9ca3af' : '#4b5563';
    const splitColor = isDark ? '#374151' : '#e5e7eb';

    // Show every 3rd label for hourly (0,3,6,…,21) to avoid crowding.
    const xAxisLabel = isHourly
      ? { color: axisColor, fontSize: 11, interval: 2, rotate: 0 }
      : { color: axisColor, fontSize: 12 };

    if (direction === 'all') {
      const receiveData = trend.points.map((p) => (p.receive as number) ?? 0);
      const sendData = trend.points.map((p) => (p.send as number) ?? 0);
      const internalData = trend.points.map((p) => (p.internal as number) ?? 0);

      return {
        tooltip: { trigger: 'axis' as const },
        legend: {
          data: [t('direction.receive'), t('direction.send'), t('direction.internal')],
          bottom: 0,
          textStyle: { color: axisColor },
        },
        grid: { left: 48, right: 16, top: 16, bottom: 48 },
        xAxis: { type: 'category' as const, data: xLabels, axisLabel: xAxisLabel, axisLine: { lineStyle: { color: axisColor } } },
        yAxis: {
          type: 'value' as const,
          ...(isHourly ? {} : { min: 0, max: 14_000, interval: 3_500 }),
          axisLabel: { color: axisColor, fontSize: 12 },
          splitLine: { lineStyle: { type: 'dashed', color: splitColor } },
        },
        series: [
          { name: t('direction.receive'), type: 'line', data: receiveData, smooth: true, lineStyle: { width: 2 }, itemStyle: { color: COLORS.receive } },
          { name: t('direction.send'), type: 'line', data: sendData, smooth: true, lineStyle: { width: 2 }, itemStyle: { color: COLORS.send } },
          { name: t('direction.internal'), type: 'line', data: internalData, smooth: true, lineStyle: { width: 2 }, itemStyle: { color: COLORS.internal } },
        ],
      };
    }

    const totalData = trend.points.map((p) => (p.total as number) ?? 0);
    const directionColor = COLORS[direction] ?? COLORS.total;

    return {
      tooltip: { trigger: 'axis' as const },
      grid: { left: 48, right: 16, top: 16, bottom: 32 },
      xAxis: { type: 'category' as const, data: xLabels, axisLabel: xAxisLabel, axisLine: { lineStyle: { color: axisColor } } },
      yAxis: {
        type: 'value' as const,
        ...(direction === 'receive' && !isHourly ? { min: 0, max: 14_000, interval: 3_500 } : {}),
        axisLabel: { color: axisColor, fontSize: 12 },
        splitLine: { lineStyle: { type: 'dashed', color: splitColor } },
      },
      series: [
        { name: t(`direction.${direction}`), type: 'line', data: totalData, smooth: true, areaStyle: { opacity: 0.25 }, lineStyle: { width: 2 }, itemStyle: { color: directionColor } },
      ],
    };
  }, [trend, direction, t, isDark]);

  return (
    <Card className="h-full min-w-0 rounded-xl bg-card shadow-sm backdrop-blur-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          {t(direction === 'all' ? 'chart.threeWayComparison' : `chart.${direction}Trend`)}
        </CardTitle>
      </CardHeader>
      <CardContent ref={chartContentRef} className="min-w-0 overflow-hidden">
        {isLoading ? (
          <Skeleton className="h-[296px] w-full rounded-lg" />
        ) : !option ? (
          <div className="flex h-[296px] items-center justify-center text-muted-foreground">
            {t('noData') as string}
          </div>
        ) : (
          <div className="min-w-0 w-full max-w-full overflow-hidden [&>div]:!w-full [&_canvas]:!w-full [&_canvas]:!max-w-full">
            <ReactECharts ref={chartRef} className="min-w-0 w-full max-w-full" option={option} style={{ height: 296, width: '100%' }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
