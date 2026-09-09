'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { POLICY_MODULES, moduleColor } from './constants';
import type { RuleEffectivenessTrendPoint } from '@/lib/api/rule-effectiveness';

interface TrendChartCardProps {
  trend?: RuleEffectivenessTrendPoint[];
  isLoading: boolean;
  onPointClick?: (p: { date: string }) => void;
}

export function TrendChartCard({ trend, isLoading, onPointClick }: TrendChartCardProps) {
  const t = useTranslations('ruleEffectiveness');
  const tModule = useTranslations('ruleEffectiveness.filter.modules');

  const echartsOption = useMemo(() => {
    if (!trend || trend.length === 0) return null;
    const dates = trend.map((p) => p.date);
    return {
      grid: { left: 48, right: 16, top: 40, bottom: 32 },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: POLICY_MODULES.map((m) => tModule(m)) },
      xAxis: { type: 'category', data: dates, boundaryGap: false },
      yAxis: { type: 'value', minInterval: 1 },
      series: POLICY_MODULES.map((m) => ({
        name: tModule(m),
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: trend.map((p) => p[m]),
        itemStyle: { color: moduleColor(m) },
        lineStyle: { color: moduleColor(m) },
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
