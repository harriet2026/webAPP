import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductFormSwitcher } from './product-form-switcher';

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
});
