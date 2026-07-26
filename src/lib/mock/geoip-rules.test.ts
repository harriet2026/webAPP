import { describe, expect, it } from 'vitest';
import { mockGeoIpRules, mockGeoIpRulesList } from './fixtures';

describe('mockGeoIpRules / mockGeoIpRulesList', () => {
  it('generates 35 rows matching the demo prototype (3 base + 32 generated)', () => {
    expect(mockGeoIpRules).toHaveLength(35);

    expect(mockGeoIpRules[0]).toEqual({
      id: 1,
      ip_range: '8.8.8.0/24',
      region_code: 'US',
      region_name: 'Google DNS',
      updated_at: '2024-01-15 14:30',
    });
    expect(mockGeoIpRules[1]).toEqual({
      id: 2,
      ip_range: '114.114.0.0/16',
      region_code: 'CN',
      region_name: '114DNS',
      updated_at: '2024-01-14 09:15',
    });
    expect(mockGeoIpRules[2]).toEqual({
      id: 3,
      ip_range: '103.0.0.0/8',
      region_code: 'SG',
      region_name: 'Singapore',
      updated_at: '2024-01-13 11:45',
    });

    // Spot-check a generated row (i = 10 -> region cycle index (10-4)%12 = 6 -> Australia).
    const row10 = mockGeoIpRules.find((r) => r.id === 10);
    expect(row10).toEqual({
      id: 10,
      ip_range: '60.30.0.0/16',
      region_code: 'AU',
      region_name: 'Australia ISP 10',
      updated_at: '2024-01-20 18:10',
    });
  });

  it('paginates 35 rows into 4 pages of default size 10', () => {
    const page1 = mockGeoIpRulesList({});
    expect(page1.total).toBe(35);
    expect(page1.page).toBe(1);
    expect(page1.page_size).toBe(10);
    expect(page1.items).toHaveLength(10);

    const page4 = mockGeoIpRulesList({ page: 4 });
    expect(page4.items).toHaveLength(5);
  });

  it('narrows results by region_code search (case-insensitive)', () => {
    const result = mockGeoIpRulesList({ q: 'US' });
    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBeLessThan(35);
    for (const item of result.items) {
      expect(
        item.ip_range.includes('US') ||
          item.region_code.toUpperCase().includes('US') ||
          item.region_name.toLowerCase().includes('us'),
      ).toBe(true);
    }
  });
});
