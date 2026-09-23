import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SenderFilterPage } from './SenderFilterPage';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  listRules: vi.fn(),
  listGroups: vi.fn(),
  effectiveTenantId: null as number | null,
  translate: (key: string) => key,
}));

vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: false, user: { role: 'tenant_admin' } }),
}));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mocks.apiRequest, effectiveTenantId: mocks.effectiveTenantId }),
}));
vi.mock('@/lib/api/sender-filter', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/sender-filter')>();
  return {
    ...actual,
    listSenderFilterRules: mocks.listRules,
    listSenderFilterGroups: mocks.listGroups,
  };
});
vi.mock('@/lib/api/use-api-error-message', () => ({
  useApiErrorMessage: () => (error: Error) => error.message,
}));
vi.mock('./ModuleMasterSwitch', () => ({
  ModuleMasterSwitch: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./sender-filter/SenderFilterTable', () => ({
  SenderFilterTable: () => <div data-testid="sender-filter-table" />,
}));
vi.mock('./sender-filter/SenderFilterDrawer', () => ({
  SenderFilterDrawer: () => null,
}));
vi.mock('@/components/rules/RuleImportExportDialog', () => ({
  RuleImportExportDialog: () => null,
}));

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.listRules.mockReset();
  mocks.listGroups.mockReset();
  mocks.effectiveTenantId = null;
  mocks.listGroups.mockResolvedValue({ senderGroups: [], ipGroups: [] });
});

describe('SenderFilterPage list load guard', () => {
  it('shows a retry-only error state instead of an empty table, then recovers', async () => {
    mocks.listRules
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue({ items: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <SenderFilterPage embedded />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('sender-filter-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('sender-filter-table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sender-filter-load-retry'));

    await waitFor(() => expect(screen.getByTestId('sender-filter-table')).toBeInTheDocument());
    expect(screen.queryByTestId('sender-filter-load-error')).not.toBeInTheDocument();
    expect(mocks.listRules).toHaveBeenCalledTimes(2);
  });

  it('treats a failed group projection as a page load failure, then retries both inputs', async () => {
    mocks.listRules.mockResolvedValue({ items: [] });
    mocks.listGroups
      .mockRejectedValueOnce(new Error('group lookup unavailable'))
      .mockResolvedValue({ senderGroups: [], ipGroups: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <SenderFilterPage embedded />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('sender-filter-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('sender-filter-table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sender-filter-load-retry'));

    await waitFor(() => expect(screen.getByTestId('sender-filter-table')).toBeInTheDocument());
    expect(mocks.listRules).toHaveBeenCalledTimes(2);
    expect(mocks.listGroups).toHaveBeenCalledTimes(2);
  });

  it('refetches rules and groups when the effective tenant changes', async () => {
    mocks.effectiveTenantId = 101;
    mocks.listRules.mockResolvedValue({ items: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (
      <QueryClientProvider client={client}>
        <SenderFilterPage embedded />
      </QueryClientProvider>
    );
    const { rerender } = render(view);

    await waitFor(() => expect(mocks.listRules).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.listGroups).toHaveBeenCalledTimes(1));

    mocks.effectiveTenantId = 202;
    rerender(
      <QueryClientProvider client={client}>
        <SenderFilterPage embedded />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mocks.listRules).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.listGroups).toHaveBeenCalledTimes(2));
  });
});
