'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { LINK_TYPE_COLORS, ATTACHMENT_TYPE_COLORS } from './colors';

interface RowDonutProps {
  data: Record<string, number>;
  type: 'link' | 'attachment';
  labels?: Record<string, string>;
}

export function RowDonut({ data, type, labels = {} }: RowDonutProps) {
  const option = useMemo(() => {
    const entries = Object.entries(data).filter(([, v]) => v > 0);
    if (entries.length === 0) return null;

    const colors = type === 'link' ? LINK_TYPE_COLORS : ATTACHMENT_TYPE_COLORS;

    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 1 },
        label: { show: false },
        data: entries.map(([key, value]) => ({
          name: labels[key] ?? key,
          value,
          itemStyle: { color: colors[key] ?? '#8C8C8C' },
        })),
      }],
    };
  }, [data, labels, type]);

  if (!option) return null;

  return <ReactECharts option={option} style={{ height: 120 }} />;
}
