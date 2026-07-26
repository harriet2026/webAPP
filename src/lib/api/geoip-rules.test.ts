import { describe, it, expect } from 'vitest';
import { filterGeoCountries, geoCountryDisplayName, COMMON_GEO_COUNTRY_CODES, type GeoCountry } from './geoip-rules';

// GT-12114 Q-03：常用20国默认 + 全量搜索
describe('filterGeoCountries', () => {
  const all: GeoCountry[] = [
    { code: 'CN', name_zh: '中国', name_en: 'China' },
    { code: 'US', name_zh: '美国', name_en: 'United States' },
    { code: 'BR', name_zh: '巴西', name_en: 'Brazil' },
    { code: 'BE', name_zh: '比利时', name_en: 'Belgium' },
  ];

  it('无搜索词时只按常用顺序返回常用国家', () => {
    const out = filterGeoCountries(all, '');
    expect(out.map((c) => c.code)).toEqual(
      COMMON_GEO_COUNTRY_CODES.filter((c) => ['CN', 'US', 'BR'].includes(c)),
    );
    // BE 不在常用列表 → 默认不显示
    expect(out.find((c) => c.code === 'BE')).toBeUndefined();
  });

  it('搜索词按代码/中文名/英文名过滤全量（含非常用国家）', () => {
    expect(filterGeoCountries(all, 'be').map((c) => c.code)).toEqual(['BE']);
    expect(filterGeoCountries(all, '比利时').map((c) => c.code)).toEqual(['BE']);
    expect(filterGeoCountries(all, 'belg').map((c) => c.code)).toEqual(['BE']);
    expect(filterGeoCountries(all, 'zzz')).toEqual([]);
  });

  it('展示名按 locale 取中/英文', () => {
    expect(geoCountryDisplayName(all[0], 'zh')).toBe('中国');
    expect(geoCountryDisplayName(all[0], 'en')).toBe('China');
    expect(geoCountryDisplayName(all[0], 'th')).toBe('China');
  });
});
