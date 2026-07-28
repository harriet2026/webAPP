import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from '@/components/ui/input';
import { SearchFilterPanel } from './search-filter-panel';

describe('SearchFilterPanel', () => {
  it('renders page-defined conditions and centralizes Search, Reset, and Enter', () => {
    const onSearch = vi.fn();
    const onReset = vi.fn();

    render(
      <SearchFilterPanel
        testId="filters"
        conditions={[
          {
            key: 'keyword',
            label: 'Keyword',
            control: <Input data-testid="keyword" />,
          },
        ]}
        onSearch={onSearch}
        onReset={onReset}
        searchLabel="Search"
        resetLabel="Reset"
        searchTestId="search"
        resetTestId="reset"
      />,
    );

    expect(screen.getByTestId('filters')).toBeInTheDocument();
    expect(screen.getByText('Keyword')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('keyword'), {
      target: { value: 'draft-only' },
    });
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByTestId('keyword'), { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('search'));
    fireEvent.click(screen.getByTestId('reset'));
    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('does not apply Enter during IME composition or after a child handled it', () => {
    const onSearch = vi.fn();
    render(
      <SearchFilterPanel
        toolbar={
          <Input
            data-testid="custom-input"
            onKeyDown={(event) => event.preventDefault()}
          />
        }
        conditions={[
          {
            key: 'keyword',
            control: <Input data-testid="ime-input" />,
          },
        ]}
        actionsPlacement="none"
        onSearch={onSearch}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('ime-input'), {
      key: 'Enter',
      isComposing: true,
    });
    fireEvent.keyDown(screen.getByTestId('custom-input'), { key: 'Enter' });

    expect(onSearch).not.toHaveBeenCalled();
  });
});
