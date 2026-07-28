'use client';

import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';

type FilterComparator<T> = (draft: T, applied: T) => boolean;

interface UseAppliedFilterStateOptions<T> {
  initialValue: T | (() => T);
  isEqual?: FilterComparator<T>;
}

/**
 * Keeps editable filter controls separate from the values that drive a query.
 *
 * The hook is intentionally headless: each page keeps its own fields, layout,
 * validation, and buttons while sharing the same draft → apply/reset protocol.
 */
export function useAppliedFilterState<T>({
  initialValue,
  isEqual = defaultFilterComparator,
}: UseAppliedFilterStateOptions<T>) {
  const [state, setState] = useState(() => {
    const initial = typeof initialValue === 'function'
      ? (initialValue as () => T)()
      : initialValue;
    return { draft: initial, applied: initial, initial };
  });
  const { draft, applied } = state;

  const hasPendingChanges = useMemo(
    () => !isEqual(draft, applied),
    [applied, draft, isEqual],
  );

  const apply = useCallback(() => {
    setState((current) => ({ ...current, applied: current.draft }));
  }, []);

  const reset = useCallback((nextValue?: T) => {
    setState((current) => {
      const next = nextValue ?? current.initial;
      return { ...current, draft: next, applied: next };
    });
  }, []);

  const updateDraft = useCallback((next: SetStateAction<T>) => {
    setState((current) => ({
      ...current,
      draft: typeof next === 'function'
        ? (next as (previous: T) => T)(current.draft)
        : next,
    }));
  }, []);

  return {
    draft,
    applied,
    hasPendingChanges,
    setDraft: updateDraft,
    apply,
    reset,
  };
}

function defaultFilterComparator<T>(draft: T, applied: T): boolean {
  return JSON.stringify(draft) === JSON.stringify(applied);
}

/**
 * Shared Enter-key guard for filter inputs.
 *
 * It ignores IME composition and non-text controls so choosing an option or
 * toggling a checkbox never unexpectedly submits the surrounding filter area.
 */
export function shouldApplyFiltersOnEnter(
  event: KeyboardEvent<HTMLElement>,
): boolean {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return false;

  const target = event.target;
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLTextAreaElement)
  ) {
    return false;
  }

  if (target instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit'].includes(target.type);
  }

  return true;
}
