'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, ShieldAlert, Clock, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { RuleEffectivenessKpi } from '@/lib/api/rule-effectiveness';

interface KpiCardsProps {
  data?: RuleEffectivenessKpi;
  isLoading: boolean;
}

function formatDelta(delta: number | null | undefined): string | null {
  if (delta == null) return null;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}`;
}

function TrendIcon({ delta }: { delta: number | null | undefined }) {
  if (delta == null) return null;
  if (delta > 0) return <TrendingUp className="h-3 w-3" />;
  if (delta < 0) return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

export function KpiCards({ data, isLoading }: KpiCardsProps) {
  const t = useTranslations('ruleEffectiveness.kpi');

  const cards = [
    {
      key: 'observingCount',
      icon: Eye,
      value: data?.observing_count,
      delta: data?.observing_count_delta,
      accent: 'bg-info/10',
      iconColor: 'text-info',
      valueColor: '',
    },
    {
      key: 'totalHits',
      icon: Eye,
      value: data?.total_hits,
      delta: data?.total_hits_delta,
      accent: 'bg-muted',
      iconColor: 'text-muted-foreground',
      valueColor: '',
    },
    {
      key: 'wouldBlockCount',
      icon: ShieldAlert,
      value: data?.would_block_count,
      delta: data?.would_block_count_delta,
      accent: 'bg-danger-soft',
      iconColor: 'text-danger',
      valueColor: 'text-danger',
    },
    {
      key: 'avgObservedDays',
      icon: Clock,
      value: data?.avg_observed_days,
      delta: null,
      accent: 'bg-muted',
      iconColor: 'text-muted-foreground',
      valueColor: '',
      unit: t('days'),
    },
    {
      key: 'pendingReviewCount',
      icon: AlertTriangle,
      value: data?.pending_review_count,
      delta: null,
      accent: 'bg-warning-soft',
      iconColor: 'text-warning',
      valueColor: 'text-warning',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5" data-testid="rule-effectiveness-kpi-cards">
      {cards.map((card) => {
        const Icon = card.icon;
        const deltaStr = formatDelta(card.delta);

        return (
          <Card key={card.key} data-testid={`rule-effectiveness-kpi-card-${card.key}`} className="gap-4 overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-0">
              <div className="space-y-2">
                <CardTitle className="text-xs font-normal text-body">{t(card.key)}</CardTitle>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className={`text-2xl font-bold tracking-tight ${card.valueColor}`}>
                    {card.value ?? 0}
                    {card.unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{card.unit}</span> : null}
                  </div>
                )}
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.accent}`}>
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2">
                {deltaStr ? (
                  <>
                    <span className="flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground">
                      <TrendIcon delta={card.delta} />
                      {deltaStr}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('vsPrevious')}</span>
                  </>
                ) : (
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
