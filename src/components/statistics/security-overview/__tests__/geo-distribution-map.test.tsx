import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GeoDistributionCard,
  countryFlagPosition,
  normalizeWorldMapGeoJson,
} from '../GeoDistributionCard';
import type { GeoCountry } from '@/lib/api/security-overview';

vi.mock('echarts', () => ({
  getMap: () => ({}),
  registerMap: vi.fn(),
}));

vi.mock('echarts-for-react', () => ({
  default: ({ option, onEvents }: {
    option: Record<string, unknown>;
    onEvents: { click: (params: { name: string }) => void };
  }) => (
    <button
      type="button"
      data-testid="geo-echarts"
      data-option={JSON.stringify(option)}
      onClick={() => onEvents.click({ name: 'BR' })}
    >
      world map
    </button>
  ),
}));

const geoMessages: Record<string, string> = {
  title: '攻击来源地理分布',
  threatFilter: '威胁筛选',
  allThreats: '全部威胁',
  summary: '本周攻击主要来源于：{sources}',
  topRegions: 'TOP 攻击来源地区',
  threatEmails: '威胁邮件数量',
  blockRate: '拦截率',
  less: '少',
  more: '多',
  noThreatData: '暂无威胁记录',
  empty: '暂无攻击来源地理数据',
  mapUnavailable: '世界地图加载失败',
  backToWorld: '返回全球',
  topIps: '来源 IP TOP',
  byThreat: '威胁构成',
  'specialRegionNames.HK': '中国香港',
  'specialRegionNames.MO': '中国澳门',
  'specialRegionNames.TW': '中国台湾',
};

vi.mock('next-intl', () => ({
  useLocale: () => 'zh-CN',
  useTranslations: (namespace: string) => (key: string, vars?: Record<string, unknown>) => {
    if (namespace === 'securityOverview.geo') {
      return (geoMessages[key] ?? key).replace('{sources}', String(vars?.sources ?? ''));
    }
    const rootMessages: Record<string, string> = {
      'filter.direction.all': '全部威胁',
      'threatTypes.phishing': '钓鱼邮件',
      'threatTypes.spam': '垃圾邮件',
      'threatTypes.virus': '病毒邮件',
      'threatTypes.malicious': '恶意邮件',
    };
    return rootMessages[key] ?? key;
  },
}));

let countries: GeoCountry[];
let geoParams: Record<string, unknown>;

vi.mock('../hooks/useSecurityOverview', () => ({
  useGeoDistribution: (params: Record<string, unknown>) => {
    geoParams = params;
    return {
      isLoading: false,
      isFetching: false,
      data: {
        countries,
        summary_top3: countries.slice(0, 3).map((country) => country.country),
      },
    };
  },
}));

const props = {
  startDate: '2026-07-01',
  endDate: '2026-07-07',
  direction: 'all' as const,
  scopeTenantId: null,
};

