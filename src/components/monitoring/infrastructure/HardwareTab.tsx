'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, DegradedBanner } from './StateBanners';
import { useHardware } from './hooks';
import { degradeMessage } from '@/lib/monitoring/degrade';
import type { TimeRange } from '@/types/monitoring';

interface HardwareTabProps {
  node: string;
  range: TimeRange;
}

export function HardwareTab({ node, range }: HardwareTabProps) {
  const t = useTranslations('infrastructure');
  const locale = useLocale();
  const { data, isLoading, isError } = useHardware(node, range);

  const chartOption = useMemo(() => {
    const cpuPts = data?.cpu_mem?.points ?? [];
    const memPts = data?.mem_trend?.points ?? [];
    if (!cpuPts.length && !memPts.length) return null;
    const ts = (cpuPts.length >= memPts.length ? cpuPts : memPts).map((p) => p.ts);
    const cpuMap = new Map(cpuPts.map((p) => [p.ts, p.value]));
    const memMap = new Map(memPts.map((p) => [p.ts, p.value]));
    const timeFormatter = new Intl.DateTimeFormat(locale, range === '7d'
      ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['CPU', t('hardware.memory')], top: 0 },
      grid: { left: 48, right: 16, top: 36, bottom: 32 },
      xAxis: {
        type: 'category' as const,
        data: ts,
        axisLabel: {
          showMaxLabel: true,
          formatter: (value: string) => {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? value : timeFormatter.format(date);
          },
        },
      },
      yAxis: { type: 'value' as const, min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
      series: [
        {
          name: 'CPU',
          type: 'line',
          data: ts.map((t) => cpuMap.get(t) ?? null),
          smooth: true,
          lineStyle: { width: 2 },
          itemStyle: { color: '#3b82f6' },
          areaStyle: { opacity: 0.1 },
        },
        {
          name: t('hardware.memory'),
          type: 'line',
          data: ts.map((t) => memMap.get(t) ?? null),
          smooth: true,
          lineStyle: { width: 2 },
          itemStyle: { color: '#10b981' },
          areaStyle: { opacity: 0.1 },
        },
      ],
    };
  }, [data, locale, range, t]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px] w-full rounded-lg" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return <DegradedBanner message={t('agentOffline')} />;
  }

  const netTop5 = data?.network_top5 ?? [];

  return (
    <div className="space-y-4" data-testid="monitor-infrastructure-hardware">
      {data?.degraded && (
        <DegradedBanner message={degradeMessage(data.degraded_code, t)} />
      )}
      <Card data-testid="monitor-infrastructure-cpu-memory-card">
        <CardHeader>
          <CardTitle>{t('hardware.cpuMem')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!chartOption ? (
            <EmptyState message={t('noData')} />
          ) : (
            <ReactECharts option={chartOption} style={{ height: 300 }} />
          )}
        </CardContent>
      </Card>

      <Card data-testid="monitor-infrastructure-network-card">
        <CardHeader>
          <CardTitle>{t('hardware.netTop5')}</CardTitle>
        </CardHeader>
        <CardContent>
          {netTop5.length === 0 ? (
            <EmptyState message={t('noData')} />
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[900px]" data-testid="monitor-infrastructure-network-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead className="text-right">{t('hardware.rxMbps')}</TableHead>
                  <TableHead className="text-right">{t('hardware.txMbps')}</TableHead>
                  <TableHead className="text-right">{t('hardware.rxPps')}</TableHead>
                  <TableHead className="text-right">{t('hardware.txPps')}</TableHead>
                  <TableHead className="text-right">{t('hardware.dropRate')}</TableHead>
                  <TableHead className="text-right">{t('hardware.retransmitRate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {netTop5.slice(0, 5).map((iface) => (
                  <TableRow key={iface.device} data-testid={`monitor-infrastructure-network-row-${iface.device}`}>
                    <TableCell className="font-mono">{iface.device}</TableCell>
                    <TableCell className="text-right">{formatMbps(iface.rx_mbps, locale)}</TableCell>
                    <TableCell className="text-right">{formatMbps(iface.tx_mbps, locale)}</TableCell>
                    <TableCell className="text-right">{formatPps(iface.rx_pps, locale)}</TableCell>
                    <TableCell className="text-right">{formatPps(iface.tx_pps, locale)}</TableCell>
                    <TableCell className="text-right">{formatPercent(iface.drop_rate, locale)}</TableCell>
                    <TableCell className="text-right">{formatPercent(iface.retransmit_rate, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatPps(value: number | null, locale: string) {
  return value == null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function formatMbps(value: number | null, locale: string) {
  return value == null ? '—' : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
}

function formatPercent(value: number | null, locale: string) {
  return value == null ? '—' : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}
