import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { TenantSelector } from './tenant-selector';

const setSelectedTenant = vi.fn();
let mockSelectedTenantId: number | null = 999;
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, selectedTenantId: mockSelectedTenantId, setSelectedTenant }),
}));
vi.mock('@/lib/api/tenants', () => ({
  listTenants: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
}));
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));

import { listTenants } from '@/lib/api/tenants';
import { toast } from 'sonner';

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
});
