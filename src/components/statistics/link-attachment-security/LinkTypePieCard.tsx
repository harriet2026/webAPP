'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReactECharts from 'echarts-for-react';
import { Badge } from '@/components/ui/badge';
import type { DistItem } from '@/lib/api/link-attachment-security';
import { LINK_TYPE_COLORS } from './colors';

interface LinkTypePieCardProps {
  data?: DistItem[];
  isLoading: boolean;
}

export function LinkTypePieCard({ data, isLoading }: LinkTypePieCardProps) {
  const t = useTranslations('linkAttachmentSecurity');

  const option = useMemo(() => {
    // GT-11996: the backend zero-fills every canonical link type (5 entries,
    // all count 0) when there is no malicious link this period, so a bare
    // length check never trips. Treat "no positive count" as empty, otherwise
    // ECharts renders a pie with no visible slices and looks broken.
    if (!data || !data.some((d) => d.count > 0)) return null;

    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
      series: [{
        type: 'pie',
        radius: [30, 55],
        avoidLabelOverlap: false,
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        data: data.map((d) => ({
          name: t(`linkType.${d.key}` as Parameters<typeof t>[0]) ?? d.key,
          value: d.count,
          itemStyle: { color: LINK_TYPE_COLORS[d.key] ?? '#8C8C8C' },
        })),
      }],
    };
  }, [data, t]);

  return (
    <Card className="gap-0 rounded-lg border-0 bg-muted/40 py-0 shadow-none">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm font-medium">{t('side.linkTypeDistribution')}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <Skeleton className="h-36 w-full rounded-lg" />
        ) : !option ? (
          <div className="flex h-36 items-center justify-center text-muted-foreground">
            {t('empty.noMaliciousLink')}
          </div>
        ) : (
          <>
            <ReactECharts option={option} style={{ height: 144 }} />
            <div className="mt-2 flex flex-wrap gap-2">
              {data?.map((item) => (
                <Badge key={item.key} variant="outline" className="text-[11px]" style={{ borderColor: LINK_TYPE_COLORS[item.key] }}>
                  <span className="mr-1 h-2 w-2 rounded-full" style={{ backgroundColor: LINK_TYPE_COLORS[item.key] }} />
                  {t(`linkType.${item.key}` as Parameters<typeof t>[0])} {item.percent}%
                </Badge>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
