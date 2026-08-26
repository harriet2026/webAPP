import { describe, it, expect, vi } from 'vitest';
import type { ApiRequestFn } from './client';
import { getLinkClicks, linkClickMessageFilter } from './link-clicks';

describe('getLinkClicks', () => {
  it('omits empty/undefined params and hits /link-click-logs', async () => {
    const calls: string[] = [];
    const fake = vi.fn(async (path: string) => {
      calls.push(path);
      return { items: [], total: 0, page: 1, page_size: 100 };
    });
    await getLinkClicks({ page: 1, page_size: 100, clicker: 'u@e.com', sender: '', trigger_stage: undefined }, fake as unknown as ApiRequestFn);
    expect(calls[0]).toContain('/link-click-logs?');
    expect(calls[0]).toContain('clicker=u%40e.com');
    expect(calls[0]).not.toContain('sender=');
    expect(calls[0]).not.toContain('trigger_stage=');
  });

  it('uses message_uuid as the authoritative message filter', async () => {
    const fake = vi.fn(async (path: string) => {
      expect(path).toContain('/link-click-logs?');
      return { items: [], total: 0, page: 1, page_size: 100 };
    });
    await getLinkClicks(
      { message_uuid: '5d46c25a-68e2-4c62-b847-79be183c1699' },
      fake as unknown as ApiRequestFn,
    );
    expect(fake.mock.calls[0][0]).toContain('message_uuid=5d46c25a-68e2-4c62-b847-79be183c1699');
  });

  it('routes the displayed identity to the UUID or historical Message-ID filter', () => {
    expect(linkClickMessageFilter('5d46c25a-68e2-4c62-b847-79be183c1699')).toEqual({
      message_uuid: '5d46c25a-68e2-4c62-b847-79be183c1699',
    });
    expect(linkClickMessageFilter('<legacy@example.com>')).toEqual({
      message_id: '<legacy@example.com>',
    });
    expect(linkClickMessageFilter('   ')).toEqual({});
  });
});
