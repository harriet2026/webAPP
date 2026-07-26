import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FramedPage, PageBody, PageHeader, PageShell } from './page-shell';

describe('framed page layout', () => {
  it('preserves the app-shell gutter and separates the header from the page body', () => {
    render(
      <PageShell variant="framed" data-testid="page-frame">
        <PageHeader
          variant="framed"
          title="System status"
          description="Health overview"
          data-testid="page-header"
        />
        <PageBody data-testid="page-body">Dashboard content</PageBody>
      </PageShell>,
    );

    expect(screen.getByTestId('page-frame')).toHaveAttribute('data-layout', 'framed');
    expect(screen.getByTestId('page-frame')).toHaveClass(
      'min-h-[calc(100dvh-7.5rem)]',
      'bg-gray-100',
      'dark:bg-gray-900',
    );

    expect(screen.getByTestId('page-header')).toHaveClass('m-0', 'px-6', 'py-4');
    expect(screen.getByTestId('page-header')).not.toHaveClass('-mx-8', '-mt-8');

    expect(screen.getByTestId('page-body')).toHaveClass(
      'space-y-6',
      'bg-gray-100',
      'p-6',
      'dark:bg-gray-900',
    );
  });

  it('offers a route-level component with the demo title typography and stable slots', () => {
    render(
      <FramedPage
        title="System status"
        description="Health overview"
        actions={<button type="button">Refresh</button>}
        data-testid="system-status-page"
      >
        Dashboard content
      </FramedPage>,
    );

    const page = screen.getByTestId('system-status-page');
    const header = screen.getByTestId('system-status-page-header');
    const body = screen.getByTestId('system-status-page-body');
    const title = screen.getByRole('heading', { level: 1 });
    const description = screen.getByText('Health overview');
    const actions = screen.getByRole('button', { name: 'Refresh' }).parentElement;

    expect(page).toHaveAttribute('data-layout', 'framed');
    expect(page).toHaveAttribute('data-slot', 'page-shell');
    expect(header).toHaveAttribute('data-slot', 'page-header');
    expect(header).toHaveClass(
      'border-gray-200',
      'bg-white',
      'px-6',
      'py-4',
      'dark:border-gray-800',
      'dark:bg-gray-950',
    );
    expect(title).toHaveClass(
      'text-xl',
      'font-bold',
      'text-gray-900',
      'dark:text-gray-100',
    );
    expect(title).not.toHaveClass('tracking-tight');
    expect(description).toHaveClass(
      'text-sm',
      'leading-5',
      'font-normal',
      'text-gray-500',
      'dark:text-gray-400',
    );
    expect(actions).toHaveAttribute('data-slot', 'page-header-actions');
    expect(actions).toHaveClass('gap-3', 'self-end', '@[560px]:self-auto');
    expect(body).toHaveAttribute('data-slot', 'page-body');
    expect(body).toHaveClass('space-y-6', 'bg-gray-100', 'p-6');
  });
});
