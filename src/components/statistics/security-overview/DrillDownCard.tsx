'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDrillDown } from './hooks/useSecurityOverview';
import type { Direction, DrillDimension, ViewBy } from '@/lib/api/security-overview';

const DIMENSIONS: DrillDimension[] = ['action', 'sender_domain', 'client_ip', 'matched_rule'];

interface Props {
  point: { date: string; series: string };
  viewBy: ViewBy;
  direction: Direction;
  scopeTenantId: number | null;
  onClose: () => void;
}

export function DrillDownCard({ point, viewBy, direction, scopeTenantId, onClose }: Props) {
  const t = useTranslations('securityOverview.drillDown');
  const [dimension, setDimension] = useState<DrillDimension>('action');

  const { data, isLoading } = useDrillDown(
    { date: point.date, direction, viewBy, series: point.series, dimension, limit: 10 },
    scopeTenantId,
  );

  const items = data?.items ?? [];
  const max = Math.max(...items.map((x) => x.count), 1);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t('title')} · {point.date}</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={dimension} onValueChange={(v) => setDimension(v as DrillDimension)}>
            <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DIMENSIONS.map((d) => (
                <SelectItem key={d} value={d}>{t(`dimension.${d}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : items.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground">{t('empty')}</div>
        ) : (
          <div className={dimension === 'action' ? 'grid gap-5 md:grid-cols-[240px_1fr]' : 'space-y-2'}>
            {dimension === 'action' && (
              <ReactECharts
                option={{
                  tooltip: { trigger: 'item' },
                  series: [{
                    type: 'pie',
                    radius: ['48%', '76%'],
                    label: { show: false },
                    data: items.map((row, index) => ({ name: row.name, value: row.count, itemStyle: { color: ['#EF4444', '#F59E0B', '#8B5CF6', '#DC2626', '#0EA5E9'][index] } })),
                  }],
                }}
                style={{ height: 210 }}
                notMerge
              />
            )}
            <div className="space-y-2">
            {items.map((row) => (
              <div key={row.name} className="flex items-center gap-3 text-sm">
                <span className="w-48 truncate" title={row.name}>{row.name}</span>
                <div className="h-2 flex-1 rounded bg-muted">
                  <div className="h-2 rounded bg-primary" style={{ width: `${(row.count / max) * 100}%` }} />
                </div>
                <span className="w-16 text-right tabular-nums">{row.count.toLocaleString()}</span>
              </div>
            ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
