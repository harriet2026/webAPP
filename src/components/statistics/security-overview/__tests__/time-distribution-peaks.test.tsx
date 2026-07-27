import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { localizedWeekdays, TimeDistributionCard } from '../TimeDistributionCard';

let lastChartOption: Record<string, unknown> = {};
vi.mock('echarts-for-react', () => ({
  default: ({ option, ...props }: { option: Record<string, unknown>; [key: string]: unknown }) => {
    lastChartOption = option;
    return <div {...props} data-option={JSON.stringify(option)} />;
  },
}));

// GT-11983 / GT-11932: the backend has always returned a TOP4 `peak_hours`
// (verified on the wire: [{hour:1,count:2449},{hour:3,count:1939},...]) and the
// `time.peakTitle` i18n key existed unused in all four locales — but the card
// never read either. It rendered a flat bar chart plus a hand-rolled single-peak
// badge ("峰值时段: 10:00 · 280"), so there was no ranking and no hour RANGE.

vi.mock('next-intl', () => ({
  useLocale: () => 'zh-CN',
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      title: '攻击时段分布',
      daily: '日内分布',
      weekly: '周内分布',
      peakTitle: '高峰时段',
      peakSummary: `攻击高峰：${vars?.range}（共 ${vars?.count} 封）`,
      peakCount: `${vars?.count} 封`,
    };
    return dict[key] ?? key;
  },
}));

let peakHours = [
  { hour: 1, count: 2449 },
  { hour: 3, count: 1939 },
  { hour: 10, count: 1925 },
  { hour: 23, count: 864 },
];

vi.mock('../hooks/useSecurityOverview', () => ({
  useTimeDistribution: (params: { mode: 'daily' | 'weekly' }) => ({
    isLoading: false,
    data: params.mode === 'weekly' ? {
      mode: 'weekly',
      buckets: [],
      hourly: [],
      peak_hours: [],
      weekly_matrix: [
        { day: 0, hour: 9, value: 12 },
        { day: 1, hour: 10, value: 24 },
      ],
    } : {
      mode: 'daily',
      buckets: [
        { label: '01:00', attack_count: 2449, total_count: 2449 },
        { label: '03:00', attack_count: 1939, total_count: 1939 },
      ],
      hourly: [
        { hour: 1, total: 2449, phishing: 449, spam: 1200, virus: 500, malicious: 300 },
        { hour: 3, total: 1939, phishing: 339, spam: 900, virus: 400, malicious: 300 },
      ],
      peak_hours: peakHours,
    },
  }),
}));

const props = {
  startDate: '2026-07-01',
  endDate: '2026-07-12',
  direction: 'all' as const,
  scopeTenantId: null,
};

describe('TimeDistributionCard peak-hours ranking (GT-11983 / GT-11932)', () => {
  beforeEach(() => {
    peakHours = [
      { hour: 1, count: 2449 },
      { hour: 3, count: 1939 },
      { hour: 10, count: 1925 },
      { hour: 23, count: 864 },
    ];
  });

  it('renders the TOP4 peak-hour ranking the backend already sends', () => {
    render(<TimeDistributionCard {...props} />);

    const list = screen.getByTestId('peak-hours-list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);

    // rank order must follow the backend's ordering (desc by count), not hour
    expect(items[0]).toHaveTextContent('01:00-02:00');
    expect(items[0]).toHaveTextContent('2,449');
    expect(items[1]).toHaveTextContent('03:00-04:00');
    expect(items[3]).toHaveTextContent('23:00-00:00'); // wraps midnight
  });

  it('summary states the hour RANGE and the unit, per the prototype', () => {
    render(<TimeDistributionCard {...props} />);

    // prototype: "本周攻击高峰: 13:00-14:00 (共 100 封)"
    expect(screen.getByText('攻击高峰：01:00-02:00（共 2,449 封）')).toBeInTheDocument();
    // the old "峰值时段: 01:00 · 2449" format named neither a range nor a unit
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('uses the peakTitle key that had been sitting unused', () => {
    render(<TimeDistributionCard {...props} />);
    expect(screen.getByText('高峰时段')).toBeInTheDocument();
  });

  it('renders the daily distribution with the shared ECharts component', () => {
    render(<TimeDistributionCard {...props} />);

    const chart = screen.getByTestId('time-distribution-echarts');
    const option = JSON.parse(chart.getAttribute('data-option') ?? '{}');
    expect(option.series).toHaveLength(8);
    expect(option.series.every((series: { type: string }) => series.type === 'bar')).toBe(true);
    expect(option.series.every((series: { stack: string }) => series.stack === 'threats')).toBe(true);
  });

  it('renders weekly mode as an ECharts heatmap', () => {
    render(<TimeDistributionCard {...props} />);
    fireEvent.click(screen.getByText('周内分布'));

    const chart = screen.getByTestId('time-distribution-echarts');
    const option = JSON.parse(chart.getAttribute('data-option') ?? '{}');
    expect(option.series[0].type).toBe('heatmap');
    expect(option.series[0].data).toEqual([[9, 0, 12], [10, 1, 24]]);
    expect(option.yAxis.inverse).toBe(true);
    expect(option.yAxis.data).toEqual(['周日', '周一', '周二', '周三', '周四', '周五', '周六']);
    const formatter = (lastChartOption.tooltip as { formatter: (params: unknown) => string }).formatter;
    expect(formatter({ value: [10, 1, 24] })).toContain('周一');
  });

  it('localizes weekday labels without forcing Chinese in other locales', () => {
    expect(localizedWeekdays('zh-CN')[1]).toBe('周一');
    expect(localizedWeekdays('en-US')[1]).toBe('Mon');
  });
});

// Review finding: the backend pre-seeds all 24 hour slots with zeros and then
// unconditionally emits the top 4 of the sorted copy (storage/security_overview.go:
// `hourly[i] = {hour: i, total: 0}` → sortByTotalDesc → topN[0:4]). So on a DB with
// NO traffic at all, peak_hours still comes back with four count=0 rows. Rendering
// them produced a fabricated "攻击高峰：01:00-02:00（共 0 封）" — worse than showing
// nothing. My original fixture only had non-zero counts, so it never caught this.
describe('TimeDistributionCard with zero traffic (review finding)', () => {
  it('does not fabricate a peak when every hour has zero mail', () => {
    peakHours = [
      { hour: 0, count: 0 },
      { hour: 1, count: 0 },
      { hour: 2, count: 0 },
      { hour: 3, count: 0 },
    ];
    render(<TimeDistributionCard {...props} />);

    expect(screen.queryByTestId('peak-hours-list')).not.toBeInTheDocument();
    expect(screen.queryByText(/攻击高峰/)).not.toBeInTheDocument();
    expect(screen.queryByText(/共 0 封/)).not.toBeInTheDocument();
  });

  it('still ranks only the hours that actually saw mail', () => {
    peakHours = [
      { hour: 5, count: 12 },
      { hour: 6, count: 0 },
      { hour: 7, count: 0 },
      { hour: 8, count: 0 },
    ];
    render(<TimeDistributionCard {...props} />);

    const items = within(screen.getByTestId('peak-hours-list')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('05:00-06:00');
  });
});
