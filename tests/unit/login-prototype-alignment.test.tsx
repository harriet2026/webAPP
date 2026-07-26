import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepHeader } from '@/components/login/step-header';
import { FormAlert } from '@/components/login/form-alert';
import { BrandPanel } from '@/components/login/brand-panel';
import { CredentialsStep } from '@/components/login/credentials-step';
import { TwoFactorStep } from '@/components/login/two-factor-step';
import { PasswordRuleList, PasswordStrengthBar } from '@/components/login/password-rules';

// `tSpy` records every (key, params) pair so tests can assert on interpolation
// arguments the rendered text can't show — the mock resolves a key to itself,
// so `t('auth.brandCopyright', { year })` renders without the year.
const { tSpy } = vi.hoisted(() => ({ tSpy: vi.fn() }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    tSpy(key, params);
    if (params) {
      return Object.entries(params).reduce(
        (s, [k, v]) => s.replace(`{${k}}`, String(v)),
        key,
      );
    }
    return key;
  },
}));

beforeEach(() => tSpy.mockClear());

describe('StepHeader', () => {
  it('renders title, description and a back button when onBack given', () => {
    const onBack = vi.fn();
    render(<StepHeader title="二次认证" description="验证码已发送" onBack={onBack} />);
    expect(screen.getByRole('heading', { name: '二次认证' })).toBeInTheDocument();
    expect(screen.getByText('验证码已发送')).toBeInTheDocument();
    screen.getByRole('button', { name: 'auth.back' }).click();
    expect(onBack).toHaveBeenCalled();
  });

  it('omits the back button when onBack is absent', () => {
    render(<StepHeader title="重置密码" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('FormAlert', () => {
  it('uses destructive styling for errors', () => {
    const { container } = render(<FormAlert variant="error">失败</FormAlert>);
    expect(container.firstChild).toHaveClass('bg-destructive/10');
  });

  it('uses success styling for success', () => {
    const { container } = render(<FormAlert variant="success">成功</FormAlert>);
    expect(container.firstChild).toHaveClass('bg-success/10');
    expect(container.firstChild).not.toHaveClass('bg-destructive/10');
  });

  it('forwards data-testid to the root element', () => {
    render(<FormAlert variant="error" data-testid="login-locked">x</FormAlert>);
    expect(screen.getByTestId('login-locked')).toBeInTheDocument();
  });
});

describe('BrandPanel prototype parity', () => {
  it('renders product name, headline, four feature bullets and the copyright', () => {
    render(<BrandPanel />);
    expect(screen.getByText('auth.brandProductName')).toBeInTheDocument();
    expect(screen.getByText('auth.brandHeadline')).toBeInTheDocument();
    for (const i of [1, 2, 3, 4]) {
      expect(screen.getByText(`auth.brandFeature${i}`)).toBeInTheDocument();
      expect(screen.getByText(`auth.brandFeature${i}Desc`)).toBeInTheDocument();
    }
    expect(screen.getByText('auth.brandCopyright')).toBeInTheDocument();
  });

  it('is a dark full-bleed rail (spec 2026-07-01 §2.2)', () => {
    const { container } = render(<BrandPanel />);
    expect(container.firstChild).toHaveClass('bg-sidebar');
  });
});

const baseProps = {
  username: '', password: '', remember: false, captchaRequired: false,
  captchaSvg: null, captchaAnswer: '', lockRemainingSec: 0, submitting: false,
  onUsernameChange: vi.fn(), onPasswordChange: vi.fn(), onRememberChange: vi.fn(),
  onCaptchaAnswerChange: vi.fn(), onRefreshCaptcha: vi.fn(), onForgot: vi.fn(), onSubmit: vi.fn(),
};

describe('CredentialsStep prototype parity', () => {
  it('labels the first field 账号 and gives both fields placeholders', () => {
    render(<CredentialsStep {...baseProps} />);
    expect(screen.getByText('auth.account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('auth.accountPlaceholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('auth.passwordPlaceholder')).toBeInTheDocument();
  });

  it('renders errors inside an alert block, not bare text', () => {
    render(<CredentialsStep {...baseProps} errorMessage="boom" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});

describe('BrandPanel copyright', () => {
  it('interpolates the current year rather than baking one into the message', () => {
    render(<BrandPanel />);
    expect(tSpy).toHaveBeenCalledWith('auth.brandCopyright', {
      year: new Date().getFullYear(),
    });
  });
});

const twoFactorProps = {
  maskedTarget: '138****8000',
  code: '',
  trustDevice: false,
  resendIn: 0,
  submitting: false,
  onCodeChange: vi.fn(),
  onTrustDeviceChange: vi.fn(),
  onResend: vi.fn(),
  onSubmit: vi.fn(),
  onBack: vi.fn(),
};

// The prototype drops the visible <label> above the OTP boxes. That is only
// acceptable if the accessible name moved onto the group — otherwise a screen
// reader announces six unnamed "character N" inputs.
describe('TwoFactorStep OTP accessibility', () => {
  it('names the OTP group even though the visible label is gone', () => {
    render(<TwoFactorStep {...twoFactorProps} />);
    expect(screen.getByRole('group', { name: 'auth.twoFactorCode' })).toBeInTheDocument();
  });

  it('gives every box a translated, 1-based label', () => {
    render(<TwoFactorStep {...twoFactorProps} />);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(tSpy).toHaveBeenCalledWith('auth.otpBoxLabel', { n });
    }
  });

  it('does not render a hardcoded English group label', () => {
    render(<TwoFactorStep {...twoFactorProps} />);
    expect(screen.queryByRole('group', { name: 'one-time code' })).toBeNull();
  });
});

describe('PasswordStrengthBar / PasswordRuleList', () => {
  it('renders nothing until a password is typed', () => {
    const { container } = render(<PasswordStrengthBar password="" />);
    expect(container.firstChild).toBeNull();
  });

  // The bar unmounts on an empty password, so a live region on it would come
  // and go. PasswordRuleList is the stable announcer instead.
  it('keeps the live region on the always-mounted rule list, not the bar', () => {
    const { container: bar } = render(<PasswordStrengthBar password="Abcdef1234!" />);
    expect((bar.firstChild as HTMLElement).getAttribute('aria-live')).toBeNull();

    const { container: list } = render(
      <PasswordRuleList password="" minLength={10} minCharClasses={2} />,
    );
    expect((list.firstChild as HTMLElement).getAttribute('aria-live')).toBe('polite');
  });

  it('marks satisfied rules with the success token, not a raw palette color', () => {
    const { container } = render(
      <PasswordRuleList password="Abcdef1234!" minLength={10} minCharClasses={2} />,
    );
    const items = Array.from(container.querySelectorAll('li'));
    expect(items).toHaveLength(2);
    for (const li of items) {
      expect(li.className).toContain('text-success');
      expect(li.className).not.toContain('emerald');
    }
  });

  it('marks unsatisfied rules muted', () => {
    const { container } = render(
      <PasswordRuleList password="abc" minLength={10} minCharClasses={2} />,
    );
    const items = Array.from(container.querySelectorAll('li'));
    expect(items[0].className).toContain('text-muted-foreground');
  });
});
