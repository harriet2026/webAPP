import { describe, expect, it } from 'vitest';
import { localizedGeoRegionName } from './geo-region-name';

describe('localizedGeoRegionName', () => {
  it('localizes a canonical persisted country name to the requested locale', () => {
    expect(localizedGeoRegionName('zh', 'DE', 'Germany')).toBe('德国');
    expect(localizedGeoRegionName('en', 'DE', '德国')).toBe('Germany');
  });

  it('preserves operator-defined region labels', () => {
    expect(localizedGeoRegionName('zh', 'CN', '总部机房')).toBe('总部机房');
  });

  it('falls back to the persisted name without a usable ISO country code', () => {
    expect(localizedGeoRegionName('zh', '', 'Germany')).toBe('Germany');
    expect(localizedGeoRegionName('zh', 'not-a-code', 'Germany')).toBe('Germany');
  });
});
