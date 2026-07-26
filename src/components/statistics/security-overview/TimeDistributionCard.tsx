'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeDistribution } from './hooks/useSecurityOverview';
import type { Direction } from '@/lib/api/security-overview';
import { Clock } from 'lucide-react';
import { SmartSummaryBadge } from '@/components/shared/smart-summary-badge';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TimeDistributionCardProps {
  startDate: string;
  endDate: string;
  direction: Direction;
  scopeTenantId: number | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const THREAT_FILTERS = [
  'all',
  'normal', 'subscription', 'advertising', 'spam',
  'harmful', 'suspicious', 'sensitive', 'spoofing',
  'phishing', 'virus', 'account_compromised',
];
const DAILY_STACK = [
  { key: 'normal',              color: '#9CA3AF' },
  { key: 'subscription',        color: '#06B6D4' },
  { key: 'advertising',         color: '#8B5CF6' },
  { key: 'spam',                color: '#3B82F6' },
  { key: 'harmful',             color: '#F97316' },
  { key: 'suspicious',          color: '#EAB308' },
  { key: 'sensitive',           color: '#EC4899' },
  { key: 'spoofing',            color: '#F59E0B' },
  { key: 'phishing',            color: '#EF4444' },
  { key: 'virus',               color: '#7C3AED' },
  { key: 'account_compromised', color: '#B91C1C' },
] as const;

export function TimeDistributionCard({ startDate, endDate, direction, scopeTenantId }: TimeDistributionCardProps) {
  const t = useTranslations('securityOverview.time');
  const tRoot = useTranslations('securityOverview');
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const [threatFilter, setThreatFilter] = useState('all');

  const { data, isLoading } = useTimeDistribution({
    startDate,
    endDate,
    direction,
    threatFilter,
    mode,
    scopeTenantId,
  });

  const buckets = useMemo(() => data?.buckets ?? [], [data?.buckets]);
  const hourly = useMemo(() => data?.hourly ?? [], [data?.hourly]);
  const weeklyMatrix = useMemo(() => data?.weekly_matrix ?? [], [data?.weekly_matrix]);

  const hasData = mode === 'weekly' ? weeklyMatrix.length > 0 : buckets.length > 0;
  const maxTotal = mode === 'weekly'
    ? Math.max(...weeklyMatrix.map((c) => c.value), 1)
    : Math.max(...buckets.map((b) => b.attack_count), 1);

  // GT-11983 / GT-11932: the backend has always computed and returned a TOP4
  // `peak_hours` (spec §5.3 defines the field; storage/security_overview.go:674
  // populates it), and the `time.peakTitle` i18n key has existed unused in all
  // four locales — but this component never read any of it. It hand-rolled a
  // single-peak badge from `buckets` instead, which is why the card showed only
  // "峰值时段: 10:00 · 280" and no ranking.
  //
  // NOTE peak_hours is an HOUR-OF-DAY aggregate (hod) summed across the whole
  // selected date range — "13:00" means the 13:00-14:00 slot across every day in
  // the range, not one timestamp. That is why there is no 「查看明细」 drill
  // button here: mail-log search only takes date-granularity start_date/end_date
  // (EmailLogSearchParams), so it cannot express "hour-of-day = 13 across N
  // days". Shipping a button that quietly filtered the wrong rows would be worse
  // than shipping none; the drill needs an hour-of-day filter on mail-log search
  // first (tracked separately).
  // 后端把 24 个小时槽位**预填成 0** 再排序取前 4（storage/security_overview.go:
  // hourly[i] = {hour:i, total:0} → sortByTotalDesc → topN[0:4]），所以即使一封邮件
  // 都没有，peak_hours 依然会返回 4 条 count=0 的记录。若不过滤，空库上会渲染出
  // 「攻击高峰：01:00-02:00（共 0 封）」这种**凭空捏造的高峰** —— 比不显示更糟。
  const peakHours = (mode === 'daily' ? (data?.peak_hours ?? []) : []).filter((p) => p.count > 0);

  // Prototype copy: "本周攻击高峰: 13:00-14:00 (共 100 封)" — the old format was
  // "峰值时段: 10:00 · 280", which stated neither the hour RANGE nor the unit.
  const hourRange = (hour: number) =>
    `${String(hour).padStart(2, '0')}:00-${String((hour + 1) % 24).padStart(2, '0')}:00`;

  const peakCell = mode === 'weekly' && weeklyMatrix.length > 0
    ? weeklyMatrix.reduce((a, c) => (c.value > a.value ? c : a), weeklyMatrix[0])
    : null;
  const topPeak = peakHours[0] ?? null;
  const peakText = topPeak
    ? t('peakSummary', { range: hourRange(topPeak.hour), count: topPeak.count.toLocaleString() })
    : peakCell
      ? `${t('peakLabel')}: ${DAYS[peakCell.day]} ${String(peakCell.hour).padStart(2, '0')}:00 · ${peakCell.value.toLocaleString()}`
      : null;

  const chartOption = useMemo<EChartsOption | null>(() => {
    if (!hasData) return null;

    const axisLabel = { color: '#9ca3af', fontSize: 10 };
    const splitLine = { lineStyle: { color: 'rgba(148, 163, 184, 0.22)', type: 'dashed' as const } };
    const tooltip = {
      trigger: 'axis' as const,
      confine: true,
      backgroundColor: '#1f2937',
      borderWidth: 0,
      textStyle: { color: '#f9fafb', fontSize: 12 },
      axisPointer: { type: 'shadow' as const },
    };

    if (mode === 'weekly') {
      return {
        animationDurationUpdate: 200,
        tooltip: {
          trigger: 'item',
          confine: true,
          backgroundColor: '#1f2937',
          borderWidth: 0,
          textStyle: { color: '#f9fafb', fontSize: 12 },
          formatter: (params: unknown) => {
            const value = (params as { value?: [number, number, number] }).value;
            if (!value) return '';
            return `${DAYS[value[1]]} ${String(value[0]).padStart(2, '0')}:00<br/>${value[2].toLocaleString()}`;
          },
        },
        grid: { left: 42, right: 12, top: 8, bottom: 46 },
        xAxis: {
          type: 'category',
          data: Array.from({ length: 24 }, (_, hour) => hour),
          axisLabel: { ...axisLabel, interval: 2 },
          axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
          axisTick: { show: false },
          splitArea: { show: true, areaStyle: { color: ['transparent'] } },
        },
        yAxis: {
          type: 'category',
          data: DAYS,
          inverse: true,
          axisLabel,
          axisLine: { show: false },
          axisTick: { show: false },
          splitArea: { show: true, areaStyle: { color: ['transparent'] } },
        },
        visualMap: {
          min: 0,
          max: maxTotal,
          calculable: false,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          itemWidth: 10,
          itemHeight: 90,
          text: [t('high'), t('low')],
          textGap: 6,
          textStyle: axisLabel,
          inRange: { color: ['#f3f4f6', '#fef3c7', '#fed7aa', '#fdba74', '#f87171'] },
        },
        series: [{
          name: t('title'),
          type: 'heatmap',
          data: weeklyMatrix.map((cell) => [cell.hour, cell.day, cell.value]),
          itemStyle: { borderColor: '#ffffff', borderWidth: 2, borderRadius: 2 },
          emphasis: { itemStyle: { borderColor: '#2563eb', borderWidth: 1 } },
        }],
      };
    }

    const hourlyByHour = new Map(hourly.map((item) => [item.hour, item]));
    const stackData = buckets.map((bucket, index) => {
      const parsedHour = Number.parseInt(bucket.label.slice(0, 2), 10);
      return hourlyByHour.get(Number.isFinite(parsedHour) ? parsedHour : index) ?? hourly[index];
    });

    return {
      animationDurationUpdate: 200,
      tooltip,
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: axisLabel,
      },
      grid: { left: 42, right: 12, top: 8, bottom: 48 },
      xAxis: {
        type: 'category',
        data: buckets.map((bucket) => bucket.label.slice(0, 2)),
        axisLabel: { ...axisLabel, interval: 1 },
        axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine,
      },
      series: DAILY_STACK.map((segment) => ({
        name: tRoot(`emailTypes.${segment.key}`),
        type: 'bar',
        stack: 'threats',
        barMaxWidth: 18,
        itemStyle: { color: segment.color },
        emphasis: { focus: 'series' },
        data: stackData.map((item) => Number(item?.[segment.key] ?? 0)),
      })),
    };
  }, [buckets, hasData, hourly, maxTotal, mode, t, tRoot, weeklyMatrix]);

  return (
    <Card data-testid="time-distribution-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t('title')}
          </CardTitle>
          {peakText && !isLoading && (
            <SmartSummaryBadge>{peakText}</SmartSummaryBadge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={threatFilter} onValueChange={(value) => setThreatFilter(value ?? 'all')}>
            <SelectTrigger size="sm" className="w-28" aria-label={tRoot('geo.threatFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THREAT_FILTERS.map((filter) => (
                <SelectItem key={filter} value={filter}>
                  {filter === 'all' ? tRoot('filter.direction.all') : tRoot(`emailTypes.${filter}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            size="sm"
            className="shrink-0"
            options={[
              { value: 'daily', label: t('daily') },
              { value: 'weekly', label: t('weekly') },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[250px] w-full rounded-lg" />
        ) : !hasData ? (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">—</div>
        ) : (
          <div>
            {chartOption && (
              <ReactECharts
                option={chartOption}
                notMerge
                style={{ height: 230, width: '100%' }}
                data-testid="time-distribution-echarts"
              />
            )}

            {mode === 'daily' && peakHours.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t('peakTitle')}</p>
                <ol className="grid gap-2 sm:grid-cols-2" data-testid="peak-hours-list">
                  {peakHours.map((p, idx) => (
                    <li
                      key={p.hour}
                      className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[11px] font-semibold text-primary">
                        {idx + 1}
                      </span>
                      <span className="font-mono text-xs tabular-nums">{hourRange(p.hour)}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {t('peakCount', { count: p.count.toLocaleString() })}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
