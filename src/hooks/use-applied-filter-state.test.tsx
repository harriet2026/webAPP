import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAppliedFilterState } from './use-applied-filter-state';

interface TestFilters {
  keyword: string;
  result: string;
}

const EMPTY_FILTERS: TestFilters = { keyword: '', result: '' };

describe('useAppliedFilterState', () => {
  it('keeps draft edits out of the applied query state until apply', () => {
    const { result } = renderHook(() =>
      useAppliedFilterState<TestFilters>({ initialValue: EMPTY_FILTERS }),
    );

    act(() => {
      result.current.setDraft({ keyword: 'alice', result: 'failed' });
    });

    expect(result.current.draft).toEqual({ keyword: 'alice', result: 'failed' });
    expect(result.current.applied).toEqual(EMPTY_FILTERS);
    expect(result.current.hasPendingChanges).toBe(true);

    act(() => {
      result.current.apply();
    });

    expect(result.current.applied).toEqual({ keyword: 'alice', result: 'failed' });
    expect(result.current.hasPendingChanges).toBe(false);
  });

  it('resets draft and applied state together', () => {
    const { result } = renderHook(() =>
      useAppliedFilterState<TestFilters>({ initialValue: EMPTY_FILTERS }),
    );

    act(() => {
      result.current.setDraft({ keyword: 'pending', result: '' });
      result.current.apply();
    });
    act(() => {
      result.current.reset({ keyword: '', result: 'success' });
    });

    expect(result.current.draft).toEqual({ keyword: '', result: 'success' });
    expect(result.current.applied).toEqual({ keyword: '', result: 'success' });
    expect(result.current.hasPendingChanges).toBe(false);
  });
});
