'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TREND_SERIES } from './constants';
import type { RuleEffectivenessTrendPoint } from '@/lib/api/rule-effectiveness';

interface TrendChartCardProps {
  trend?: RuleEffectivenessTrendPoint[];
  isLoading: boolean;
  onPointClick?: (p: { date: string }) => void;
}

export function TrendChartCard({ trend, isLoading, onPointClick }: TrendChartCardProps) {
  const t = useTranslations('ruleEffectiveness');
  const tModule = useTranslations('ruleEffectiveness.filter.modules');

  // 相似检测的两条策略（相似邮件检测/相同主题检测）各占一条独立的趋势线，
  // 不与身份认证/钓鱼检测那样按模块合并，因为两条策略的命中特征完全不同，
  // 合并展示会让用户看不出各自的真实变化趋势。
  const echartsOption = useMemo(() => {
    if (!trend || trend.length === 0) return null;
    const dates = trend.map((p) => p.date);
    return {
      grid: { left: 48, right: 16, top: 40, bottom: 32 },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: TREND_SERIES.map((s) => tModule(s.labelKey)) },
      xAxis: { type: 'category', data: dates, boundaryGap: false },
      yAxis: { type: 'value', minInterval: 1 },
      series: TREND_SERIES.map((s) => ({
        name: tModule(s.labelKey),
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: trend.map((p) => p[s.key]),
        itemStyle: { color: s.color },
        lineStyle: { color: s.color },
      })),
    };
  }, [trend, tModule]);

  return (
    <Card data-testid="rule-effectiveness-trend-card">
      <CardHeader>
        <CardTitle className="text-base">{t('trendCardTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : echartsOption ? (
          <ReactECharts
            option={echartsOption}
            style={{ height: 280 }}
            onEvents={{
              click: (params: { name: string }) => onPointClick?.({ date: params.name }),
            }}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            {t('noData')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
