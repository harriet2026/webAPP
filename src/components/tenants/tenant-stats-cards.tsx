'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Building2, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getTenantStats } from '@/lib/api/tenants';
import { cn } from '@/lib/utils';

export function TenantStatsCards() {
  const t = useTranslations('tenants');

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-stats'],
    queryFn: getTenantStats,
  });

  const stats = [
    {
      key: 'total',
      label: t('stats.total'),
      value: data?.total ?? 0,
      Icon: Building2,
      tone: 'text-foreground',
    },
    {
      key: 'active',
      label: t('stats.active'),
      value: data?.active ?? 0,
      Icon: CheckCircle2,
      tone: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'pending',
      label: t('stats.pending'),
      value: data?.pending ?? 0,
      Icon: Clock,
      tone: 'text-sky-600 dark:text-sky-400',
    },
    {
      key: 'awaitingRouting',
      label: t('stats.awaitingRouting'),
      value: data?.awaitingRouting ?? 0,
      Icon: AlertCircle,
      // warning color — operators should notice tenants stuck awaiting routing.
      tone: 'text-amber-600 dark:text-amber-400',
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.key} size="sm">
          <CardContent className="flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="font-heading text-2xl font-semibold tabular-nums">{s.value}</div>
              )}
            </div>
            <s.Icon className={cn('h-7 w-7 shrink-0', s.tone)} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
