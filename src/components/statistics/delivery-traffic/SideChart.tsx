'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReactECharts from 'echarts-for-react';
import type { DistributionItem, Direction } from '@/lib/api/delivery-traffic';
import { useRouter } from '@/i18n/navigation';
import { useDarkMode } from './useDarkMode';

interface SideChartProps {
  distribution?: DistributionItem[];
  direction: Direction;
  isLoading: boolean;
}

const PIE_COLORS = ['#3b82f6', '#22c55e', '#8b5cf6'];
const BAR_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#22c55e', '#6b7280'];

export function SideChart({ distribution, direction, isLoading }: SideChartProps) {
  const t = useTranslations('deliveryTraffic');
  const router = useRouter();
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
    // Treat an all-zero distribution as empty: the backend always emits three
    // zero-value items for direction=all (receive/send/internal) and direction=
    // internal (spam/phishing/virus), so the length check alone never fires when
    // there is simply no traffic — ECharts would then draw a blank donut (a ring
    // with total=0 renders nothing but the legend), which reads as a broken chart
    // instead of a clean "暂无数据" (matches TrendChart's empty-state). (GT-11988)
    const total = distribution?.reduce((sum, d) => sum + (Number(d.value) || 0), 0) ?? 0;
    if (!distribution || distribution.length === 0 || total === 0) return null;

    const textColor = isDark ? '#d1d5db' : '#4b5563';
    const axisColor = isDark ? '#9ca3af' : '#4b5563';
    const splitColor = isDark ? '#374151' : '#e5e7eb';
    const pieBorderColor = isDark ? '#111827' : '#ffffff';

    if (direction === 'all') {
      return {
        tooltip: { trigger: 'item' as const },
        series: [{
          type: 'pie',
          radius: [50, 80],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: pieBorderColor, borderWidth: 2 },
          label: {
            show: true,
            formatter: (params: { name: string; percent: number }) => `${params.name} ${Math.round(params.percent)}%`,
            color: textColor,
            fontSize: 12,
            overflow: 'none',
            textBorderWidth: 0,
          },
          labelLine: { show: true, length: 4, length2: 2 },
          labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
          emphasis: { scale: true },
          data: distribution.map((d, i) => ({
            ...d,
            name: t(`direction.${d.name}` as Parameters<typeof t>[0]) ?? d.name,
            itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] },
          })),
        }],
      };
    }

    if (direction === 'internal') {
      return {
        tooltip: { trigger: 'item' as const },
        legend: { bottom: 0, textStyle: { color: textColor } },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 6, borderColor: pieBorderColor, borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
            data: distribution.map((d, i) => ({ ...d, name: t(`internalThreats.${d.name}` as Parameters<typeof t>[0]), itemStyle: { color: BAR_COLORS[i % BAR_COLORS.length] } })),
        }],
      };
    }

    return {
      tooltip: { trigger: 'axis' as const },
      grid: { left: 80, right: 16, top: 16, bottom: 32 },
      xAxis: { type: 'value' as const, axisLabel: { color: axisColor }, splitLine: { lineStyle: { color: splitColor } } },
      yAxis: { type: 'category' as const, axisLabel: { color: axisColor }, data: distribution.map((d) => direction === 'receive' ? t(`bounceReasons.${d.name}` as Parameters<typeof t>[0]) : d.name) },
      series: [{
        type: 'bar',
        data: distribution.map((d, i) => ({ value: d.value, itemStyle: { color: BAR_COLORS[i % BAR_COLORS.length] } })),
        barWidth: 20,
      }],
    };
  }, [distribution, direction, t, isDark]);

  const titleKey = direction === 'all' ? 'chart.trafficDistribution'
    : direction === 'internal' ? 'chart.threatDistribution'
    : direction === 'send' ? 'chart.topBounceDomains'
    : 'chart.receiveBounceReasons';

  const onEvents = direction === 'send' ? {
    click: (params: { name?: string }) => {
      if (params.name) router.push(`/logs/email?recipient_domain=${encodeURIComponent(params.name)}`);
    },
  } : undefined;

  return (
    <Card className="h-full min-w-0 rounded-xl bg-card shadow-sm backdrop-blur-none">
      <CardHeader>
        <CardTitle className="text-base">{t(titleKey)}</CardTitle>
      </CardHeader>
      <CardContent ref={chartContentRef} className="min-w-0 overflow-hidden">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : !option ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            {t('noData') as string}
          </div>
        ) : (
          <div className="min-w-0 w-full max-w-full overflow-hidden [&>div]:!w-full [&_canvas]:!w-full [&_canvas]:!max-w-full">
            <ReactECharts ref={chartRef} className="min-w-0 w-full max-w-full" option={option} style={{ height: 256, width: '100%' }} onEvents={onEvents} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
