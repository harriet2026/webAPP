import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import zh from '../../../../messages/zh.json';

interface CapturedChartOption {
  tooltip: {
    trigger: string;
    valueFormatter?: (value: number) => string;
  };
  series?: Array<{ data: number[] }>;
}

const mocks = vi.hoisted(() => ({
  chartOptions: [] as CapturedChartOption[],
  trendData: {
    series: {
      incoming: {
        points: [
          { ts: '2026-09-07T01:00:00Z', value: 0.08333333333333333 },
          { ts: '2026-09-07T02:00:00Z', value: 19 },
        ],
      },
      active: {
        points: [{ ts: '2026-09-07T01:00:00Z', value: 78.33333333333333 }],
      },
    },
  },
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
  useMailflowQueueTrend: vi.fn(() => ({ data: mocks.trendData })),
  isTimeoutError: vi.fn(() => false),
}));

import { QueueTab } from './QueueTab';

beforeEach(() => {
  mocks.chartOptions = [];
});

describe('QueueTab', () => {
  it('limits queue trend tooltip values to two decimals without padding integers', () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <QueueTab node="dev" range="1h" direction="all" />
      </NextIntlClientProvider>,
    );

    const trendOption = mocks.chartOptions[0];
    const valueFormatter = trendOption.tooltip.valueFormatter;
    expect(valueFormatter).toBeTypeOf('function');
    expect(valueFormatter?.(0.08333333333333333)).toBe('0.08');
    expect(valueFormatter?.(78.33333333333333)).toBe('78.33');
    expect(valueFormatter?.(19)).toBe('19');
    expect(valueFormatter?.(0)).toBe('0');

    expect(trendOption.series?.[0].data).toEqual([0.08333333333333333, 19]);
    expect(trendOption.series?.[1].data).toEqual([78.33333333333333, 0]);
  });
});
