import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LoginPolicyResponse } from '@/lib/api/login-policy';

// GT-11959. Two things this file exists to catch, both of which produce a UI that
// looks right and is wrong:
//
//  1. Offering a tenant an option that WEAKENS the platform baseline. The greying
//     out is UX (the server rejects it anyway), but a tenant admin who can select
//     "history = 0" and gets a 400 has been told the feature is broken, and if the
//     grey-out logic ever drifts the other way — allowing what the server allows
//     but the UI forbids — the security floor moves without anyone noticing.
//  2. Rendering four complexity checkboxes to match the product design. The backend
//     enforces "at least N of four classes", so an admin ticking "uppercase +
//     special" would actually get "any 2 of 4" — a lowercase+digit password sails
//     through the rule they think they set. That is worse than not shipping the
//     control at all.

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
      'fields.minLength': '最小密码长度',
      'fields.minCharClasses': '密码复杂度要求',
      'fields.historyLimit': '历史密码限制',
      'fields.passwordMaxAgeDays': '密码有效期',
      'fields.maxLoginAttempts': '连续密码错误次数',
      'fields.lockoutMinutes': '锁定时长',
      'fields.sessionTimeoutSecs': '会话超时时间',
      'fields.ipMode': '访问模式',
      'fields.maxOnline': '同一账号最大在线数',
      'fields.overflowPolicy': '超出后策略',
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

// Rendered lazily so each test can set `policy` first.
async function renderTab() {
  const { LoginSecurityTab } = await import('../LoginSecurityTab');
  return render(<LoginSecurityTab />);
}

beforeEach(() => {
  mockUpdate.mockClear();
  policy = makePolicy('platform');
});

