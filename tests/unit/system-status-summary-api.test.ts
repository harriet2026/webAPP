import { describe, expect, it, vi } from 'vitest';
import { fetchSystemStatusSummary } from '@/lib/api/system-status-summary';

describe('fetchSystemStatusSummary', () => {
  it('sends the exact current window with snake_case query parameters', async () => {
    const request = vi.fn(async (path: string) => path as never);

    await fetchSystemStatusSummary({
      startDate: '2026-07-02',
      startTime: '12:34:56',
      endDate: '2026-07-03',
      endTime: '12:34:56',
      interval: 'hour',
    }, request);

    expect(request).toHaveBeenCalledOnce();
    const path = request.mock.calls[0]?.[0];
    expect(path).toContain('/statistics/system-status-summary?');
    expect(path).toContain('start_date=2026-07-02');
    expect(path).toContain('start_time=12%3A34%3A56');
    expect(path).toContain('end_date=2026-07-03');
    expect(path).toContain('end_time=12%3A34%3A56');
    expect(path).toContain('interval=hour');
    expect(path).not.toContain('startDate');
  });
});
