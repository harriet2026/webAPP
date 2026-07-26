import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModuleMasterSwitch } from './ModuleMasterSwitch';

const mocks = vi.hoisted(() => ({
  authState: {
    isSystemAdmin: true,
    selectedTenantId: 7 as number | null,
    user: { role: 'system_admin' },
  },
  multiTenant: true,
  viewer: 'platform' as 'platform' | 'tenant',
  apiRequest: vi.fn(),
  getSecurityModules: vi.fn(),
  setSecurityModuleEnabled: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => mocks.authState,
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ capabilities: { multiTenant: mocks.multiTenant }, viewer: mocks.viewer }),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mocks.apiRequest }),
}));

vi.mock('@/lib/api/security-modules', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/security-modules')>();
  return {
    ...actual,
    getSecurityModules: mocks.getSecurityModules,
    setSecurityModuleEnabled: mocks.setSecurityModuleEnabled,
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock('./PipelinePanelHeader', () => ({
  PipelinePanelHeader: ({
    enabled,
    disabled,
    switchTitle,
    onToggle,
    children,
  }: {
    enabled: boolean;
    disabled: boolean;
    switchTitle?: string;
    onToggle: (enabled: boolean) => void;
    children: React.ReactNode;
  }) => (
    <div>
      <button
        data-testid="master-switch-toggle"
        data-enabled={enabled}
        disabled={disabled}
        title={switchTitle}
        onClick={() => onToggle(false)}
      >
        toggle
      </button>
      {children}
    </div>
  ),
}));

beforeEach(() => {
  Object.assign(mocks.authState, {
    isSystemAdmin: true,
    selectedTenantId: 7,
    user: { role: 'system_admin' },
  });
  mocks.multiTenant = true;
  mocks.viewer = 'platform';
  mocks.apiRequest.mockReset();
  mocks.getSecurityModules.mockReset();
  mocks.getSecurityModules.mockResolvedValue({});
  mocks.setSecurityModuleEnabled.mockReset();
  mocks.setSecurityModuleEnabled.mockResolvedValue(undefined);
  mocks.toastError.mockReset();
});

describe('ModuleMasterSwitch mixed scope permissions', () => {
  it('keeps stage-1 global controls locked for tenant_admin', () => {
    Object.assign(mocks.authState, {
      isSystemAdmin: false,
      selectedTenantId: 7,
      user: { role: 'tenant_admin' },
    });
    render(<ModuleMasterSwitch page="ip_filter"><div>content</div></ModuleMasterSwitch>);

    expect(screen.getByTestId('master-switch-toggle')).toBeDisabled();
    expect(screen.getByTestId('master-switch-toggle')).toHaveAttribute('title', 'platformManaged');
  });

  it('keeps stage-1 global controls locked while a system_admin impersonates a tenant', () => {
    mocks.viewer = 'tenant';
    render(<ModuleMasterSwitch page="ip_filter"><div>content</div></ModuleMasterSwitch>);

    expect(screen.getByTestId('master-switch-toggle')).toBeDisabled();
    expect(screen.getByTestId('master-switch-toggle')).toHaveAttribute('title', 'platformManaged');
  });

  it('allows tenant_admin to persist a tenant-scoped module', async () => {
    Object.assign(mocks.authState, {
      isSystemAdmin: false,
      selectedTenantId: 7,
      user: { role: 'tenant_admin' },
    });
    render(<ModuleMasterSwitch page="user_list"><div>content</div></ModuleMasterSwitch>);

    fireEvent.click(screen.getByTestId('master-switch-toggle'));
    await waitFor(() => {
      expect(mocks.setSecurityModuleEnabled).toHaveBeenCalledWith('user_list', false, mocks.apiRequest);
    });
  });

  it('rolls back an immediate toggle and reports a save failure', async () => {
    Object.assign(mocks.authState, {
      isSystemAdmin: false,
      selectedTenantId: 7,
      user: { role: 'tenant_admin' },
    });
    mocks.setSecurityModuleEnabled.mockRejectedValueOnce(new Error('controlled save failure'));
    render(<ModuleMasterSwitch page="user_list"><div>content</div></ModuleMasterSwitch>);

    const toggle = screen.getByTestId('master-switch-toggle');
    expect(toggle).toHaveAttribute('data-enabled', 'true');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('saveFailed');
    });
    expect(toggle).toHaveAttribute('data-enabled', 'true');
  });

  it('rolls back a deferred toggle and reports a save failure', async () => {
    mocks.setSecurityModuleEnabled.mockRejectedValueOnce(new Error('controlled save failure'));
    render(<ModuleMasterSwitch page="content_rules" deferred><div>content</div></ModuleMasterSwitch>);

    const toggle = screen.getByTestId('master-switch-toggle');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('data-enabled', 'false');
    fireEvent.click(screen.getByTestId('master-switch-save'));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('saveFailed');
    });
    expect(toggle).toHaveAttribute('data-enabled', 'true');
  });

  it('requires a selected tenant for a multi-tenant system_admin', () => {
    mocks.authState.selectedTenantId = null;
    render(<ModuleMasterSwitch page="user_list"><div>content</div></ModuleMasterSwitch>);

    expect(screen.getByTestId('master-switch-toggle')).toBeDisabled();
    expect(screen.getByTestId('master-switch-toggle')).toHaveAttribute('title', 'selectTenantFirst');
  });

  it('uses the default tenant in a single-tenant product form', () => {
    mocks.authState.selectedTenantId = null;
    mocks.multiTenant = false;
    render(<ModuleMasterSwitch page="user_list"><div>content</div></ModuleMasterSwitch>);

    expect(screen.getByTestId('master-switch-toggle')).toBeEnabled();
  });
});
