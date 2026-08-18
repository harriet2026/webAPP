import { describe, expect, it } from 'vitest';
import type { SystemStatusSummaryResponse } from '@/lib/api/system-status-summary';
import { dispatch, isMockable } from './dispatcher';

describe('system-status summary mock coverage', () => {
  it('keeps the homepage available in mock mode', () => {
    const path = '/statistics/system-status-summary?start_date=2026-07-01&end_date=2026-07-07&interval=day';
    expect(isMockable('GET', path)).toBe(true);

    const data = dispatch({ method: 'GET', path }).data as SystemStatusSummaryResponse;
    expect(data.current.mail_volume).toBeGreaterThan(0);
    expect(data.previous.mail_volume).toBeGreaterThan(0);
    expect(data.threat_trend.length).toBeGreaterThan(0);
    expect(data.pending_disposal).toBeGreaterThanOrEqual(0);
  });
});
