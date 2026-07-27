'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { KpiData } from '@/lib/api/security-overview';
import { Shield, ShieldAlert, ShieldCheck, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { blockRateBadgeVariant, blockRateTextClass } from './constants';

interface KpiCardsProps {
  data?: KpiData;
  isLoading: boolean;
}

function recallRateColor(rate: number): string {
  if (rate >= 95) return 'text-success';
  if (rate >= 80) return 'text-warning';
  return 'text-danger';
}

function pendingReviewColor(count: number): string {
  if (count <= 30) return 'text-success';
  if (count <= 50) return 'text-warning';
  return 'text-danger';
}

function formatDelta(delta: number | null): string {
  if (delta == null) return '';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

function deltaColor(delta: number | null | undefined, positiveIsGood: boolean | null): string {
  if (delta == null || positiveIsGood == null) return 'text-muted-foreground';
  if (delta > 0) return positiveIsGood ? 'text-emerald-500' : 'text-rose-500';
  if (delta < 0) return positiveIsGood ? 'text-rose-500' : 'text-emerald-500';
  return 'text-muted-foreground';
}

function TrendIcon({ delta, positiveIsGood }: { delta: number | null | undefined; positiveIsGood: boolean | null }) {
  if (delta == null || positiveIsGood == null) return null;
  if (delta > 0) return <TrendingUp className="h-3 w-3" />;
  if (delta < 0) return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

export function KpiCards({ data, isLoading }: KpiCardsProps) {
  const t = useTranslations('securityOverview.kpi');
  const vsPrevious = t('vsPrevious');

  const cards = [
    {
      key: 'totalFiltered',
      icon: Shield,
      value: data?.total_filtered,
      delta: data?.total_filtered_delta,
      format: (v: number) => v.toLocaleString(),
      accent: 'bg-info/10',
      iconColor: 'text-info',
      positiveIsGood: null as boolean | null,
    },
    {
      key: 'blockRate',
      icon: ShieldAlert,
      value: data?.block_rate,
      delta: data?.block_rate_delta,
      format: (v: number) => `${v.toFixed(1)}%`,
      accent: 'bg-danger-soft',
      iconColor: 'text-danger',
      positiveIsGood: true as boolean | null,
      colorFn: blockRateTextClass,
      badgeFn: blockRateBadgeVariant,
    },
    {
      key: 'recallRate',
      icon: ShieldCheck,
      value: data?.recall_rate,
      delta: data?.recall_rate_delta,
      format: (v: number) => `${v.toFixed(1)}%`,
      accent: 'bg-success/10',
      iconColor: 'text-success',
      positiveIsGood: true as boolean | null,
      colorFn: recallRateColor,
    },
    {
      key: 'pendingReview',
      icon: Clock,
      value: data?.pending_review,
      delta: data?.pending_review_delta,
      format: (v: number) => v.toLocaleString(),
      accent: 'bg-warning-soft',
      iconColor: 'text-warning',
      positiveIsGood: false as boolean | null,
      colorFn: pendingReviewColor,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const displayValue = data ? card.format(card.value ?? 0) : null;
        const deltaStr = data ? formatDelta(card.delta ?? null) : null;
        const valueColorClass = data && card.colorFn ? card.colorFn(card.value ?? 0) : '';

        return (
          <Card key={card.key} className="gap-4 overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-0">
              <div className="space-y-2">
                <CardTitle className="text-xs font-normal text-body">
                  {t(card.key)}
                </CardTitle>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className={`text-2xl font-bold tracking-tight ${valueColorClass}`}>
                    {displayValue}
                  </div>
                )}
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.accent}`}>
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2">
                {card.badgeFn && data ? (
                  <Badge variant={card.badgeFn(data.block_rate)} className="text-[10px]">
                    {data.block_rate >= 98 ? '●' : data.block_rate >= 95 ? '◐' : '○'}
                  </Badge>
                ) : null}
                {deltaStr && (
                  <span className={`flex items-center gap-0.5 text-xs tabular-nums ${deltaColor(card.delta, card.positiveIsGood)}`}>
                    <TrendIcon delta={card.delta} positiveIsGood={card.positiveIsGood} />
                    {deltaStr}
                  </span>
                )}
                {deltaStr && (
                  <span className="text-xs text-muted-foreground">{vsPrevious}</span>
                )}
                {!deltaStr && !card.badgeFn && (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
