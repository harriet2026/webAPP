import { describe, expect, test, vi } from 'vitest';
import type { ApiRequestFn } from './client';
import { getEmailLogEvents } from './logs';

describe('getEmailLogEvents', () => {
  test('requests release-lineage events for the legacy email detail', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0 }) as unknown as ApiRequestFn;
    await getEmailLogEvents(42, requestFn);

    expect(requestFn).toHaveBeenCalledWith(
      '/mail-logs/42/events?page=1&page_size=100&include_releases=true',
    );
  });
});
