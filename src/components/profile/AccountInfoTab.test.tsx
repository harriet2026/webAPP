import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { AccountInfoTab } from './AccountInfoTab';
import type { AccountInfo } from './types';

// Real role->label-key mapping (not mocked) so this test exercises the actual
// wiring: AccountInfoTab must call roleLabelKey + resolve via the `users`
// translator. Only next-intl and the data hook are mocked.
const USERS_LABELS: Record<string, string> = {
  systemAdmin: '系统管理员',
  tenantAdmin: '租户管理员',
};

const mutationMocks = vi.hoisted(() => ({
  sendCode: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => USERS_LABELS[key] ?? key,
}));

function mockAccount(role: string): AccountInfo {
  return {
    username: 'ysluo',
    role,
    name: '罗颖诗',
    phone: '',
    email: '',
    lastLoginTime: null,
    lastLoginIp: null,
  };
}

let currentAccount: AccountInfo = mockAccount('tenant_admin');
vi.mock('./api', () => ({
  useAccount: () => ({ data: currentAccount, isLoading: false }),
  useUpdateName: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendCode: () => ({ mutateAsync: mutationMocks.sendCode, isPending: false }),
  useBindContact: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  mutationMocks.sendCode.mockReset();
});

describe('AccountInfoTab role label (GT-11970)', () => {
  it('renders the Chinese role label for tenant_admin instead of the raw field', () => {
    currentAccount = mockAccount('tenant_admin');
    const { getByTestId } = render(<AccountInfoTab />);
    // L1 (component layer): the role row must show the localized label, not
    // the raw backend value "tenant_admin".
    expect(getByTestId('profile-account-role').textContent).toContain('租户管理员');
    expect(getByTestId('profile-account-role').textContent).not.toContain('tenant_admin');
  });

  it('renders 系统管理员 for system_admin', () => {
    currentAccount = mockAccount('system_admin');
    const { getByTestId } = render(<AccountInfoTab />);
    expect(getByTestId('profile-account-role').textContent).toContain('系统管理员');
  });

  it('falls back to the raw value for an unknown role (no empty / MISSING label)', () => {
    currentAccount = mockAccount('future_role');
    const { getByTestId } = render(<AccountInfoTab />);
    expect(getByTestId('profile-account-role').textContent).toContain('future_role');
  });
});

describe('AccountInfoTab current email verification (GT-13153)', () => {
  it('submits the masked display value for secure server-side resolution', async () => {
    currentAccount = { ...mockAccount('tenant_admin'), email: 'l***@example.com' };
    const { getByTestId, queryByTestId } = render(<AccountInfoTab />);

    fireEvent.click(getByTestId('profile-account-email-send-code'));

    await waitFor(() => {
      expect(mutationMocks.sendCode).toHaveBeenCalledWith({
        method: 'email',
        purpose: 'bind_email',
        target: 'l***@example.com',
      });
    });
    expect(queryByTestId('profile-account-email-error')).not.toBeInTheDocument();
  });
});

describe('AccountInfoTab stable email locators (GT-13208)', () => {
  it('exposes one stable locator for each email binding control', () => {
    currentAccount = mockAccount('tenant_admin');
    const { getByTestId } = render(<AccountInfoTab />);

    expect(getByTestId('profile-account-email-input')).toBeInTheDocument();
    expect(getByTestId('profile-account-email-code-input')).toBeInTheDocument();
    expect(getByTestId('profile-account-email-send-code')).toBeInTheDocument();
    expect(getByTestId('profile-account-email-bind')).toBeInTheDocument();
  });
});
