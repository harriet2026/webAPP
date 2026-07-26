import { describe, it, expect, vi } from 'vitest';
import type { ApiRequestFn } from './client';
import { getLinkClicks } from './link-clicks';

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
});
