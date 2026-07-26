import { describe, expect, it } from 'vitest';
import type { DeliveryTrafficResponse } from '@/lib/api/delivery-traffic';
import { dispatch, isMockable } from './dispatcher';

describe('delivery traffic mock coverage', () => {
  it('covers the dashboard, export and AI endpoints', () => {
    expect(isMockable('GET', '/statistics/delivery-traffic?direction=all')).toBe(true);
    expect(isMockable('GET', '/statistics/delivery-traffic/export.csv')).toBe(true);
    expect(isMockable('POST', '/statistics/delivery-traffic/ai-analysis')).toBe(true);
  });

  it('returns direction-specific data and tenant scaling', () => {
    const all = dispatch({ method: 'GET', path: '/statistics/delivery-traffic?direction=all' }).data as DeliveryTrafficResponse;
    const tenant = dispatch({ method: 'GET', path: '/statistics/delivery-traffic?direction=all&tenant_id=2' }).data as DeliveryTrafficResponse;
    const send = dispatch({ method: 'GET', path: '/statistics/delivery-traffic?direction=send' }).data as DeliveryTrafficResponse;

    expect(all.kpi.inbound_total).toBe(89234);
    expect(all.kpi.trends).toEqual({ totalSuccessRate: 1.2, queueBacklog: -5.3 });
    expect(all.detail_table[0]).toMatchObject({
      total: 9779, success: 9290, failure: 293,
      deferred: 146, cancelled: 50, success_rate: 95, change: -4.3,
    });
    const expectedTrendDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    expect(all.trend.points.map((point: { date: string }) => point.date)).toEqual(expectedTrendDates);
    expect(tenant.kpi.inbound_total ?? 0).toBeLessThan(all.kpi.inbound_total ?? 0);
    expect(send.latency.percentiles).toHaveLength(7);
    expect(send.queue_trend).toHaveLength(7);
  });
});
