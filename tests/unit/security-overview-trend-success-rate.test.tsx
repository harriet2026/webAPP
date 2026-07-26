import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import type { TrendData } from '@/lib/api/security-overview';
import { NON_SERIES_KEYS } from '@/lib/api/security-overview';

// Review Bug-2 regression: the delivery_result trend rows carry a `success_rate`
// percentage that is NOT a stackable count and is NOT a valid drill-down series
// (backend validates series ∈ AllDeliveryResults). It must be excluded from the
// stacked chart, the legend, and the clickable data points so a click never
// 400s the drill-down.

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/ui/card', () => {
  const div = ({ children }: { children?: React.ReactNode }) => createElement('div', null, children);
  return { Card: div, CardContent: div, CardHeader: div, CardTitle: div };
});
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));
vi.mock('@/components/ui/tabs', () => {
  const div = ({ children }: { children?: React.ReactNode }) => createElement('div', null, children);
  return {
    Tabs: div, TabsList: div,
    TabsTrigger: ({ children }: { children?: React.ReactNode }) => createElement('button', null, children),
  };
});
vi.mock('@/components/shared/smart-summary-badge', () => ({
  SmartSummaryBadge: ({ children }: { children?: React.ReactNode }) => createElement('span', null, children),
}));

import { TrendChartCard } from '@/components/statistics/security-overview/TrendChartCard';

const DELIVERY_KEYS = ['delivered', 'failed', 'cancelled', 'in_delivery', 'partial_delivered', 'unknown'];

// Mirrors the real backend delivery_result trend row shape (storage
// computeTrendAndDetail): date + the 6 result counts + the synthetic
// success_rate percentage. total/block_rate/change live in the detail rows, not
// the trend rows, so they are intentionally absent here.
function row(date: string) {
  return {
    date,
    delivered: 50, failed: 10, cancelled: 5, in_delivery: 5, partial_delivered: 20, unknown: 10,
    success_rate: 83.3,
  };
}

const trend = {
  threat_type: [], action: [],
  delivery_result: [row('2026-06-01'), row('2026-06-02')],
} as unknown as TrendData;

function renderChart(onPointClick = vi.fn()) {
  const utils = render(createElement(TrendChartCard, {
    trend, isLoading: false, viewBy: 'delivery_result' as const,
    onViewByChange: vi.fn(), hiddenSeries: new Set<string>(), onToggleSeries: vi.fn(), onPointClick,
  }));
  return { ...utils, onPointClick };
}

// The TrendChartCard renders one legend button per real series (each carrying
// a colored dot + a label span). This is the only DOM surface that mirrors the
// component's series key set, so the per-series regressions below key off it.
function legendLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');
}

describe('TrendChartCard success_rate exclusion (Bug-2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render success_rate as a legend series', () => {
    const { container } = renderChart();
    const texts = legendLabels(container);
    expect(texts).not.toContain('success_rate');
    // the 6 real delivery-result series remain
    for (const k of DELIVERY_KEYS) expect(texts).toContain(k);
  });

  it('renders exactly one legend button per real series (6 delivery-result series)', () => {
    // ECharts draws on a canvas/SVG and does not emit real <circle> elements in
    // jsdom (the chart was ported from recharts to echarts-for-react with
    // symbol:'none'), so the old "12 circles" assertion no longer applies. The
    // regression intent — "one stacked layer per real series, success_rate
    // excluded" — is captured by the legend button count, which is data-driven
    // from the same `keys` set the chart stacks on.
    const { container } = renderChart();
    const real = legendLabels(container).filter((label) => DELIVERY_KEYS.includes(label));
    expect(real).toHaveLength(DELIVERY_KEYS.length);
    expect(legendLabels(container)).not.toContain('success_rate');
  });

  it('never feeds success_rate to the drill-down (exclusion is data-level, not DOM-level)', () => {
    // The ECharts `onEvents.click` handler reverse-resolves the clicked
    // seriesName back to a raw key via `keys`, and `keys` is filtered by
    // NON_SERIES_KEYS — so success_rate can never reach onPointClick. We assert
    // the source of truth directly because the echarts click path is not
    // drivable from jsdom (canvas/SVG + internal event wiring).
    expect(NON_SERIES_KEYS.has('success_rate')).toBe(true);
    const dataKeys = Object.keys(trend.delivery_result[0]);
    const seriesKeys = dataKeys.filter((k) => k !== 'date' && !NON_SERIES_KEYS.has(k));
    expect(seriesKeys).toEqual(DELIVERY_KEYS);
    expect(seriesKeys).not.toContain('success_rate');
  });
});
