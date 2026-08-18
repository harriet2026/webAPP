import { describe, it, expect, vi } from 'vitest';
import { getExportCsvUrl, getDrillDown, getEscapeList, getSecurityOverview } from './security-overview';

describe('security-overview client', () => {
  it('passes hour granularity to the overview endpoint', async () => {
    const fn = vi.fn().mockResolvedValue({});
    await getSecurityOverview(
      {
        startDate: '2026-07-24',
        endDate: '2026-07-24',
        interval: 'hour',
      },
      fn,
    );
    const path = fn.mock.calls[0][0] as string;
    expect(path).toContain('start_date=2026-07-24');
    expect(path).toContain('end_date=2026-07-24');
    expect(path).toContain('interval=hour');
  });

  it('sends start_time / end_time when the caller supplies clocks', async () => {
    const fn = vi.fn().mockResolvedValue({});
    await getSecurityOverview(
      {
        startDate: '2026-07-02',
        startTime: '12:34:56',
        endDate: '2026-07-03',
        endTime: '12:34:56',
        interval: 'hour',
      },
      fn,
    );
    const path = fn.mock.calls[0][0] as string;
    expect(path).toContain('start_time=12%3A34%3A56');
    expect(path).toContain('end_time=12%3A34%3A56');
  });

  it('omits the clock parameters entirely when the caller sends dates only', async () => {
    const fn = vi.fn().mockResolvedValue({});
    await getSecurityOverview({ startDate: '2026-07-02', endDate: '2026-07-03' }, fn);
    const path = fn.mock.calls[0][0] as string;
    expect(path).not.toContain('start_time');
    expect(path).not.toContain('end_time');
  });

  it('CSV url includes tenant_id when provided', () => {
    const url = getExportCsvUrl({ startDate: '2026-06-01', endDate: '2026-06-07', direction: 'all', tenantId: 9 });
    expect(url).toContain('tenant_id=9');
  });

  it('CSV url omits tenant_id when null', () => {
    const url = getExportCsvUrl({ startDate: '2026-06-01', endDate: '2026-06-07', direction: 'all', tenantId: null });
    expect(url).not.toContain('tenant_id');
  });

  it('getDrillDown sends date/view_by/series/dimension/limit, not filter_key', async () => {
    const fn = vi.fn().mockResolvedValue({ items: [], filter_query: '' });
    await getDrillDown({ date: '2026-06-03', viewBy: 'action', series: 'block', dimension: 'sender_domain', direction: 'receive', limit: 10 }, fn);
    const path = fn.mock.calls[0][0] as string;
    expect(path).toContain('date=2026-06-03');
    expect(path).toContain('view_by=action');
    expect(path).toContain('series=block');
    expect(path).toContain('dimension=sender_domain');
    expect(path).toContain('limit=10');
    expect(path).not.toContain('filter_key');
  });

  it('getDrillDown url omits filter_value / page / page_size', async () => {
    const fn = vi.fn().mockResolvedValue({ items: [], filter_query: '' });
    await getDrillDown(
      { date: '2026-06-03', viewBy: 'action', series: 'block', dimension: 'action', direction: 'receive', limit: 10 },
      fn,
    );
    const path = fn.mock.calls[0][0] as string;
    expect(path).not.toContain('filter_value');
    expect(path).not.toContain('page=');
    expect(path).not.toContain('page_size');
  });

  it('getEscapeList passes pagination', async () => {
    const fn = vi.fn().mockResolvedValue({ items: [], total: 0 });
    await getEscapeList({ startDate: '2026-06-01', endDate: '2026-06-07', page: 2, pageSize: 20 }, fn);
    const path = fn.mock.calls[0][0] as string;
    expect(path).toContain('/statistics/security-overview/escapes?');
    expect(path).toContain('page=2');
  });
});
