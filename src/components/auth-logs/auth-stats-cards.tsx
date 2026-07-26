'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ListChecks, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getAuthAttemptStats } from '@/lib/api/auth-attempts';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import { cn } from '@/lib/utils';

export function AuthStatsCards() {
  const t = useTranslations();
  const { apiRequest } = useApiRequest();
  const { effectiveTenantId } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ['auth-attempt-stats', effectiveTenantId],
    queryFn: () => getAuthAttemptStats(apiRequest),
  });

  const total = data?.total ?? 0;
  const success = data?.success ?? 0;
  const failed = data?.failed ?? 0;
  const successRate = total === 0 ? '0%' : (success / total * 100).toFixed(1) + '%';

  const stats = [
    {
      key: 'total',
      testId: 'auth-stats-total',
      label: t('authAttempts.stats.total'),
      value: total,
      Icon: ListChecks,
      tone: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50',
    },
    {
      key: 'successRate',
      testId: 'auth-stats-success-rate',
      label: t('authAttempts.stats.successRate'),
      value: successRate,
      Icon: ShieldCheck,
      tone: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50',
    },
    {
      key: 'failed',
      testId: 'auth-stats-failed',
      label: t('authAttempts.stats.failed'),
      value: failed,
      Icon: ShieldAlert,
      tone: 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/50',
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {stats.map((s) => (
        <Card key={s.key} size="sm" data-testid={s.testId}>
          <CardContent className="flex items-center gap-4">
            <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', s.tone)}>
              <s.Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="truncate text-sm text-muted-foreground">{s.label}</div>
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="font-heading text-2xl font-semibold leading-tight tabular-nums">{s.value}</div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
