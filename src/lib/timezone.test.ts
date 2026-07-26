import { describe, it, expect, vi, afterEach } from 'vitest';
import { getBrowserTz } from './timezone';

afterEach(() => vi.restoreAllMocks());

describe('getBrowserTz', () => {
  it('returns the IANA zone reported by Intl', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }),
    } as unknown as Intl.DateTimeFormat);
    expect(getBrowserTz()).toBe('America/New_York');
  });

  it('returns empty string when Intl throws', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl');
    });
    expect(getBrowserTz()).toBe('');
  });
});
