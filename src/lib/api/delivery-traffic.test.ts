import { describe, expect, it, vi } from 'vitest';
import {
  fetchDeliveryTraffic,
  type DeliveryTrafficResponse,
} from './delivery-traffic';
import type { ApiRequestFn } from './client';

describe('delivery traffic API', () => {
  it('passes hourly granularity for a today trend request (GT-12594)', async () => {
    const response: DeliveryTrafficResponse = {
      kpi: {},
      trend: { points: [] },
      distribution: [],
      latency: { buckets: [] },
      detail_table: [],
    };
    const request = vi.fn(async <T,>() => response as T) as ApiRequestFn;

    await fetchDeliveryTraffic({
      startDate: '2026-07-28',
      endDate: '2026-07-28',
      direction: 'all',
      interval: 'hour',
    }, request);

    expect(request).toHaveBeenCalledWith(
      '/statistics/delivery-traffic?start_date=2026-07-28&end_date=2026-07-28&direction=all&interval=hour',
    );
  });

  it('sends start_time / end_time when the caller supplies clocks', async () => {
    const response: DeliveryTrafficResponse = {
      kpi: {},
      trend: { points: [] },
      distribution: [],
      latency: { buckets: [] },
      detail_table: [],
    };
    const request = vi.fn(async <T,>() => response as T) as ApiRequestFn;

    await fetchDeliveryTraffic({
      startDate: '2026-07-02',
      startTime: '12:34:56',
      endDate: '2026-07-03',
      endTime: '12:34:56',
      direction: 'all',
      interval: 'hour',
    }, request);

    const url = (request as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    // URLSearchParams percent-encodes ':'.
    expect(url).toContain('start_time=12%3A34%3A56');
    expect(url).toContain('end_time=12%3A34%3A56');
  });

  it('omits the clock parameters entirely when not supplied (unchanged wire format)', async () => {
    const response: DeliveryTrafficResponse = {
      kpi: {},
      trend: { points: [] },
      distribution: [],
      latency: { buckets: [] },
      detail_table: [],
    };
    const request = vi.fn(async <T,>() => response as T) as ApiRequestFn;

    await fetchDeliveryTraffic({
      startDate: '2026-07-01',
      endDate: '2026-07-07',
      direction: 'receive',
      interval: 'day',
    }, request);

    expect(request).toHaveBeenCalledWith(
      '/statistics/delivery-traffic?start_date=2026-07-01&end_date=2026-07-07&direction=receive&interval=day',
    );
  });
});
