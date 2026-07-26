import { describe, it, expect } from 'vitest';
import { tryT } from './spoofing-brand-card';

describe('tryT fallback (GT-11656/11658/11659)', () => {
  const t = (key: string) => (key === 'brand.mode.standard' ? '标准模式' : key);

  it('returns translation when key exists', () => {
    expect(tryT(t, 'brand.mode.standard', 'fallback')).toBe('标准模式');
  });

  it('returns fallback when key missing (raw value leak)', () => {
    expect(tryT(t, 'brand.mode.quarantine', 'fallback')).toBe('fallback');
  });

  it('returns fallback when key returns itself (next-intl missing-message behavior)', () => {
    const t2 = (key: string) => key;
    expect(tryT(t2, 'person.level.all', 'unknown')).toBe('unknown');
  });
});
