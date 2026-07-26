import { describe, expect, it, vi } from 'vitest';
import { fetchSecurityEngine } from './monitoring';

describe('fetchSecurityEngine', () => {
  it('sends the selected engine and range to the backend contract', async () => {
    const request = vi.fn().mockResolvedValue({ engine: 'rbl', range: '30d' });
    await fetchSecurityEngine('rbl', '30d', request);
    expect(request).toHaveBeenCalledWith(
      '/monitor/security?engine=rbl&range=30d',
      { signal: undefined },
    );
  });
});
