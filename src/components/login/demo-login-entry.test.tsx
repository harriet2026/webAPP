import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DemoLoginEntry } from './demo-login-entry';

const state = vi.hoisted(() => ({
  enabled: false,
  startDemoSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    demoAuthBypassEnabled: state.enabled,
    startDemoSession: state.startDemoSession,
  }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
}));

describe('DemoLoginEntry', () => {
  beforeEach(() => {
    state.enabled = false;
    state.startDemoSession.mockReset();
    state.replace.mockReset();
  });

  it('is absent unless the server enables the product-form switcher', () => {
    render(<DemoLoginEntry />);

    expect(screen.queryByTestId('demo-login-entry')).not.toBeInTheDocument();
  });

  it('starts a demo session and enters the dashboard', () => {
    state.enabled = true;
    render(<DemoLoginEntry />);

    fireEvent.click(screen.getByTestId('demo-login-entry'));

    expect(state.startDemoSession).toHaveBeenCalledOnce();
    expect(state.replace).toHaveBeenCalledWith('/zh/dashboard');
  });
});
