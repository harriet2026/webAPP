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
});
