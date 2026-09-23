import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import zh from '../../../../messages/zh.json';

interface CapturedChartOption {
  xAxis: {
    data: string[];
    axisLabel: { formatter: (value: string, index: number) => string };
  };
  series?: Array<{ data: number[] }>;
}

const mocks = vi.hoisted(() => ({
  chartOptions: [] as CapturedChartOption[],
}));

vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: CapturedChartOption }) => {
    mocks.chartOptions.push(option);
    return null;
  },
}));

vi.mock('./hooks', () => ({
  useMailflowQueue: vi.fn(() => ({
    data: {
      depth: [],
      age: [],
      latency: {
        avg: 0,
        p95: 0,
        p99: 0,
        avg_status: 'normal',
        p95_status: 'normal',
        p99_status: 'normal',
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
  useMailflowQueueTrend: vi.fn(() => ({
    data: {
      series: {
        incoming: {
          points: [{ ts: '2026-09-03T13:20:00.000Z', value: 19 }],
        },
      },
    },
  })),
  isTimeoutError: vi.fn(() => false),
}));

import { QueueTab } from './QueueTab';

function fullLocalTime(timestamp: string) {
  const parts = new Intl.DateTimeFormat('zh', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

beforeEach(() => {
  mocks.chartOptions = [];
});

describe('QueueTab queue trend tooltip time', () => {
  it('uses a full local category time for the tooltip while keeping compact local axis labels', () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <QueueTab node="dev" range="1h" direction="all" />
      </NextIntlClientProvider>,
    );

    const timestamp = '2026-09-03T13:20:00.000Z';
    const trendOption = mocks.chartOptions[0];
    expect(trendOption.xAxis.data).toEqual([fullLocalTime(timestamp)]);
    expect(trendOption.xAxis.data[0]).not.toContain('T');
    expect(trendOption.xAxis.data[0]).not.toContain('Z');
    expect(trendOption.xAxis.axisLabel.formatter(trendOption.xAxis.data[0], 0)).toBe(
      new Intl.DateTimeFormat('zh', {
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date(timestamp)),
    );
    expect(trendOption.series?.[0].data).toEqual([19]);
  });
});
