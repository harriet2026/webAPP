'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MousePointer, ShieldX, Pointer } from 'lucide-react';
import type { ClickOverview } from '@/lib/api/link-attachment-security';

interface ClickOverviewCardProps {
  data?: ClickOverview;
  isLoading: boolean;
}

export function ClickOverviewCard({ data, isLoading }: ClickOverviewCardProps) {
  const t = useTranslations('linkAttachmentSecurity');

  const metrics = [
    {
      key: 'clickRate',
      icon: MousePointer,
      value: data ? `${data.click_rate.toFixed(1)}%` : null,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'from-blue-500/10 to-blue-500/5',
    },
    {
      key: 'threatClicks',
      icon: ShieldX,
      value: data?.threat_clicks?.toLocaleString() ?? null,
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'from-rose-500/10 to-rose-500/5',
    },
    {
      key: 'totalClicks',
      icon: Pointer,
      value: data?.total_clicks?.toLocaleString() ?? null,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'from-emerald-500/10 to-emerald-500/5',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('side.clickOverview')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : !data ? (
          <div className="h-[100px] flex items-center justify-center text-muted-foreground">
            {t('empty.noClicks')}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {metrics.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.key}
                  className={`flex flex-col items-center gap-2 rounded-xl bg-gradient-to-br ${m.bg} p-4`}
                >
                  <Icon className={`h-5 w-5 ${m.color}`} />
                  <div className={`text-xl font-semibold tabular-nums ${m.color}`}>{m.value}</div>
                  <div className="text-xs text-muted-foreground">
                    {t(`side.clickOverviewMetrics.${m.key}`)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
