import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HardwareTab } from './HardwareTab';
import type { HardwareResp } from '@/types/monitoring';

interface CapturedChartOption {
  xAxis: { axisLabel: { formatter: (value: string) => string } };
}

const mocks = vi.hoisted(() => ({
  chartOption: undefined as CapturedChartOption | undefined,
  hardwareData: undefined as HardwareResp | undefined,
}));

vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: CapturedChartOption }) => {
    mocks.chartOption = option;
    return <div data-testid="chart" />;
  },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string) => key,
}));

vi.mock('./hooks', () => ({
  useHardware: () => ({
    isLoading: false,
    isError: false,
    data: mocks.hardwareData,
  }),
}));

beforeEach(() => {
  mocks.chartOption = undefined;
  mocks.hardwareData = {
      cpu_mem: { points: [] },
      mem_trend: { points: [] },
      network_top5: [
        { device: 'eth0', rx_mbps: 10.25, tx_mbps: 1.5, rx_pps: 1234.56, tx_pps: 78, drop_rate: 0.02, retransmit_rate: null },
        { device: 'eth1', rx_mbps: null, tx_mbps: 0.08, rx_pps: null, tx_pps: 10, drop_rate: null, retransmit_rate: null },
        { device: 'eth2', rx_mbps: 0.07, tx_mbps: 0.07, rx_pps: 8, tx_pps: 8, drop_rate: 0, retransmit_rate: null },
        { device: 'eth3', rx_mbps: 0.06, tx_mbps: 0.06, rx_pps: 7, tx_pps: 7, drop_rate: 0, retransmit_rate: null },
        { device: 'eth4', rx_mbps: 0.05, tx_mbps: 0.05, rx_pps: 6, tx_pps: 6, drop_rate: 0, retransmit_rate: null },
        { device: 'eth5', rx_mbps: 0.04, tx_mbps: 0.04, rx_pps: 5, tx_pps: 5, drop_rate: 0, retransmit_rate: null },
      ],
  };
});

describe('HardwareTab network Top5', () => {
  it('formats pps and percentages, renders unavailable values as dash, and caps rows at five', () => {
    render(<HardwareTab node="dev" range="1h" />);

    const table = screen.getByTestId('monitor-infrastructure-network-table');
    expect(within(table).getAllByRole('row')).toHaveLength(6); // header + five data rows
    const eth0 = screen.getByTestId('monitor-infrastructure-network-row-eth0');
    expect(within(eth0).getByText('10.25')).toBeTruthy();
    expect(within(eth0).getByText('1.50')).toBeTruthy();
    expect(within(eth0).getByText('1,234.6')).toBeTruthy();
    expect(within(eth0).getByText('0.02%')).toBeTruthy();
    expect(within(eth0).getByText('—')).toBeTruthy();
    const eth1 = screen.getByTestId('monitor-infrastructure-network-row-eth1');
    expect(within(eth1).getAllByText('—')).toHaveLength(4);
    expect(screen.queryByTestId('monitor-infrastructure-network-row-eth5')).toBeNull();
  });
});

describe('HardwareTab CPU and memory trend', () => {
  it('formats RFC3339 axis labels in the current locale and selected range', () => {
    const timestamp = '2026-08-14T08:54:00.000Z';
    mocks.hardwareData = {
      ...mocks.hardwareData!,
      cpu_mem: { points: [{ ts: timestamp, value: 45 }] },
    };

    const { rerender } = render(<HardwareTab node="dev" range="1h" />);
    const shortFormatter = mocks.chartOption?.xAxis.axisLabel.formatter;
    if (!shortFormatter) throw new Error('short-range axis formatter was not configured');
    expect(shortFormatter(timestamp)).toBe(new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(timestamp)));
    expect(shortFormatter('invalid timestamp')).toBe('invalid timestamp');

    rerender(<HardwareTab node="dev" range="7d" />);
    const longFormatter = mocks.chartOption?.xAxis.axisLabel.formatter;
    if (!longFormatter) throw new Error('long-range axis formatter was not configured');
    expect(longFormatter(timestamp)).toBe(new Intl.DateTimeFormat('en-US', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(timestamp)));
  });
});
