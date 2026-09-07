import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect, type ReactNode } from 'react';
import { TenantSelector } from './tenant-selector';

const setSelectedTenant = vi.fn();
let mockSelectedTenantId: number | null = 999;
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, selectedTenantId: mockSelectedTenantId, setSelectedTenant }),
}));
vi.mock('@/lib/api/tenants', () => ({
  listTenants: vi.fn(),
  getTenant: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
}));
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));

import { getTenant, listTenants } from '@/lib/api/tenants';
import { toast } from 'sonner';
import { UnsavedGuardProvider, useUnsavedGuard } from '@/contexts/unsaved-guard-context';

function DirtyGuardControls({ onSave }: { onSave: () => Promise<void> }) {
  const {
    registerGuard,
    unregisterGuard,
    pendingNav,
    handleKeepEditing,
    handleSaveAndLeave,
  } = useUnsavedGuard();

  useEffect(() => {
    registerGuard({ isDirty: true, onSave });
    return unregisterGuard;
  }, [onSave, registerGuard, unregisterGuard]);

  return pendingNav ? (
    <>
      <button type="button" data-testid="cancel-tenant-switch" onClick={handleKeepEditing}>cancel</button>
      <button type="button" data-testid="save-tenant-switch" onClick={handleSaveAndLeave}>save</button>
    </>
  ) : null;
}

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TenantSelector', () => {
  beforeEach(() => {
    mockSelectedTenantId = 999;
    setSelectedTenant.mockReset();
    (toast.warning as unknown as ReturnType<typeof vi.fn>).mockReset();
    (listTenants as unknown as ReturnType<typeof vi.fn>).mockReset();
    (getTenant as unknown as ReturnType<typeof vi.fn>).mockReset();
    (getTenant as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  // GT-12021: Base UI's <Select.Value> renders the raw value unless the Root is
  // given an `items` map, so the trigger used to show the tenant id ("1")
  // instead of the tenant name.
  it('shows the tenant name, not the tenant id, for the selected tenant', async () => {
    mockSelectedTenantId = 1;
    (listTenants as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ id: 1, name: 'Acme' }],
      total: 1,
    });
    const { getByRole } = renderWithQuery(<TenantSelector />);
    await waitFor(() => expect(getByRole('combobox')).toHaveTextContent('Acme'));
    expect(getByRole('combobox')).not.toHaveTextContent(/^1$/);
  });

  it('shows the all-tenants label when no tenant is selected', async () => {
    mockSelectedTenantId = null;
    (listTenants as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ id: 1, name: 'Acme' }],
      total: 1,
    });
    const { getByRole } = renderWithQuery(<TenantSelector />);
    await waitFor(() => expect(getByRole('combobox')).toHaveTextContent('allTenants'));
  });

  it('requests active tenants only', async () => {
    (listTenants as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [{ id: 1, name: 'Acme' }], total: 1 });
    renderWithQuery(<TenantSelector />);
    await waitFor(() => expect(listTenants).toHaveBeenCalled());
    expect((listTenants as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ status: 'active' });
  });

  it('resets to all-tenants when the selected tenant is not active', async () => {
    (listTenants as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [{ id: 1, name: 'Acme' }], total: 1 });
    renderWithQuery(<TenantSelector />);
    await waitFor(() => expect(setSelectedTenant).toHaveBeenCalledWith(null));
    expect(toast.warning).toHaveBeenCalled();
  });

  it('guards a global tenant switch and supports cancel or save before switching', async () => {
    mockSelectedTenantId = 1;
    (listTenants as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ id: 1, name: 'Acme' }, { id: 2, name: 'Beta' }],
      total: 2,
    });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithQuery(
      <UnsavedGuardProvider>
        <TenantSelector />
        <DirtyGuardControls onSave={onSave} />
      </UnsavedGuardProvider>,
    );
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Acme'));

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByTestId('tenant-option-2'));
    expect(setSelectedTenant).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByTestId('cancel-tenant-switch'));
    expect(setSelectedTenant).not.toHaveBeenCalled();

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true'));
    await user.click(await screen.findByTestId('tenant-option-2'));
    fireEvent.click(await screen.findByTestId('save-tenant-switch'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(setSelectedTenant).toHaveBeenCalledWith(2);
  });
});
