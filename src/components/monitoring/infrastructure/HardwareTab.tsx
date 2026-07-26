'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
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
  const { data, isLoading, isError } = useHardware(node, range);

  const chartOption = useMemo(() => {
    const cpuPts = data?.cpu_mem?.points ?? [];
    const memPts = data?.mem_trend?.points ?? [];
    if (!cpuPts.length && !memPts.length) return null;
    const ts = (cpuPts.length >= memPts.length ? cpuPts : memPts).map((p) => p.ts);
    const cpuMap = new Map(cpuPts.map((p) => [p.ts, p.value]));
    const memMap = new Map(memPts.map((p) => [p.ts, p.value]));
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['CPU', t('hardware.memory')], top: 0 },
      grid: { left: 48, right: 16, top: 36, bottom: 32 },
      xAxis: { type: 'category' as const, data: ts, axisLabel: { showMaxLabel: true } },
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
  }, [data, t]);

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
            <Table data-testid="monitor-infrastructure-network-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead className="text-right">{t('hardware.rxPps')}</TableHead>
                  <TableHead className="text-right">{t('hardware.txPps')}</TableHead>
                  <TableHead className="text-right">{t('hardware.dropRate')}</TableHead>
                  <TableHead className="text-right">{t('hardware.retransmitRate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {netTop5.map((iface) => (
                  <TableRow key={iface.device} data-testid={`monitor-infrastructure-network-row-${iface.device}`}>
                    <TableCell className="font-mono">{iface.device}</TableCell>
                    <TableCell className="text-right">{iface.rx_pps}</TableCell>
                    <TableCell className="text-right">{iface.tx_pps}</TableCell>
                    <TableCell className="text-right">{iface.drop_rate}</TableCell>
                    <TableCell className="text-right">{iface.retransmit_rate}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
