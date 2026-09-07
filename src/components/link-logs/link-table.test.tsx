import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LinkTable } from './link-table';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('LinkTable tenant scope', () => {
  it('uses the dedicated owning-tenant column label in the all-tenant view', () => {
    render(
      <LinkTable
        logs={[]}
        showTenant
        onView={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'linkLogs.columns.tenant' })).toBeVisible();
    expect(screen.getAllByRole('columnheader')).toHaveLength(11);
  });
});
