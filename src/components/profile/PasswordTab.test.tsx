import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PasswordTab } from './PasswordTab';

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('./api', () => ({
  useSecurityPolicy: () => ({
    data: {
      minLength: 8,
      minCharClasses: 3,
      historyLimit: 5,
      reloginAfterPwdChange: true,
      twoFactorRequired: false,
      phoneBound: false,
      emailBound: false,
      smsChannelAvailable: false,
    },
  }),
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('PasswordTab stable visibility locators (GT-13208)', () => {
  it.each([
    ['old', 'profile-password-old-input'],
    ['new', 'profile-password-new-input'],
    ['confirm', 'profile-password-confirm-input'],
  ])('links the %s visibility toggle to its input', (field, inputTestId) => {
    render(<PasswordTab />);

    const input = screen.getByTestId(inputTestId);
    const toggle = screen.getByTestId(`profile-password-${field}-visibility-toggle`);
    expect(input).toHaveAttribute('id', inputTestId);
    expect(toggle).toHaveAttribute('aria-controls', inputTestId);
  });
});
