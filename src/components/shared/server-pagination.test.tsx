import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ServerPagination } from './server-pagination';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

describe('ServerPagination interaction semantics', () => {
  it('labels every icon-only navigation button', () => {
    const onPageChange = vi.fn();
    render(
      <ServerPagination
        page={2}
        pageSize={10}
        total={30}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'page:{"page":1}' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'prev' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'next' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'page:{"page":3}' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('keeps page-size and disabled navigation controls visible for an empty result', () => {
    render(
      <ServerPagination
        page={1}
        pageSize={100}
        total={0}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        pageSizeOptions={[50, 100, 200]}
        pageSizeTestId="link-logs-page-size"
        testId="link-logs-pagination"
      />,
    );

    expect(screen.getByTestId('link-logs-pagination')).toBeVisible();
    expect(screen.getByTestId('link-logs-page-size')).toHaveTextContent('100');
    expect(screen.getByRole('button', { name: 'prev' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();
    expect(screen.getByText('pageOf:{"current":1,"total":1}')).toBeVisible();
  });
});
