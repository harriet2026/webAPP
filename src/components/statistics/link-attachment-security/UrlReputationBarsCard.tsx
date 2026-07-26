'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DistItem } from '@/lib/api/link-attachment-security';
import { REPUTATION_COLORS } from './colors';

interface UrlReputationBarsCardProps {
  data?: DistItem[];
  isLoading: boolean;
}

export function UrlReputationBarsCard({ data, isLoading }: UrlReputationBarsCardProps) {
  const t = useTranslations('linkAttachmentSecurity');

  const hasData = !!data?.some((item) => item.count > 0);

  return (
    <Card className="gap-0 rounded-lg border-0 bg-muted/40 py-0 shadow-none">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-sm font-medium">{t('side.urlReputationDistribution')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {isLoading ? (
          <Skeleton className="h-28 w-full rounded-lg" />
        ) : !hasData ? (
          <div className="flex h-28 items-center justify-center text-muted-foreground">
            {t('empty.noClicks')}
          </div>
        ) : (
          data?.map((item) => (
            <div key={item.key} className="flex items-center gap-2 text-xs">
              <span className="w-16 truncate">{t(`reputation.${item.key}` as Parameters<typeof t>[0])}</span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                <div className="h-full rounded" style={{ width: `${item.percent}%`, backgroundColor: REPUTATION_COLORS[item.key] ?? '#8C8C8C' }} />
              </div>
              <span className="w-12 text-right tabular-nums">{item.count}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
