import { describe, it, expect, vi } from 'vitest';
import {
  getSecurityOverview,
  getGeoDistribution,
  getTimeDistribution,
  getDrillDown,
  getEscapeList,
  getExportCsvUrl,
} from '@/lib/api/security-overview';

function captureUrl(): { url: string | null; fn: (path: string) => Promise<never> } {
  const result = { url: null as string | null };
  const fn = vi.fn((path: string) => {
    result.url = path;
    return Promise.resolve({} as never);
  });
  return { url: result, fn } as unknown as { url: string | null; fn: (path: string) => Promise<never> };
}

describe('getSecurityOverview', () => {
  it('sends snake_case query params', async () => {
    const captured: string[] = [];
    const mockFn = vi.fn((path: string) => { captured.push(path); return Promise.resolve({} as never); });
    await getSecurityOverview(
      { startDate: '2026-05-01', endDate: '2026-05-07', direction: 'receive', comparePreviousPeriod: true },
      mockFn,
    );
    const url = captured[0];
    expect(url).toContain('start_date=2026-05-01');
    expect(url).toContain('end_date=2026-05-07');
    expect(url).toContain('direction=receive');
    expect(url).toContain('compare_previous_period=true');
    expect(url).not.toContain('startDate');
    expect(url).not.toContain('endDate');
    expect(url).not.toContain('comparePreviousPeriod');
  });
});

describe('getGeoDistribution', () => {
  it('sends snake_case query params', async () => {
    const captured: string[] = [];
    const mockFn = vi.fn((path: string) => { captured.push(path); return Promise.resolve({} as never); });
    await getGeoDistribution(
      { startDate: '2026-05-01', endDate: '2026-05-07', direction: 'receive', threatFilter: 'phishing' },
      mockFn,
    );
    const url = captured[0];
    expect(url).toContain('start_date=2026-05-01');
    expect(url).toContain('end_date=2026-05-07');
    expect(url).toContain('threat_filter=phishing');
    expect(url).not.toContain('startDate');
    expect(url).not.toContain('threatFilter');
  });
});

describe('getTimeDistribution', () => {
  it('uses /time-distribution path with snake_case params', async () => {
    const captured: string[] = [];
    const mockFn = vi.fn((path: string) => { captured.push(path); return Promise.resolve({} as never); });
    await getTimeDistribution(
      { startDate: '2026-05-01', endDate: '2026-05-07', direction: 'receive', threatFilter: 'spam', mode: 'daily' },
      mockFn,
    );
    const url = captured[0];
    expect(url).toContain('/statistics/security-overview/time-distribution');
    expect(url).toContain('start_date=2026-05-01');
    expect(url).toContain('threat_filter=spam');
    expect(url).not.toContain('/time?');
    expect(url).not.toContain('startDate');
    expect(url).not.toContain('threatFilter');
  });
});

describe('getDrillDown', () => {
  it('uses /drill-down path with date/view_by/series/dimension', async () => {
    const captured: string[] = [];
    const mockFn = vi.fn((path: string) => { captured.push(path); return Promise.resolve({} as never); });
    await getDrillDown(
      { date: '2026-05-01', viewBy: 'action', series: 'block', dimension: 'sender_domain', limit: 20 },
      mockFn,
    );
    const url = captured[0];
    expect(url).toContain('/statistics/security-overview/drill-down');
    expect(url).toContain('date=2026-05-01');
    expect(url).toContain('view_by=action');
    expect(url).toContain('series=block');
    expect(url).toContain('dimension=sender_domain');
    expect(url).toContain('limit=20');
    expect(url).not.toContain('filter_key');
    expect(url).not.toContain('/drilldown');
  });
});

describe('getEscapeList', () => {
  it('uses /escapes path with snake_case params', async () => {
    const captured: string[] = [];
    const mockFn = vi.fn((path: string) => { captured.push(path); return Promise.resolve({} as never); });
    await getEscapeList(
      { startDate: '2026-05-01', endDate: '2026-05-07', direction: 'receive', pageSize: 10 },
      mockFn,
    );
    const url = captured[0];
    expect(url).toContain('/statistics/security-overview/escapes');
    expect(url).toContain('start_date=2026-05-01');
    expect(url).toContain('page_size=10');
    expect(url).not.toContain('/escape?');
    expect(url).not.toContain('startDate');
    expect(url).not.toContain('pageSize');
  });
});

describe('getExportCsvUrl', () => {
  it('uses /export.csv path', () => {
    const url = getExportCsvUrl({ startDate: '2026-05-01', endDate: '2026-05-07', direction: 'all', tenantId: null });
    expect(url).toContain('/statistics/security-overview/export.csv');
    expect(url).toContain('start_date=2026-05-01');
    expect(url).not.toContain('tenant_id');
    expect(url).not.toContain('/export?');
    expect(url).not.toContain('/export.csv.csv');
  });
});
