import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import zh from '../../messages/zh.json';

// GT-11610: the email-size (storage_size) advanced filter rendered a bare,
// unit-less number in both the value input and the selected-condition chip, so
// operators had no idea what unit they were entering. The value is now entered
// in KB (shown as a "KB" suffix) and converted to the backend's byte column at
// the send boundary (useFilterMerger). These tests pin all three behaviours:
// the input suffix, the chip suffix, and the KB->bytes conversion.
//
// The next-intl mock resolves against the REAL zh catalog (returning the raw
// "ns.key" path on a miss, mimicking next-intl) so a missing `sizeUnit` key
// fails here instead of silently leaking into the UI.
function dig(obj: unknown, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, string | number>) => {
    const root = ns ? dig(zh, ns) : zh;
    const val = dig(root, key);
    if (typeof val !== 'string') return ns ? `${ns}.${key}` : key;
    return params
      ? Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), val)
      : val;
  },
  useLocale: () => 'zh',
}));

import { SelectedConditions } from '@/components/email-disposal/selected-conditions';
import { AdvancedFilters } from '@/components/email-disposal/advanced-filters';
import { useFilterMerger } from '@/components/email-disposal/hooks/use-filter-merger';
import type { AdvancedFilter } from '@/types/log';
import type { DisposalQuickFilter } from '@/types/email-disposal';

const emptyQuick: DisposalQuickFilter = {};

function sizeFilter(op: string, value: unknown): AdvancedFilter {
  return {
    operator: 'AND',
    groups: [{ operator: 'AND', conditions: [{ field: 'storage_size', op: op as never, value: value as never }] }],
  };
}

describe('email-size filter unit (GT-11610)', () => {
  it('selected-condition chip appends the KB unit to the size value', () => {
    render(
      <SelectedConditions
        quick={emptyQuick}
        advanced={sizeFilter('gt', '111')}
        aiConditions={[]}
        onClearAll={() => {}}
      />,
    );
    // "邮件大小 > 111 KB" — value must carry the KB unit.
    expect(screen.getByText(/邮件大小\s*>\s*111\s*KB/)).toBeTruthy();
  });

  it('size value input renders a KB unit suffix', () => {
    render(<AdvancedFilters value={sizeFilter('gt', '111')} onChange={() => {}} />);
    // Advanced panel is collapsed by default; open it to render the value input.
    fireEvent.click(screen.getByText('更多筛选条件'));
    const suffixes = screen.getAllByText('KB');
    expect(suffixes.length).toBeGreaterThan(0);
  });

  it('does not attach a unit to a non-size field chip', () => {
    render(
      <SelectedConditions
        quick={emptyQuick}
        advanced={{ operator: 'AND', groups: [{ operator: 'AND', conditions: [{ field: 'subject', op: 'eq' as never, value: 'hello' }] }] }}
        aiConditions={[]}
        onClearAll={() => {}}
      />,
    );
    expect(screen.queryByText(/KB/)).toBeNull();
  });
});

describe('useFilterMerger KB->bytes conversion (GT-11610)', () => {
  function mergeSize(op: string, value: unknown) {
    const { result } = renderHook(() => useFilterMerger());
    const merged = result.current.merge(emptyQuick, sizeFilter(op, value), []);
    // No quick/AI conditions, so the single (converted) advanced group is the
    // only group present.
    return merged.groups[merged.groups.length - 1].conditions[0].value;
  }

  it('converts a scalar KB value to bytes', () => {
    expect(mergeSize('gt', '111')).toBe(111 * 1024);
  });

  it('converts both bounds of a between range', () => {
    expect(mergeSize('between', ['1', '2'])).toEqual([1024, 2048]);
  });

  it('converts every element of an in list', () => {
    expect(mergeSize('in', ['1', '2', '3'])).toEqual([1024, 2048, 3072]);
  });

  it('rounds fractional KB to whole bytes', () => {
    expect(mergeSize('gte', '1.5')).toBe(1536);
  });

  it('leaves an empty value untouched (no NaN)', () => {
    expect(mergeSize('eq', '')).toBe('');
  });

  it('does not convert a non-size numeric field', () => {
    const { result } = renderHook(() => useFilterMerger());
    const merged = result.current.merge(
      emptyQuick,
      { operator: 'AND', groups: [{ operator: 'AND', conditions: [{ field: 'tid', op: 'eq' as never, value: '111' }] }] },
      [],
    );
    expect(merged.groups[merged.groups.length - 1].conditions[0].value).toBe('111');
  });
});
