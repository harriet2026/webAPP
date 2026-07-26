import { describe, it, expect, vi } from 'vitest';
import { getFieldDefinitions } from './unified-rules';

describe('getFieldDefinitions page scoping', () => {
  it('passes the page query when provided', async () => {
    const fn = vi.fn().mockResolvedValue({ fields: {} });
    await getFieldDefinitions('data', 'advanced_rules', fn);
    expect(fn).toHaveBeenCalledWith(
      expect.stringContaining('page=advanced_rules'),
    );
    expect(fn).toHaveBeenCalledWith(expect.stringContaining('stage=data'));
  });
});
