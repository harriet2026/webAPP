import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  groupFetch: vi.fn(),
  policyFetch: vi.fn(),
  switcherEnabled: false,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => namespace ? `${namespace}.${key}` : key,
}));

vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => ({ effectiveTenantId: 7 }),
}));

vi.mock('@/hooks/use-permission', () => ({
  usePermission: () => ({ isSystemAdmin: false, isTenantAdmin: true }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ capabilities: { ai: true }, switcherEnabled: mocks.switcherEnabled }),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

vi.mock('@/lib/api/use-api-error-message', () => ({
  useApiErrorMessage: () => (_error: unknown, fallback?: string) => fallback ?? 'common.error',
}));

vi.mock('@/lib/api/group-policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/group-policy')>();
  return {
    ...actual,
    listGroupPolicies: mocks.policyFetch,
    deleteGroupPolicy: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('@/components/security/groups/group-management-page', async () => {
  const { useQuery } = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    GroupManagementPage: () => {
      useQuery({ queryKey: ['groups', 7], queryFn: mocks.groupFetch });
      return null;
    },
  };
});

import { GroupPolicyPage } from './group-policy-page';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GroupPolicyPage />
    </QueryClientProvider>,
  );
}

describe('GT-13661 group policy page refresh feedback', () => {
  beforeEach(() => {
    mocks.groupFetch.mockReset();
    mocks.policyFetch.mockReset();
    mocks.switcherEnabled = false;
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it('tracks the visible group query and reports refresh completion', async () => {
    const refresh = deferred<unknown[]>();
    mocks.groupFetch
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(refresh.promise);
    renderPage();

    const button = await screen.findByTestId('group-policy-refresh');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).toHaveClass('animate-spin');
    fireEvent.click(button);
    expect(mocks.groupFetch).toHaveBeenCalledTimes(2);

    refresh.resolve([]);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('groupPolicy.refreshSuccess'));
    expect(button).not.toBeDisabled();
  });

  it('refreshes both visible cards when the policy card is enabled', async () => {
    const groupRefresh = deferred<unknown[]>();
    const policyRefresh = deferred<unknown[]>();
    mocks.switcherEnabled = true;
    mocks.groupFetch
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(groupRefresh.promise);
    mocks.policyFetch
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(policyRefresh.promise);
    renderPage();

    const button = await screen.findByTestId('group-policy-refresh');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => {
      expect(mocks.groupFetch).toHaveBeenCalledTimes(2);
      expect(mocks.policyFetch).toHaveBeenCalledTimes(2);
    });
    groupRefresh.resolve([]);
    policyRefresh.resolve([]);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('groupPolicy.refreshSuccess'));
  });

  it('shows an explicit error and allows retry after refresh failure', async () => {
    const refresh = deferred<unknown[]>();
    mocks.groupFetch
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(refresh.promise);
    renderPage();

    const button = await screen.findByTestId('group-policy-refresh');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    refresh.reject(new Error('network down'));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('groupPolicy.refreshFailed'));
    expect(button).not.toBeDisabled();
  });
});
