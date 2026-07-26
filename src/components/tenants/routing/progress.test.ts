import { describe, it, expect } from 'vitest';
import { progressCount } from './progress';

describe('progressCount', () => {
  it('counts completed routing items', () => {
    expect(progressCount({ receiving: true, relay: false, outbound: true, auth: false })).toBe(2);
    expect(progressCount({ receiving: true, relay: true, outbound: true, auth: true })).toBe(4);
  });
});
