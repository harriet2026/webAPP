import { describe, expect, it, vi } from 'vitest';
import {
  fetchDeliveryTraffic,
  type DeliveryTrafficResponse,
} from './delivery-traffic';

describe('delivery traffic API', () => {
  it('passes hourly granularity for a today trend request (GT-12594)', async () => {
    const response: DeliveryTrafficResponse = {
      kpi: {},
      trend: { points: [] },
      distribution: [],
      latency: { buckets: [] },
      detail_table: [],
    };
    const request = vi.fn(async () => response);

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
});
