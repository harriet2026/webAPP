import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuthFilters, type AuthFilterValues } from './auth-filters';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const EMPTY_FILTERS: AuthFilterValues = {
  keyword: '',
  domain: '',
  result: '',
  authProtocol: '',
  scene: '',
  failReason: '',
  tenantId: '',
};

describe('AuthFilters', () => {
  it('edits the draft without searching, then submits by button or Enter', () => {
    const onChange = vi.fn();
    const onSearch = vi.fn();

    render(
      <AuthFilters
        values={EMPTY_FILTERS}
        onChange={onChange}
        onSearch={onSearch}
        onReset={vi.fn()}
      />,
    );

    const keyword = screen.getByTestId('auth-filter-keyword');
    fireEvent.change(keyword, { target: { value: 'alice' } });

    expect(onChange).toHaveBeenCalledWith({ keyword: 'alice' });
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.keyDown(keyword, { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('auth-filter-search'));
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it('does not submit Enter while an IME composition is active', () => {
    const onSearch = vi.fn();
    render(
      <AuthFilters
        values={EMPTY_FILTERS}
        onChange={vi.fn()}
        onSearch={onSearch}
        onReset={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('auth-filter-keyword'), {
      key: 'Enter',
      isComposing: true,
    });

    expect(onSearch).not.toHaveBeenCalled();
  });
});