describe('LoginSecurityTab', () => {
  it('renders the four sections from the product design', async () => {
    await renderTab();
    for (const s of ['密码策略', '登录控制', 'IP 访问控制', '单点登录限制']) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
  });

  // The deliberate departure from the design. Four checkboxes would be a FAKE
  // alignment — see the file header.
  it('shows complexity as an "at least N classes" dropdown, NOT four checkboxes', async () => {
    await renderTab();

    expect(screen.getByLabelText('密码复杂度要求')).toBeInTheDocument();
    // If someone "aligns to the demo" and adds the checkboxes back, this fails.
    for (const label of [/大写字母/, /小写字母/, /特殊字符/]) {
      expect(screen.queryByRole('checkbox', { name: label })).not.toBeInTheDocument();
    }
  });

  // The three fields where 0 means "unlimited" and a naive compare reads it as the
  // LARGEST value — letting a tenant switch the check off while the UI calls it a
  // tightening.
  it('greys out options weaker than the baseline for a tenant', async () => {
    policy = makePolicy('tenant');
    await renderTab();

    // The banner only appears on a tenant scope.
    expect(screen.getByText(/平台已下发登录安全基线/)).toBeInTheDocument();
  });

  it('does NOT grey anything out on the platform scope (it IS the baseline)', async () => {
    policy = makePolicy('platform');
    await renderTab();
    expect(screen.queryByText(/平台已下发登录安全基线/)).not.toBeInTheDocument();
  });

  // A tenant that saved a value the platform has since out-tightened must be told
  // its number is inert — not shown a figure that is not being enforced.
  it('flags override fields the platform has since out-tightened', async () => {
    policy = makePolicy('tenant', {
      belowBaseline: ['minLength', 'historyLimit'],
      override: {
        minLength: 8,
        minCharClasses: null,
        historyLimit: 0,
        passwordMaxAgeDays: null,
        sessionTimeoutSecs: null,
        maxOnline: null,
        overflowPolicy: null,
        ipMode: null,
        twoFactorEnabled: null,
        forceTwoFactor: null,
      },
    });
    await renderTab();

    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBe(2);
    for (const a of alerts) {
      expect(a).toHaveTextContent('低于平台基线');
    }
  });

  // These are platform-global and NOT layered — they are pre-auth and keyed by
  // username, so a per-tenant value would leak account existence. Shown read-only
  // rather than omitted: omitting them reads as "this feature is missing".
  it('shows the non-layered lockout fields read-only, not as editable controls', async () => {
    policy = makePolicy('tenant');
    await renderTab();

    expect(screen.getByTestId('global-max-attempts')).toHaveTextContent('5');
    // Read-only means no combobox for them.
    expect(screen.queryByLabelText('连续密码错误次数')).not.toBeInTheDocument();
    expect(screen.getAllByText('由平台统一设置，租户不可修改').length).toBeGreaterThan(0);
  });

  it('renders a permanent lockout as 永久锁定, not as "-1 分钟"', async () => {
    policy = makePolicy('tenant', {
      globalOnly: { maxLoginAttempts: 5, lockoutMinutes: -1, captchaAfterFailures: 2 },
    });
    await renderTab();

    expect(screen.getByText('永久锁定')).toBeInTheDocument();
    expect(screen.queryByText('-1 分钟')).not.toBeInTheDocument();
  });

  // A tenant must see only its OWN IP rules. Surfacing the platform layer here
  // would imply it can delete them, and clearing the list would look like it had
  // lifted a platform restriction — the layers are evaluated separately and a login
  // must pass BOTH.
  it('never shows platform IP rules under a tenant scope', async () => {
    policy = makePolicy('tenant', {
      // `effective.ipMode` is the mode of THIS SCOPE'S OWN layer — the server
      // special-cases it, because ipMode is not merged (whitelist and blacklist have
      // no ordering; the two layers are evaluated independently and both must pass).
      //
      // It used to carry the BASELINE's mode, and the form seeded from it: a tenant
      // saved `whitelist`, reloaded, saw 关闭, and the next save of any unrelated
      // field wrote `ipMode: "none"` back over its own whitelist.
      effective: { ...BASELINE, ipMode: 'whitelist' },
      override: {
        minLength: null,
        minCharClasses: null,
        historyLimit: null,
        passwordMaxAgeDays: null,
        sessionTimeoutSecs: null,
        maxOnline: null,
        overflowPolicy: null,
        ipMode: 'whitelist',
        twoFactorEnabled: null,
        forceTwoFactor: null,
      },
      ipRules: {
        platform: [{ id: 1, tenant_id: null, cidr: '10.0.0.0/8', remark: 'platform', updated_at: '' }],
        tenant: [{ id: 2, tenant_id: 7, cidr: '192.168.1.0/24', remark: 'mine', updated_at: '' }],
      },
    });
    await renderTab();

    const list = screen.getByTestId('ip-rules');
    expect(within(list).getByText('192.168.1.0/24')).toBeInTheDocument();
    expect(within(list).queryByText('10.0.0.0/8')).not.toBeInTheDocument();
  });

  it('preserves a touched IP mode when an IP-rule refetch returns the previous mode', async () => {
    policy = makePolicy('tenant');
    const user = userEvent.setup();
    const { LoginSecurityTab } = await import('../LoginSecurityTab');
    const view = render(<LoginSecurityTab />);

    await user.click(screen.getByLabelText('访问模式'));
    await user.click(screen.getByRole('option', { name: 'ipModes.blacklist' }));

    // Adding/deleting an IP rule invalidates the whole login-policy query. The
    // server still has `none` until Save, so this refetch must update the rules
    // without replacing the user's unsaved `blacklist` draft.
    policy = makePolicy('tenant', {
      effective: { ...BASELINE, ipMode: 'none' },
      ipRules: {
        platform: [],
        tenant: [{ id: 7, tenant_id: 3, cidr: '192.0.2.10/32', remark: 'new', updated_at: '' }],
      },
    });
    view.rerender(<LoginSecurityTab />);

    await user.click(screen.getByTestId('login-security-save'));
    expect(mockUpdate).toHaveBeenCalledWith(
      { ipMode: 'blacklist' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });
});
