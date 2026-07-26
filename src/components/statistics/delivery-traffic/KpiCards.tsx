'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { KpiData, Direction } from '@/lib/api/delivery-traffic';
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';

interface KpiCardsProps {
  data?: KpiData;
  direction: Direction;
  isLoading: boolean;
}

function formatPercent(v?: number): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

function formatNum(v?: number): string {
  if (v == null) return '—';
  return v.toLocaleString();
}

function formatLatency(v?: number): string {
  if (v == null) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${v.toFixed(0)}ms`;
}

interface CardDef {
  key: string;
  labelKey?: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  getValue: (d: KpiData) => string;
  color: string;
}

const CARDS_BY_DIRECTION: Record<Direction, CardDef[]> = {
  all: [
    { key: 'inboundTotal', icon: ArrowDownToLine, getValue: (d) => formatNum(d.inbound_total), color: '#1890FF' },
    { key: 'outboundTotal', icon: ArrowUpFromLine, getValue: (d) => formatNum(d.outbound_total), color: '#52C41A' },
    { key: 'internalTotal', icon: RefreshCw, getValue: (d) => formatNum(d.internal_total), color: '#722ED1' },
    { key: 'totalSuccessRate', getValue: (d) => formatPercent(d.total_success_rate), color: '#10b981' },
    { key: 'queueBacklog', getValue: (d) => formatNum(d.queue_backlog), color: '#f59e0b' },
  ],
  receive: [
    { key: 'total', labelKey: 'inboundTotal', icon: ArrowDownToLine, getValue: (d) => formatNum(d.total), color: '#1890FF' },
    { key: 'successRate', labelKey: 'inboundSuccessRate', getValue: (d) => formatPercent(d.success_rate), color: '#10b981' },
    { key: 'bounceRate', labelKey: 'inboundBounceRate', getValue: (d) => formatPercent(d.bounce_rate), color: '#ef4444' },
    { key: 'avgLatencyMs', labelKey: 'avgInboundLatency', getValue: (d) => formatLatency(d.avg_latency_ms), color: '#3b82f6' },
    { key: 'sidelineQueue', labelKey: 'antispamQueue', getValue: (d) => formatNum(d.sideline_queue), color: '#f59e0b' },
  ],
  send: [
    { key: 'total', labelKey: 'outboundTotal', icon: ArrowUpFromLine, getValue: (d) => formatNum(d.total), color: '#52C41A' },
    { key: 'successRate', labelKey: 'outboundSuccessRate', getValue: (d) => formatPercent(d.success_rate), color: '#10b981' },
    { key: 'bounceRate', labelKey: 'outboundBounceRate', getValue: (d) => formatPercent(d.bounce_rate), color: '#ef4444' },
    { key: 'latencyP99', labelKey: 'outboundLatencyP99', getValue: (d) => formatLatency(d.latency_p99_ms), color: '#f59e0b' },
    { key: 'outboundQueueBacklog', getValue: (d) => formatNum(d.queue_backlog_approx), color: '#ef4444' },
  ],
  internal: [
    { key: 'total', labelKey: 'internalTotal', icon: RefreshCw, getValue: (d) => formatNum(d.total), color: '#722ED1' },
    { key: 'successRate', labelKey: 'internalSuccessRate', getValue: (d) => formatPercent(d.success_rate), color: '#10b981' },
    { key: 'threatRate', labelKey: 'internalThreatRate', getValue: (d) => formatPercent(d.threat_rate), color: '#ef4444' },
    { key: 'avgLatencyMs', labelKey: 'avgInternalLatency', getValue: (d) => formatLatency(d.avg_latency_ms), color: '#10b981' },
    { key: 'internalThreatCount', getValue: (d) => formatNum(d.internal_threat_count), color: '#f59e0b' },
  ],
};

export function KpiCards({ data, direction, isLoading }: KpiCardsProps) {
  const t = useTranslations('deliveryTraffic.kpi');

  const cards = CARDS_BY_DIRECTION[direction] ?? CARDS_BY_DIRECTION.all;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5" data-testid="delivery-kpi-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        const displayValue = data ? card.getValue(data) : null;
        const trend = data?.trends?.[card.key];

        return (
          <Card key={card.key} className="gap-0 rounded-xl bg-card shadow-sm backdrop-blur-none">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">{t(card.labelKey ?? card.key)}</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <p className="text-2xl font-bold tabular-nums" style={{ color: card.color }}>
                      {displayValue}
                    </p>
                  )}
                  {trend !== undefined && (
                    <div className={`mt-1 flex items-center gap-1 text-xs ${trend >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      <span>{trend >= 0 ? '+' : ''}{trend}%</span>
                    </div>
                  )}
                </div>
                {Icon && <Icon className="h-5 w-5" style={{ color: card.color }} />}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
