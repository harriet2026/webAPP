import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';

const access = vi.fn();
vi.mock('./spoofing-access', () => ({ useSpoofingAccess: () => access() }));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn(), effectiveTenantId: 7 }),
}));
vi.mock('@/lib/api/use-api-error-message', () => ({ useApiErrorMessage: () => () => 'error' }));
vi.mock('@/lib/api/spoofing-detection', () => ({
  listSpoofPersons: vi.fn(async () => ({ items: [], total: 0, page: 1, page_size: 100 })),
  deleteSpoofPerson: vi.fn(),
  setSpoofPersonObserve: vi.fn(),
  bulkSpoofPersons: vi.fn(),
}));
vi.mock('./spoofing-person-form', () => ({ SpoofingPersonForm: () => null }));
vi.mock('./spoofing-batch-dialog', () => ({ SpoofingBatchDialog: () => null }));

import { SpoofingPersonsPage } from './spoofing-persons-page';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <SpoofingPersonsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('SpoofingPersonsPage permissions', () => {
  beforeEach(() => {
    access.mockReturnValue({ status: 'ready', canView: true, canEdit: false, readOnly: true });
  });

  it('disables protected-person creation for an auditor', () => {
    renderPage();
    expect(screen.getByTestId('spoof-person-add')).toBeDisabled();
  });

  it('enables protected-person creation for tenant operations', () => {
    access.mockReturnValue({ status: 'ready', canView: true, canEdit: true, readOnly: false });
    renderPage();
    expect(screen.getByTestId('spoof-person-add')).toBeEnabled();
  });
});
