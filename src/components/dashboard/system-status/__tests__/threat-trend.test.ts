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
    expect(option?.series).toHaveLength(5);
    expect(option?.series[0]).toMatchObject({
      name: 'phishing',
      type: 'bar',
      stack: 'total',
      barMaxWidth: 72,
      data: [2413],
    });
    expect(option?.series[2]).toMatchObject({
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
    expect(option?.series[0]).toMatchObject({
      type: 'line',
      symbol: 'none',
      data: [1, 3],
    });
    expect(option?.series[0]).toHaveProperty('areaStyle');
  });
});
