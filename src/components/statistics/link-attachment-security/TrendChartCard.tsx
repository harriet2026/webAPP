'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReactECharts from 'echarts-for-react';
import type { LinkTrendPoint, AttachmentTrendPoint } from '@/lib/api/link-attachment-security';
import { LINK_TYPE_COLORS, ATTACHMENT_TYPE_COLORS, LINK_TYPE_KEYS, ATTACHMENT_TYPE_KEYS } from './colors';

interface TrendChartCardProps {
  trendLink?: LinkTrendPoint[];
  trendAttachment?: AttachmentTrendPoint[];
  viewTab: 'link' | 'attachment';
  chartType: 'line' | 'area';
  isLoading: boolean;
  embedded?: boolean;
}

export function TrendChartCard({
  trendLink,
  trendAttachment,
  viewTab,
  chartType,
  isLoading,
  embedded = false,
}: TrendChartCardProps) {
  const t = useTranslations('linkAttachmentSecurity');

  const option = useMemo(() => {
    if (viewTab === 'link') {
      // GT-11996: QueryLinkTrend buckets every date that has any mail in range,
      // so buckets can exist with total_link_mail all zero (range holds only
      // non-link mail). A bare length check then renders a flat all-zero chart
      // that looks empty; require at least one link mail before charting.
      if (!trendLink || !trendLink.some((p) => p.total_link_mail > 0)) return null;
      const dates = trendLink.map((p) => p.date);

      if (chartType === 'line') {
        return {
          tooltip: { trigger: 'axis' as const },
          legend: { bottom: 0, data: [t('kpi.totalLinkMail'), t('table.maliciousLinkMail')] },
          grid: { left: 64, right: 5, top: 8, bottom: 63 },
          xAxis: { type: 'category' as const, boundaryGap: false, data: dates },
          yAxis: { type: 'value' as const, splitNumber: 4, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
          series: [
            {
              name: t('kpi.totalLinkMail'),
              type: 'line',
              data: trendLink.map((p) => p.total_link_mail),
              smooth: true,
              lineStyle: { width: 2 },
              itemStyle: { color: '#3b82f6' },
            },
            {
              name: t('table.maliciousLinkMail'),
              type: 'line',
              data: trendLink.map((p) => p.malicious_link_mail),
              smooth: true,
              lineStyle: { width: 2 },
              itemStyle: { color: '#F5222D' },
            },
          ],
        };
      }

      return {
        tooltip: { trigger: 'axis' as const },
        legend: { bottom: 0, data: LINK_TYPE_KEYS.map((k) => t(`linkType.${k}`)) },
        grid: { left: 64, right: 5, top: 8, bottom: 63 },
        xAxis: { type: 'category' as const, boundaryGap: false, data: dates },
        yAxis: { type: 'value' as const, splitNumber: 4, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
        series: LINK_TYPE_KEYS.map((key) => ({
          name: t(`linkType.${key}`),
          type: 'line',
          stack: 'total',
          areaStyle: { opacity: 0.35 },
          data: trendLink.map((p) => p[key]),
          smooth: true,
          lineStyle: { width: 1 },
          itemStyle: { color: LINK_TYPE_COLORS[key] },
        })),
      };
    }

    if (!trendAttachment || !trendAttachment.some((p) => p.total_attachment_mail > 0)) return null;
    const dates = trendAttachment.map((p) => p.date);

    if (chartType === 'line') {
      return {
        tooltip: { trigger: 'axis' as const },
          legend: { bottom: 0, data: [t('kpi.totalAttachmentMail'), t('table.maliciousAttachmentMail')] },
          grid: { left: 64, right: 5, top: 8, bottom: 63 },
          xAxis: { type: 'category' as const, boundaryGap: false, data: dates },
          yAxis: { type: 'value' as const, splitNumber: 4, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
        series: [
          {
            name: t('kpi.totalAttachmentMail'),
            type: 'line',
            data: trendAttachment.map((p) => p.total_attachment_mail),
            smooth: true,
            lineStyle: { width: 2 },
            itemStyle: { color: '#8b5cf6' },
          },
          {
              name: t('table.maliciousAttachmentMail'),
            type: 'line',
            data: trendAttachment.map((p) => p.malicious_attachment_mail),
            smooth: true,
            lineStyle: { width: 2 },
            itemStyle: { color: '#F5222D' },
          },
        ],
      };
    }

    return {
      tooltip: { trigger: 'axis' as const },
      legend: { bottom: 0, data: ATTACHMENT_TYPE_KEYS.map((k) => t(`attachmentThreatType.${k}`)) },
      grid: { left: 64, right: 5, top: 8, bottom: 63 },
      xAxis: { type: 'category' as const, boundaryGap: false, data: dates },
      yAxis: { type: 'value' as const, splitNumber: 4, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
      series: ATTACHMENT_TYPE_KEYS.map((key) => ({
        name: t(`attachmentThreatType.${key}`),
        type: 'line',
        stack: 'total',
        areaStyle: { opacity: 0.35 },
        data: trendAttachment.map((p) => p[key]),
        smooth: true,
        lineStyle: { width: 1 },
        itemStyle: { color: ATTACHMENT_TYPE_COLORS[key] },
      })),
    };
  }, [trendLink, trendAttachment, viewTab, chartType, t]);

  const chart = isLoading ? (
    <Skeleton className="h-80 w-full rounded-lg" />
  ) : !option ? (
    <div className="flex h-80 items-center justify-center text-muted-foreground">
      {viewTab === 'link' ? t('empty.noLinkMail') : t('empty.noAttachmentMail')}
    </div>
  ) : (
    <ReactECharts option={option} style={{ height: 320 }} />
  );

  if (embedded) return <div data-testid="link-attachment-trend">{chart}</div>;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>
          {viewTab === 'link' ? t('tabs.link') : t('tabs.attachment')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chart}
      </CardContent>
    </Card>
  );
}
