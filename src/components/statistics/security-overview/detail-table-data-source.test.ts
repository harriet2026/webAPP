import { describe, it, expect } from 'vitest';

function extractDynamicKeys(row: Record<string, unknown>): string[] {
  return Object.keys(row).filter((k) => k !== 'date');
}

describe('DetailTable column extraction', () => {
  it('extracts total, block_rate, change, change_pct and series keys from detail_table row', () => {
    const row = { date: '2026-06-01', total: 100, block_rate: 98.5, change: 5, change_pct: 5.3, spam: 10, phishing: 3 };
    const keys = extractDynamicKeys(row);
    expect(keys).toContain('total');
    expect(keys).toContain('block_rate');
    expect(keys).toContain('change');
    expect(keys).toContain('change_pct');
    expect(keys).toContain('spam');
    expect(keys).not.toContain('date');
  });

  it('trend row (no total/block_rate/change) only has series keys', () => {
    const row = { date: '2026-06-01', spam: 10, phishing: 3 };
    const keys = extractDynamicKeys(row);
    expect(keys).not.toContain('total');
    expect(keys).not.toContain('block_rate');
  });
});