describe('GeoDistributionCard ECharts world map', () => {
  beforeEach(() => {
    countries = [
      { country: 'US', count: 1245, block_rate: 97.2 },
      { country: 'BR', count: 532, block_rate: 95.1 },
      { country: 'NL', count: 356, block_rate: 98.3 },
      { country: 'IN', count: 167, block_rate: 94.2 },
    ];
  });

  it('maps threat counts, not block rates, into an ECharts map and continuous visualMap', () => {
    render(<GeoDistributionCard {...props} />);

    const chart = screen.getByTestId('geo-echarts');
    const option = JSON.parse(chart.getAttribute('data-option') ?? '{}');
    expect(option.series[0]).toMatchObject({
      type: 'map',
      map: 'security-overview-world',
      nameProperty: 'iso_a2',
      layoutSize: '105%',
      zoom: 1,
      data: [
        { name: 'US', value: 1245 },
        { name: 'BR', value: 532 },
        { name: 'NL', value: 356 },
        { name: 'IN', value: 167 },
      ],
    });
    expect(option.visualMap).toMatchObject({ type: 'continuous', min: 0, max: 1245, itemWidth: 8, itemHeight: 88 });
    expect(option.visualMap.text).toEqual(['多', '少']);
    expect(screen.getByTestId('geo-world-map')).toHaveClass('h-[260px]');
    expect(screen.getByText('本周攻击主要来源于：美国(54%)、巴西(23%)、荷兰(15%)')).toBeInTheDocument();
  });

  it('keeps map clicks, ranking selection and breadcrumb on the same ISO code without adding a detail panel', () => {
    render(<GeoDistributionCard {...props} />);

    fireEvent.click(screen.getByTestId('geo-echarts'));
    expect(screen.getByText('巴西', { selector: '[data-slot="card-title"] span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. 巴西' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2. 巴西' })).toHaveTextContent('532');
    expect(screen.getByRole('button', { name: '2. 巴西' })).not.toHaveClass('bg-primary/10');
    expect(geoParams).not.toHaveProperty('country');
    expect(screen.queryByTestId('geo-country-drilldown')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回全球' }));
    expect(screen.queryByRole('button', { name: '返回全球' })).not.toBeInTheDocument();
  });

  it('focuses the selected China territory and keeps Taiwan in the CN map feature', () => {
    countries = [
      { country: 'CN', count: 234, block_rate: 99.1 },
      { country: 'US', count: 1245, block_rate: 97.2 },
    ];
    render(<GeoDistributionCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '1. 中国' }));
    const option = JSON.parse(screen.getByTestId('geo-echarts').getAttribute('data-option') ?? '{}');
    expect(option.series[0]).toMatchObject({
      center: [104.5, 35],
      zoom: 3.7,
      selectedMap: { CN: true },
    });

    const normalized = normalizeWorldMapGeoJson({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { iso_a2: 'CN', name_en: 'People\'s Republic of China' },
          geometry: { type: 'MultiPolygon', coordinates: [[[[110, 18], [111, 19], [110, 18]]]] },
        },
        {
          type: 'Feature',
          properties: { iso_a2: 'TW', name_en: 'Taiwan' },
          geometry: { type: 'Polygon', coordinates: [[[120, 22], [122, 25], [120, 22]]] },
        },
      ],
    });
    expect(normalized.features.map((feature) => feature.properties.iso_a2)).toEqual(['CN']);
    expect(normalized.features[0]?.geometry).toMatchObject({
      type: 'MultiPolygon',
      coordinates: [
        [[[110, 18], [111, 19], [110, 18]]],
        [[[120, 22], [122, 25], [120, 22]]],
      ],
    });
  });

  it('uses unified China names and flags while merging HK, MO and TW into the CN map datum', () => {
    countries = [
      { country: 'HK', count: 70, block_rate: 97 },
      { country: 'MO', count: 20, block_rate: 98 },
      { country: 'TW', count: 10, block_rate: 99 },
    ];
    render(<GeoDistributionCard {...props} />);

    expect(screen.getByText('本周攻击主要来源于：中国香港(70%)、中国澳门(20%)、中国台湾(10%)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1. 中国香港' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. 中国澳门' })).toBeInTheDocument();
    const taiwan = screen.getByRole('button', { name: '3. 中国台湾' });
    expect(taiwan).toBeInTheDocument();

    const chinaFlagPosition = countryFlagPosition('CN');
    expect(countryFlagPosition('HK')).toBe(chinaFlagPosition);
    expect(countryFlagPosition('MO')).toBe(chinaFlagPosition);
    expect(countryFlagPosition('TW')).toBe(chinaFlagPosition);

    fireEvent.click(taiwan);
    expect(screen.getByText('中国台湾', { selector: '[data-slot="card-title"] span' })).toBeInTheDocument();
    const option = JSON.parse(screen.getByTestId('geo-echarts').getAttribute('data-option') ?? '{}');
    expect(option.series[0]).toMatchObject({
      data: [{ name: 'CN', value: 100 }],
      center: [104.5, 35],
      zoom: 3.7,
      selectedMap: { CN: true },
    });
    expect(option.visualMap.max).toBe(100);
  });

  it('renders ISO-derived flags, a scrollable TOP ranking and safe block-rate values', () => {
    render(<GeoDistributionCard {...props} />);

    expect(countryFlagPosition('JP')).toBe('-360px -162px');
    expect(countryFlagPosition('KR')).toBe('-408px -180px');
    expect(countryFlagPosition('US')).toBe('-432px -360px');
    expect(countryFlagPosition('bad')).toBeNull();
    const ranking = screen.getByTestId('geo-ranking');
    expect(ranking).toHaveClass('overflow-y-auto');
    expect(within(ranking).getAllByRole('button')).toHaveLength(4);
    expect(ranking).toHaveTextContent('97.2%');
    expect(ranking).not.toHaveTextContent('NaN');
  });

  it('shows an explicit empty state without a map or visual scale', () => {
    countries = [];
    render(<GeoDistributionCard {...props} />);

    expect(screen.getByTestId('geo-empty-state')).toHaveTextContent('暂无攻击来源地理数据');
    expect(screen.queryByTestId('geo-echarts')).not.toBeInTheDocument();
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
  });
});
