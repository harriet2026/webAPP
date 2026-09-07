import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

import { ProductFormSwitcher } from './product-form-switcher';
import { UnsavedGuardProvider, useUnsavedGuard } from '@/contexts/unsaved-guard-context';

const mocks = vi.hoisted(() => ({
  setViewer: vi.fn(),
  setSelectedTenant: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({
    switcherEnabled: true,
    effectiveForm: 'ai-multi',
    setFormOverride: vi.fn(),
    viewer: 'tenant',
    setViewer: mocks.setViewer,
  }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    isSystemAdmin: true,
    selectedTenantId: 7,
    setSelectedTenant: mocks.setSelectedTenant,
  }),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('./viewer-switcher-tenant-dialog', () => ({
  ViewerSwitcherTenantDialog: () => null,
}));

vi.mock('@/lib/mock/storage', () => ({
  isMockEnabled: () => false,
  subscribeMockEnabled: () => () => {},
  toggleMock: vi.fn(),
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

describe('ProductFormSwitcher', () => {
  beforeEach(() => {
    mocks.setViewer.mockReset();
    mocks.setSelectedTenant.mockReset();
  });

  it('clears the selected tenant before returning a system administrator to platform view', () => {
    render(<ProductFormSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: 'platform' }));

    expect(mocks.setSelectedTenant).toHaveBeenCalledWith(null);
    expect(mocks.setViewer).toHaveBeenCalledWith('platform');
  });

  it('keeps tenant and viewer unchanged until a dirty edit is cancelled or saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <UnsavedGuardProvider>
        <ProductFormSwitcher />
        <DirtyGuardControls onSave={onSave} />
      </UnsavedGuardProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'platform' }));
    expect(mocks.setSelectedTenant).not.toHaveBeenCalled();
    expect(mocks.setViewer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'keep-editing' }));
    expect(mocks.setSelectedTenant).not.toHaveBeenCalled();
    expect(mocks.setViewer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'platform' }));
    fireEvent.click(screen.getByRole('button', { name: 'save-and-leave' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(mocks.setSelectedTenant).toHaveBeenCalledWith(null);
    expect(mocks.setViewer).toHaveBeenCalledWith('platform');
    expect(mocks.setSelectedTenant.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.setViewer.mock.invocationCallOrder[0]);
  });

  it('opens the HTML Spec index in a new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ProductFormSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: 'htmlSpec' }));

    expect(openSpy).toHaveBeenCalledWith(
      '/html-spec/index.html',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });
});
