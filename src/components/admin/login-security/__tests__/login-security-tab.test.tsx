import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoginPolicyResponse } from "@/lib/api/login-policy";

// GT-13320: Platform and Tenant render the same editable controls. Neither view
// exposes nor inherits the other scope's values or IP rules.

const mockUpdate = vi.fn();
vi.mock("@/lib/api/login-policy", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/login-policy")>();
  return {
    ...actual,
    useLoginPolicy: () => ({ data: policy, isLoading: false }),
    useUpdateLoginPolicy: () => ({ mutate: mockUpdate, isPending: false }),
    useAddLoginIPRule: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteLoginIPRule: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      "sections.password": "密码策略",
      "sections.loginControl": "登录控制",
      "sections.ipControl": "IP 访问控制",
      "sections.sso": "单点登录限制",
      "fields.minLength": "最小密码长度",
      "fields.minCharClasses": "密码复杂度要求",
      "fields.historyLimit": "历史密码限制",
      "fields.passwordMaxAgeDays": "密码有效期",
      "fields.maxLoginAttempts": "连续密码错误次数",
      "fields.lockoutMinutes": "锁定时长",
      "fields.sessionTimeoutSecs": "会话超时时间",
      "fields.ipMode": "访问模式",
      "fields.maxOnline": "同一账号最大在线数",
      "fields.overflowPolicy": "超出后策略",
      "fields.captchaAfterFailures": "需验证码的失败次数",
      "fields.forceTwoFactor": "强制启用二次认证",
      permanentLock: "永久锁定",
      unlimited: "不限制",
      resetToDefault: "重置为系统默认",
      save: "保存",
    };
    if (key === "classCount") return `至少 ${vars?.n} 类`;
    if (key === "minutes") return `${vars?.n} 分钟`;
    return dict[key] ?? key;
  },
}));

let policy: LoginPolicyResponse;

const DEFAULTS = {
  minLength: 12,
  minCharClasses: 3,
  historyLimit: 5,
  passwordMaxAgeDays: 90,
  sessionTimeoutSecs: 3600,
  maxOnline: 3,
  overflowPolicy: "reject_new" as const,
  ipMode: "none" as const,
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
  captchaAfterFailures: 2,
  reloginAfterChange: false,
  forceTwoFactor: false,
  twoFactorEnabled: false,
};

function makePolicy(
  scope: "platform" | "tenant",
  over?: Partial<LoginPolicyResponse>,
): LoginPolicyResponse {
  return {
    scope,
    defaults: DEFAULTS,
    configured: null,
    effective: DEFAULTS,
    sources: {},
    tiers: {
      minLength: [8, 10, 12, 14, 16, 20, 24, 32],
      minCharClasses: [1, 2, 3, 4],
    },
    ipRules: [],
    ...over,
  };
}

// Rendered lazily so each test can set `policy` first.
async function renderTab() {
  const { LoginSecurityTab } = await import("../LoginSecurityTab");
  return render(<LoginSecurityTab />);
}

beforeEach(() => {
  mockUpdate.mockClear();
  policy = makePolicy("platform");
});

describe("LoginSecurityTab", () => {
  it("renders the four sections from the product design", async () => {
    await renderTab();
    for (const s of ["密码策略", "登录控制", "IP 访问控制", "单点登录限制"]) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
  });

  // The deliberate departure from the design. Four checkboxes would be a FAKE
  // alignment — see the file header.
  it('shows complexity as an "at least N classes" dropdown, NOT four checkboxes', async () => {
    await renderTab();

    expect(screen.getByLabelText("密码复杂度要求")).toBeInTheDocument();
    // If someone "aligns to the demo" and adds the checkboxes back, this fails.
    for (const label of [/大写字母/, /小写字母/, /特殊字符/]) {
      expect(
        screen.queryByRole("checkbox", { name: label }),
      ).not.toBeInTheDocument();
    }
  });

  it("does not render a platform-baseline banner in the tenant scope", async () => {
    policy = makePolicy("tenant");
    await renderTab();
    expect(screen.queryByText(/平台.*基线/)).not.toBeInTheDocument();
  });

  it("allows tenants to edit attempts, lockout and captcha fields", async () => {
    policy = makePolicy("tenant");
    await renderTab();
    expect(screen.getByLabelText("连续密码错误次数")).toBeInTheDocument();
    expect(screen.getByLabelText("锁定时长")).toBeInTheDocument();
    expect(screen.getByLabelText("需验证码的失败次数")).toBeInTheDocument();
  });

  it("renders only the current scope IP rules returned by the API", async () => {
    policy = makePolicy("tenant", {
      effective: { ...DEFAULTS, ipMode: "whitelist" },
      ipRules: [
        {
          id: 2,
          tenant_id: 7,
          cidr: "192.168.1.0/24",
          remark: "mine",
          updated_at: "",
        },
      ],
    });
    await renderTab();

    const list = screen.getByTestId("ip-rules");
    expect(within(list).getByText("192.168.1.0/24")).toBeInTheDocument();
  });

  it("preserves a touched IP mode when an IP-rule refetch returns the previous mode", async () => {
    policy = makePolicy("tenant");
    const user = userEvent.setup();
    const { LoginSecurityTab } = await import("../LoginSecurityTab");
    const view = render(<LoginSecurityTab />);

    await user.click(screen.getByLabelText("访问模式"));
    await user.click(screen.getByRole("option", { name: "ipModes.blacklist" }));

    // Adding/deleting an IP rule invalidates the whole login-policy query. The
    // server still has `none` until Save, so this refetch must update the rules
    // without replacing the user's unsaved `blacklist` draft.
    policy = makePolicy("tenant", {
      effective: { ...DEFAULTS, ipMode: "none" },
      ipRules: [
        {
          id: 7,
          tenant_id: 3,
          cidr: "192.0.2.10/32",
          remark: "new",
          updated_at: "",
        },
      ],
    });
    view.rerender(<LoginSecurityTab />);

    await user.click(screen.getByTestId("login-security-save"));
    expect(mockUpdate).toHaveBeenCalledWith(
      { ipMode: "blacklist" },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });
});
