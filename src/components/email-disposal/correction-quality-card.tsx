'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getCorrectionQuality } from '@/lib/api/statistics';
import { useApiRequest } from '@/lib/api/client';

interface CorrectionQualityCardProps {
  startDate: string;
  endDate: string;
}

function rateColor(rate: number): string {
  if (rate <= 1) return 'text-emerald-600 dark:text-emerald-400';
  if (rate <= 5) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

export function CorrectionQualityCard({ startDate, endDate }: CorrectionQualityCardProps) {
  const t = useTranslations('emailDisposal.correctionQuality');
  const { apiRequest } = useApiRequest();

  const { data, isLoading } = useQuery({
    queryKey: ['correction-quality', startDate, endDate],
    queryFn: () => getCorrectionQuality(startDate, endDate, apiRequest),
    enabled: !!startDate && !!endDate,
    staleTime: 60 * 1000,
  });

  const fpRate = data?.false_positive_rate ?? 0;
  const fnRate = data?.false_negative_rate ?? 0;
  const totalCorrected = data?.total_corrected ?? 0;
  const classifiedTotal = data?.classified_total ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                <ShieldAlert className="h-5 w-5 text-amber-600" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{t('falsePositiveRate')}</div>
                <div className={`text-2xl font-bold tabular-nums ${rateColor(fpRate)}`}>
                  {fpRate.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('countOf', { count: data?.false_positive_count ?? 0, total: classifiedTotal })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50">
                <ShieldCheck className="h-5 w-5 text-rose-600" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{t('falseNegativeRate')}</div>
                <div className={`text-2xl font-bold tabular-nums ${rateColor(fnRate)}`}>
                  {fnRate.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('countOf', { count: data?.false_negative_count ?? 0, total: classifiedTotal })}
                </div>
              </div>
            </div>

            <div className="md:col-span-2 text-xs text-muted-foreground">
              {t('summary', { corrected: totalCorrected, classified: classifiedTotal })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
