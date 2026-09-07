import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImpersonationBanner } from './impersonation-banner';
import { UnsavedGuardProvider, useUnsavedGuard } from '@/contexts/unsaved-guard-context';

const mocks = vi.hoisted(() => ({
  setSelectedTenant: vi.fn(),
  setViewer: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    isSystemAdmin: true,
    selectedTenantId: 7,
    setSelectedTenant: mocks.setSelectedTenant,
  }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ viewer: 'tenant', setViewer: mocks.setViewer }),
}));

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn().mockResolvedValue({ items: [{ id: 7, name: 'Acme' }] }),
}));

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
      <button type="button" onClick={handleKeepEditing}>keep-editing</button>
      <button type="button" onClick={handleSaveAndLeave}>save-and-leave</button>
    </>
  ) : null;
}

describe('ImpersonationBanner unsaved guard', () => {
  beforeEach(() => {
    mocks.setSelectedTenant.mockReset();
    mocks.setViewer.mockReset();
  });

  it('does not partially exit impersonation before a dirty edit is saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <UnsavedGuardProvider>
          <ImpersonationBanner />
          <DirtyGuardControls onSave={onSave} />
        </UnsavedGuardProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'header.exitImpersonation' }));
    expect(mocks.setSelectedTenant).not.toHaveBeenCalled();
    expect(mocks.setViewer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'keep-editing' }));
    expect(mocks.setSelectedTenant).not.toHaveBeenCalled();
    expect(mocks.setViewer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'header.exitImpersonation' }));
    fireEvent.click(screen.getByRole('button', { name: 'save-and-leave' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(mocks.setSelectedTenant).toHaveBeenCalledWith(null);
    expect(mocks.setViewer).toHaveBeenCalledWith('platform');
    expect(mocks.setSelectedTenant.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.setViewer.mock.invocationCallOrder[0]);
  });
});
