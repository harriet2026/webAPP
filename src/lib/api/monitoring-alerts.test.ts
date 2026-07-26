import { describe, expect, it, vi } from 'vitest';
import type { ApiRequestFn } from './client';
import { fetchAlert, fetchAlerts } from './monitoring';

describe('alert center API', () => {
  it('serializes list filters and pagination', async () => {
    const response = { items: [], total: 0, page: 2, page_size: 20 };
    const request = vi.fn(async () => response) as unknown as ApiRequestFn;

    await expect(fetchAlerts({
      severity: 'p1',
      status: 'processing',
      q: 'queue delay',
      range: '24h',
      page: 2,
      page_size: 20,
    }, request)).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith(
      '/monitor/alerts?severity=p1&status=processing&q=queue+delay&range=24h&page=2&page_size=20',
      { signal: undefined },
    );
  });

  it('loads a single alert for a detail deep link', async () => {
    const response = { id: 99, message: 'deep-link alert' };
    const request = vi.fn(async () => response) as unknown as ApiRequestFn;

    await expect(fetchAlert(99, request)).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith('/monitor/alerts/99', { signal: undefined });
  });
});
