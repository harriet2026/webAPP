import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBar } from './search-bar';
import { parseQuery } from './lib/disposal-api';

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

const mockedParseQuery = vi.mocked(parseQuery);

function renderSearchBar(
  overrides: Partial<React.ComponentProps<typeof SearchBar>> = {},
) {
  const props: React.ComponentProps<typeof SearchBar> = {
    onAiParsed: vi.fn(),
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
    expect(submit).toHaveClass(
      'h-9',
      'gap-1.5',
      'px-4',
      'disabled:bg-muted',
      'disabled:opacity-100',
    );
    fireEvent.change(screen.getByTestId('disposal-natural-language-input'), {
      target: { value: 'Q2 report' },
    });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(props.onSearch).toHaveBeenCalledWith('Q2 report');
    expect(toastSuccess).toHaveBeenCalledWith('emailDisposal.search.searchApplied');
  });

  it('uses one compact visual rhythm for the search action group', () => {
    renderSearchBar();

    expect(screen.getByTestId('disposal-natural-language-input')).toHaveClass('h-9');
    for (const testId of [
      'disposal-search-reset',
      'disposal-template-save',
      'disposal-filters-toggle',
    ]) {
      const button = screen.getByTestId(testId);
      expect(button).toHaveClass('h-9', 'gap-1.5', 'px-3');
      expect(button.querySelector('svg')).not.toHaveClass('mr-2', 'ml-2');
    }
    expect(screen.getByTestId('disposal-filters-toggle')).toHaveClass(
      'min-w-[7.875rem]',
    );
  });

  it('clears the local query and every parent filter when reset is clicked', () => {
    const { props } = renderSearchBar();
    const input = screen.getByTestId('disposal-natural-language-input');
    fireEvent.change(input, { target: { value: 'phishing' } });

    fireEvent.click(screen.getByTestId('disposal-search-reset'));

    expect(input).toHaveValue('');
    expect(props.onAiParsed).toHaveBeenCalledWith(null, '', '');
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

  // 现存 bug 的回归用例：search-bar 此前把 parse-query 的结构化结果 String()
  // 拍平，in/between 的数组值变成逗号拼接字符串，导致后端 400。修复后这里必须
  // 原样透传结构化 filter，不做任何拍平。
  it('passes the parsed structured filter through untouched, without flattening array values to strings', async () => {
    const structuredFilter = {
      operator: 'AND' as const,
      groups: [
        {
          operator: 'AND' as const,
          conditions: [
            { field: 'display_status', op: 'in' as const, value: ['delivered', 'rejected'] },
          ],
        },
      ],
    };
    mockedParseQuery.mockResolvedValue({ filter: structuredFilter, summary: 'AI 摘要', source: 'llm' });
    const { props } = renderSearchBar({ aiEnabled: true });

    fireEvent.change(screen.getByTestId('disposal-natural-language-input'), {
      target: { value: '上周被召回的邮件' },
    });
    fireEvent.click(screen.getByTestId('disposal-ai-parse'));

    await waitFor(() => {
      expect(props.onAiParsed).toHaveBeenCalledWith(
        structuredFilter,
        'AI 摘要',
        '上周被召回的邮件',
      );
    });
    // 值必须仍是数组，不是拍平后的 "delivered,rejected" 字符串。
    const [passedFilter] = (props.onAiParsed as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(Array.isArray(passedFilter.groups[0].conditions[0].value)).toBe(true);
  });

  it('reports which query produced the AI conditions so the page can suppress a default subject', async () => {
    mockedParseQuery.mockResolvedValue({
      filter: {
        operator: 'AND',
        groups: [
          {
            operator: 'AND',
            conditions: [
              { field: 'sender', op: 'starts_with', value: '192.168' },
              { field: 'email_type', op: 'eq', value: 'advertisement' },
            ],
          },
        ],
      },
      summary: 'AI 摘要',
      source: 'llm',
    });
    const { props } = renderSearchBar({ aiEnabled: true });
    const input = screen.getByTestId('disposal-natural-language-input');

    fireEvent.change(input, { target: { value: '192.168 段营销邮件' } });
    fireEvent.click(screen.getByTestId('disposal-ai-parse'));
    await waitFor(() => {
      expect(props.onAiParsed).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('disposal-search-submit'));
    expect(props.onAiParsed).toHaveBeenLastCalledWith(
      expect.any(Object),
      'AI 摘要',
      '192.168 段营销邮件',
    );
    expect(props.onSearch).toHaveBeenLastCalledWith('192.168 段营销邮件');

    // AI 结果只对应解析时的输入；用户随后改写查询，应恢复普通主题搜索语义。
    fireEvent.change(input, { target: { value: '192.168 段退信' } });
    fireEvent.click(screen.getByTestId('disposal-search-submit'));
    expect(props.onSearch).toHaveBeenLastCalledWith('192.168 段退信');
  });

  it('reports a null filter to the parent on AI parse failure', async () => {
    mockedParseQuery.mockRejectedValue(new Error('boom'));
    const { props } = renderSearchBar({ aiEnabled: true });

    fireEvent.change(screen.getByTestId('disposal-natural-language-input'), {
      target: { value: 'phishing last week' },
    });
    fireEvent.click(screen.getByTestId('disposal-ai-parse'));

    await waitFor(() => {
      expect(props.onAiParsed).toHaveBeenCalledWith(null, '', '');
    });
  });
});
