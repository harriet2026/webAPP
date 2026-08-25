import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseTab } from './DatabaseTab';
import type { DatabaseResp } from '@/types/monitoring';

interface CapturedChartOption {
  xAxis: { axisLabel: { formatter: (value: string) => string } };
}

const mocks = vi.hoisted(() => ({
  chartOptions: [] as CapturedChartOption[],
  databaseData: undefined as DatabaseResp | undefined,
}));

vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: CapturedChartOption }) => {
    mocks.chartOptions.push(option);
    return <div data-testid="chart" />;
  },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string) => key,
}));

vi.mock('./hooks', () => ({
  useDatabase: () => ({
    data: mocks.databaseData,
    isLoading: false,
    isError: false,
  }),
}));

beforeEach(() => {
  mocks.chartOptions = [];
  const point = { ts: '2026-08-24T07:30:00.000Z', value: 10 };
  mocks.databaseData = {
    conn_trend: { points: [point] },
    latency_trend: { points: [point] },
    dml_rate: { points: [point] },
    slow_queries: [],
    lock_waits: [],
    status: {
      db: { status: 'ok', latency_ms: 1 },
      redis: { status: 'ok', latency_ms: 1 },
    },
    supported: true,
    db_backend: 'opengauss',
  };
});

describe('DatabaseTab trend charts', () => {
  it('formats all three time axes for short and seven-day ranges', () => {
    const timestamp = mocks.databaseData!.conn_trend.points[0].ts;
    const { rerender } = render(<DatabaseTab node="dev" range="1h" />);

    expect(mocks.chartOptions).toHaveLength(3);
    for (const option of mocks.chartOptions) {
      expect(option.xAxis.axisLabel.formatter(timestamp)).toBe(new Intl.DateTimeFormat('en-US', {
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date(timestamp)));
      expect(option.xAxis.axisLabel.formatter('invalid timestamp')).toBe('invalid timestamp');
    }

    mocks.chartOptions = [];
    rerender(<DatabaseTab node="dev" range="7d" />);

    expect(mocks.chartOptions).toHaveLength(3);
    for (const option of mocks.chartOptions) {
      expect(option.xAxis.axisLabel.formatter(timestamp)).toBe(new Intl.DateTimeFormat('en-US', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date(timestamp)));
    }
  });
});
