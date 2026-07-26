import { describe, expect, it } from 'vitest';
import { overviewGridClass } from '../visibility';

// deriveVisibility can legitimately return overviewCols=1 (traditional form,
// tenant viewer: only threat-top5 renders — see visibility.test.ts). The grid
// class map must cover 1 so that single card does not stretch across a 3-col
// grid, re-creating the empty columns the "无空缺列" rule forbids.
describe('overviewGridClass', () => {
  it('maps each valid card count to its exact xl:grid-cols class', () => {
    expect(overviewGridClass(1)).toBe('xl:grid-cols-1');
    expect(overviewGridClass(2)).toBe('xl:grid-cols-2');
    expect(overviewGridClass(3)).toBe('xl:grid-cols-3');
  });

  it('falls back to 3 columns for an out-of-range count', () => {
    expect(overviewGridClass(0)).toBe('xl:grid-cols-3');
    expect(overviewGridClass(4)).toBe('xl:grid-cols-3');
  });
});
