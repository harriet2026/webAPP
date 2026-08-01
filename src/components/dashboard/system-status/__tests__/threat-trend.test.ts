import { describe, expect, it } from 'vitest';
import type { TrendSeriesPoint } from '@/lib/api/security-overview';
import { buildThreatTrendOption, formatThreatTrendBucket } from '../threat-trend-config';

const label = (key: string) => key;

describe('buildThreatTrendOption', () => {
  it('formats today hour buckets as hours while keeping day buckets unchanged', () => {
    expect(formatThreatTrendBucket('2026-07-24 00:00:00')).toBe('00:00');
    expect(formatThreatTrendBucket('2026-07-24 15:00:00')).toBe('15:00');
    expect(formatThreatTrendBucket('2026-07-24T23:00:00')).toBe('23:00');
    expect(formatThreatTrendBucket('2026-07-24')).toBe('2026-07-24');
  });

  it('uses hour labels for an hourly today series', () => {
    const points: TrendSeriesPoint[] = [
      { date: '2026-07-24 08:00:00', total: 3, block_rate: 100, change: null, phishing: 1, spam: 2 },
      { date: '2026-07-24 09:00:00', total: 7, block_rate: 100, change: 4, phishing: 3, spam: 4 },
    ];

    const option = buildThreatTrendOption(points, new Set(), label);

    expect(option?.xAxis).toMatchObject({
      boundaryGap: false,
      data: ['08:00', '09:00'],
      axisLabel: { interval: 0, fontSize: 12, color: '#666666' },
      axisLine: { show: true },
    });
    expect(option?.yAxis).toMatchObject({
      splitNumber: 4,
      axisLabel: { fontSize: 12, color: '#666666' },
      axisLine: { show: true },
    });
    expect(option?.grid).toMatchObject({ left: 35, top: 24, containLabel: true });
    expect(option?.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: { maxWidth: 560 },
          option: { xAxis: { axisLabel: { interval: 3 } } },
        }),
      ]),
    );
  });

  it('shows every second hour label for a full 24-hour series', () => {
    const points: TrendSeriesPoint[] = Array.from({ length: 24 }, (_, hour) => ({
      date: `2026-07-24 ${String(hour).padStart(2, '0')}:00:00`,
      total: hour,
      block_rate: 100,
      change: null,
      phishing: hour,
    }));

    const option = buildThreatTrendOption(points, new Set(), label);

    expect(option?.xAxis).toMatchObject({
      data: expect.arrayContaining(['00:00', '02:00', '22:00']),
      axisLabel: { interval: 1 },
    });
  });

  it('renders a single date bucket as a visible stacked bar', () => {
    const points: TrendSeriesPoint[] = [
      {
        date: '2026-07-24',
        total: 6522,
        block_rate: 100,
        change: null,
        phishing: 2413,
        spoofing: 0,
        spam: 4109,
        virus: 0,
        malicious: 0,
      },
    ];

    const option = buildThreatTrendOption(points, new Set(), label);

    expect(option?.xAxis).toMatchObject({
      type: 'category',
      boundaryGap: true,
      data: ['2026-07-24'],
    });
    expect(option?.series).toHaveLength(11);
    expect(option?.series.find((series) => series.name === 'phishing')).toMatchObject({
      name: 'phishing',
      type: 'bar',
      stack: 'total',
      barMaxWidth: 72,
      data: [2413],
    });
    expect(option?.series.find((series) => series.name === 'spam')).toMatchObject({
      name: 'spam',
      type: 'bar',
      data: [4109],
    });
  });

  it('keeps multiple date buckets as the existing stacked area trend', () => {
    const points: TrendSeriesPoint[] = [
      { date: '2026-07-23', total: 3, block_rate: 100, change: null, phishing: 1, spam: 2 },
      { date: '2026-07-24', total: 7, block_rate: 100, change: 4, phishing: 3, spam: 4 },
    ];

    const option = buildThreatTrendOption(points, new Set(), label);

    expect(option?.xAxis).toMatchObject({
      boundaryGap: false,
      data: ['2026-07-23', '2026-07-24'],
    });
    expect(option?.series.find((series) => series.name === 'phishing')).toMatchObject({
      type: 'line',
      symbol: 'none',
      data: [1, 3],
    });
    expect(option?.series.find((series) => series.name === 'phishing')).toHaveProperty('areaStyle');
  });

  // GT-12570 防回归：boundaryGap=false 时最后一个类目标签以最右数据点为中心
  // 渲染，grid.right=0 会把标签右半截裁出画布（"横坐标最后时刻显示不全"）。
  // containLabel 不处理这种越界，必须显式保留 ≥ 标签半宽的右侧内边距。
  it('GT-12570: 趋势图 grid 右侧保留内边距，末尾时间标签不被画布裁切', () => {
    const points: TrendSeriesPoint[] = [
      { date: '2026-07-27T22:00:00Z', total: 3, block_rate: 100, change: null, phishing: 1, spam: 2 },
      { date: '2026-07-27T23:00:00Z', total: 7, block_rate: 100, change: 4, phishing: 3, spam: 4 },
    ];
    const option = buildThreatTrendOption(points, new Set(), label);
    const grid = option?.grid as { right: number };
    expect(grid.right).toBeGreaterThanOrEqual(20);
  });
});

// GT-12397: 无数据（成功响应、零点位）时也要产出完整坐标系 option——
// 画布始终渲染，空态文案经 graphic 居中呈现，而不是返回 null 让组件换成
// 占位 div。
describe('empty-data canvas option (GT-12397)', () => {
  it('returns a full axes option with centered empty-text graphic for zero points', () => {
    const option = buildThreatTrendOption([], new Set(), (k) => k, '暂无数据');
    expect(option).not.toBeNull();
    expect(option?.xAxis).toMatchObject({ type: 'category', data: [] });
    expect(option?.yAxis).toMatchObject({ type: 'value', splitNumber: 4 });
    expect(option?.series).toEqual([]);
    const graphics = (option as { graphic?: Array<{ style?: { text?: string } }> }).graphic ?? [];
    expect(graphics.some((g) => g.style?.text === '暂无数据')).toBe(true);
  });
});
