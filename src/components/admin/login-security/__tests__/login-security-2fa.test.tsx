import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LoginPolicyResponse } from '@/lib/api/login-policy';

// Plan D / spec §5 (A-18): the 二次认证 card on the login-security tab.
//
// Two things this file exists to catch:
//  1. A tenant admin turning OFF 2FA while the platform has force-enabled it for
//     that tenant (`effective.forceTwoFactor`). The toggle must be locked ON and
//     disabled, with a visible hint explaining why — silently allowing the click
//     (even if the server would reject it) reads as "the feature is broken".
//  2. The platform-scope card writing the wrong body key. A platform admin sets
//     the GLOBAL force switch (`forceTwoFactor`), never the tenant self-toggle.

const mockUpdate = vi.fn();
vi.mock('@/lib/api/login-policy', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/login-policy')>();
  return {
    ...actual,
    useLoginPolicy: () => ({ data: policy, isLoading: false }),
    useUpdateLoginPolicy: () => ({ mutate: mockUpdate, isPending: false }),
    useAddLoginIPRule: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteLoginIPRule: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      'sections.password': '密码策略',
      'sections.loginControl': '登录控制',
      'sections.ipControl': 'IP 访问控制',
      'sections.sso': '单点登录限制',
      'sections.twoFactor': '二次认证',
      'fields.twoFactorEnabled': '为本租户启用二次认证',
      'fields.forceTwoFactor': '全局强制启用二次认证',
      'hints.twoFactorEnabled': '启用后，本租户全体成员登录需进行二次认证',
      'hints.twoFactorLocked': '平台已强制启用二次认证，本租户无法关闭',
      'hints.forceTwoFactor': '启用后，平台内所有租户的成员登录均需进行二次认证',
      belowBaseline: '低于平台基线，当前按基线生效',
      platformOnly: '由平台统一设置，租户不可修改',
      permanentLock: '永久锁定',
      unlimited: '不限制',
      tenantBanner: '平台已下发登录安全基线。',
      save: '保存',
    };
    if (key === 'classCount') return `至少 ${vars?.n} 类`;
    if (key === 'minutes') return `${vars?.n} 分钟`;
    return dict[key] ?? key;
  },
}));

let policy: LoginPolicyResponse;

const BASELINE = {
  minLength: 12,
  minCharClasses: 3,
  historyLimit: 5,
  passwordMaxAgeDays: 90,
  sessionTimeoutSecs: 3600,
  maxOnline: 3,
  overflowPolicy: 'reject_new' as const,
  ipMode: 'none' as const,
  reloginAfterChange: false,
  forceTwoFactor: false,
  twoFactorEnabled: false,
};

function makePolicy(scope: 'platform' | 'tenant', over?: Partial<LoginPolicyResponse>): LoginPolicyResponse {
  return {
    scope,
    baseline: BASELINE,
    override: null,
    effective: BASELINE,
    belowBaseline: null,
    tiers: { minLength: [8, 10, 12, 14, 16, 20, 24, 32], minCharClasses: [1, 2, 3, 4] },
    ipRules: { platform: [], tenant: [] },
    globalOnly: { maxLoginAttempts: 5, lockoutMinutes: 15, captchaAfterFailures: 2 },
    ...over,
  };
}

async function renderTab() {
  const { LoginSecurityTab } = await import('../LoginSecurityTab');
  return render(<LoginSecurityTab />);
}

beforeEach(() => {
  mockUpdate.mockClear();
  policy = makePolicy('tenant');
});

describe('LoginSecurityTab 二次认证 card', () => {
  it('renders the card', async () => {
    await renderTab();
    expect(screen.getByTestId('login-security-2fa')).toBeInTheDocument();
    expect(screen.getByText('二次认证')).toBeInTheDocument();
  });

  it('tenant scope: the self-toggle reflects override.twoFactorEnabled', async () => {
    policy = makePolicy('tenant', {
      effective: { ...BASELINE, twoFactorEnabled: true },
      override: {
        minLength: null,
        minCharClasses: null,
        historyLimit: null,
        passwordMaxAgeDays: null,
        sessionTimeoutSecs: null,
        maxOnline: null,
        overflowPolicy: null,
        ipMode: null,
        twoFactorEnabled: true,
        forceTwoFactor: null,
      },
    });
    await renderTab();

    const toggle = screen.getByTestId('twofactor-enabled-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByTestId('twofactor-locked-hint')).not.toBeInTheDocument();
  });

  it('tenant scope: the self-toggle is off when override.twoFactorEnabled is false', async () => {
    policy = makePolicy('tenant', {
      effective: { ...BASELINE, twoFactorEnabled: false },
      override: {
        minLength: null,
        minCharClasses: null,
        historyLimit: null,
        passwordMaxAgeDays: null,
        sessionTimeoutSecs: null,
        maxOnline: null,
        overflowPolicy: null,
        ipMode: null,
        twoFactorEnabled: false,
        forceTwoFactor: null,
      },
    });
    await renderTab();

    const toggle = screen.getByTestId('twofactor-enabled-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('locks the tenant toggle ON + disabled + shows the hint when platform force-enabled', async () => {
    policy = makePolicy('tenant', {
      effective: { ...BASELINE, forceTwoFactor: true, twoFactorEnabled: true },
    });
    await renderTab();

    const toggle = screen.getByTestId('twofactor-enabled-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('twofactor-locked-hint')).toBeInTheDocument();
    expect(screen.getByTestId('twofactor-locked-hint')).toHaveTextContent('平台已强制启用二次认证');
  });

  it('does not render the platform force toggle on tenant scope', async () => {
    await renderTab();
    expect(screen.queryByTestId('twofactor-force-toggle')).not.toBeInTheDocument();
  });

  it('platform scope: renders the global force toggle instead of the self-toggle', async () => {
    policy = makePolicy('platform', { effective: { ...BASELINE, forceTwoFactor: true } });
    await renderTab();

    const forceToggle = screen.getByTestId('twofactor-force-toggle');
    expect(forceToggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('twofactor-enabled-toggle')).not.toBeInTheDocument();
  });

  it('toggling the tenant self-toggle calls update with only {twoFactorEnabled}', async () => {
    policy = makePolicy('tenant', { effective: { ...BASELINE, twoFactorEnabled: false } });
    await renderTab();

    screen.getByTestId('twofactor-enabled-toggle').click();
    screen.getByTestId('login-security-save').click();

    expect(mockUpdate).toHaveBeenCalledWith(
      { twoFactorEnabled: true },
      expect.anything(),
    );
  });

  it('toggling the platform force switch calls update with only {forceTwoFactor}', async () => {
    policy = makePolicy('platform', { effective: { ...BASELINE, forceTwoFactor: false } });
    await renderTab();

    screen.getByTestId('twofactor-force-toggle').click();
    screen.getByTestId('login-security-save').click();

    expect(mockUpdate).toHaveBeenCalledWith(
      { forceTwoFactor: true },
      expect.anything(),
    );
  });
});
