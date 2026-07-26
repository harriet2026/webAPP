'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReactECharts from 'echarts-for-react';
import { Badge } from '@/components/ui/badge';
import type { DistItem } from '@/lib/api/link-attachment-security';
import { FILE_TYPE_COLORS } from './colors';

interface AttachmentTypePieCardProps {
  data?: DistItem[];
  isLoading: boolean;
}

export function AttachmentTypePieCard({ data, isLoading }: AttachmentTypePieCardProps) {
  const t = useTranslations('linkAttachmentSecurity');

  const option = useMemo(() => {
    // GT-11996: the backend zero-fills every canonical file-type bucket even
    // when there is no malicious attachment this period, so a bare length check
    // never trips. Treat "no positive count" as empty.
    if (!data || !data.some((d) => d.count > 0)) return null;

    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
      series: [{
        type: 'pie',
        radius: ['0%', '65%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        data: data.map((d) => ({
          name: t(`attachmentType.${d.key}` as Parameters<typeof t>[0]) ?? d.key,
          value: d.count,
          itemStyle: { color: FILE_TYPE_COLORS[d.key] ?? '#8C8C8C' },
        })),
      }],
    };
  }, [data, t]);

  return (
    <Card className="gap-0 rounded-lg border-0 bg-muted/40 py-0 shadow-none">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm font-medium">{t('side.attachmentTypeDistribution')}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <Skeleton className="h-36 w-full rounded-lg" />
        ) : !option ? (
          <div className="flex h-36 items-center justify-center text-muted-foreground">
            {t('empty.noMaliciousAttachment')}
          </div>
        ) : (
          <>
            <ReactECharts option={option} style={{ height: 144 }} />
            <div className="mt-2 flex flex-wrap gap-2">
              {data?.map((item) => (
                <Badge key={item.key} variant="outline" className="text-[11px]" style={{ borderColor: FILE_TYPE_COLORS[item.key] }}>
                  {item.key.toUpperCase()} {item.percent}%
                </Badge>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
