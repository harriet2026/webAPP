import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBar } from './search-bar';

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translate = (key: string) => `${namespace}.${key}`;
    translate.raw = (key: string) => key === 'samples' ? ['sample query'] : [];
    return translate;
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    warning: vi.fn(),
  },
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

vi.mock('./lib/disposal-api', () => ({
  parseQuery: vi.fn(),
}));

function renderSearchBar(
  overrides: Partial<React.ComponentProps<typeof SearchBar>> = {},
) {
  const props: React.ComponentProps<typeof SearchBar> = {
    onAiConditions: vi.fn(),
    onSearch: vi.fn(),
    onReset: vi.fn(),
    aiEnabled: false,
    ...overrides,
  };
  return { props, ...render(<SearchBar {...props} />) };
}

describe('SearchBar actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables empty search and applies a non-empty query with feedback', () => {
    const { props } = renderSearchBar();
    const submit = screen.getByTestId('disposal-search-submit');

    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('disposal-natural-language-input'), {
      target: { value: 'Q2 report' },
    });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(props.onSearch).toHaveBeenCalledWith('Q2 report');
    expect(toastSuccess).toHaveBeenCalledWith('emailDisposal.search.searchApplied');
  });

  it('clears the local query and every parent filter when reset is clicked', () => {
    const { props } = renderSearchBar();
    const input = screen.getByTestId('disposal-natural-language-input');
    fireEvent.change(input, { target: { value: 'phishing' } });

    fireEvent.click(screen.getByTestId('disposal-search-reset'));

    expect(input).toHaveValue('');
    expect(props.onAiConditions).toHaveBeenCalledWith([], '');
    expect(props.onReset).toHaveBeenCalledOnce();
    expect(toastSuccess).toHaveBeenCalledWith('emailDisposal.search.resetDone');
  });

  it('saves directly when there are no existing templates', () => {
    const onSaveTemplate = vi.fn();
    renderSearchBar({ onSaveTemplate });

    fireEvent.click(screen.getByTestId('disposal-template-save'));
    expect(onSaveTemplate).toHaveBeenCalledOnce();
  });

  it('opens the unified template menu and supports save and load actions', async () => {
    const onSaveTemplate = vi.fn();
    const onLoadTemplate = vi.fn();
    renderSearchBar({
      templates: [{ id: 'template-1', name: 'Finance search' }],
      onSaveTemplate,
      onLoadTemplate,
    });

    fireEvent.click(screen.getByTestId('disposal-template-menu'));
    await waitFor(() => {
      expect(screen.getByText('Finance search')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('disposal-template-save'));
    expect(onSaveTemplate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('disposal-template-menu'));
    await waitFor(() => {
      expect(screen.getByTestId('disposal-template-load-template-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('disposal-template-load-template-1'));
    expect(onLoadTemplate).toHaveBeenCalledWith('template-1');
  });

  it('shows the demo-style filter toggle and reports its expanded state', () => {
    const onToggleFilters = vi.fn();
    const { rerender, props } = renderSearchBar({ onToggleFilters });
    const toggle = screen.getByTestId('disposal-filters-toggle');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('emailDisposal.search.advancedFilter');
    fireEvent.click(toggle);
    expect(onToggleFilters).toHaveBeenCalledOnce();

    rerender(<SearchBar {...props} filtersExpanded />);
    expect(screen.getByTestId('disposal-filters-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('disposal-filters-toggle')).toHaveTextContent('emailDisposal.search.collapse');
  });

  it('gives sample-query links pointer-compatible gentle feedback', () => {
    renderSearchBar();
    const sample = screen.getByTestId('disposal-search-sample-1');

    fireEvent.pointerEnter(sample, { pointerType: 'mouse' });
    expect(sample).toHaveAttribute('data-hovered', 'true');

    fireEvent.pointerLeave(sample, { pointerType: 'mouse' });
    expect(sample).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(sample, { pointerType: 'touch' });
    expect(sample).not.toHaveAttribute('data-hovered');
  });
});
