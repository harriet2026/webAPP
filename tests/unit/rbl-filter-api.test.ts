import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api/client';
import { getRBLFilterStats, testRBLFilterRule } from '@/lib/api/rbl-filter';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

const mockApiRequest = vi.mocked(apiRequest);

describe('RBL Filter API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unwraps the stats payload from the backend response', async () => {
    mockApiRequest.mockResolvedValueOnce({ stats: { '7': 3, '8': 1 } });

    const result = await getRBLFilterStats(1);

    expect(mockApiRequest).toHaveBeenCalledWith('/rbl-filter/stats?days=1');
    expect(result).toEqual({ '7': 3, '8': 1 });
  });

  it('posts dry-run requests to the test endpoint', async () => {
    const payload = {
      match_mode: 'specific' as const,
      match_servers: ['zen.spamhaus.org'],
      product_action: 'block' as const,
      hit_servers: ['bl.spamcop.net'],
    };
    mockApiRequest.mockResolvedValueOnce({
      matched: false,
      condition_tree: '{"type":"condition"}',
      action: 'block',
    });

    const result = await testRBLFilterRule(payload);

    expect(mockApiRequest).toHaveBeenCalledWith('/rbl-filter/rules/test', {
      method: 'POST',
      body: payload,
    });
    expect(result.matched).toBe(false);
  });
});
