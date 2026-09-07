import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoginPolicyResponse } from "@/lib/api/login-policy";

// GT-13320: the same forceTwoFactor field is independently editable in both
// Platform and Tenant scopes.

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
      "sections.twoFactor": "二次认证",
      "fields.forceTwoFactor": "强制启用二次认证",
      "hints.forceTwoFactor": "仅对当前作用域内的账号登录生效",
      permanentLock: "永久锁定",
      unlimited: "不限制",
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

async function renderTab() {
  const { LoginSecurityTab } = await import("../LoginSecurityTab");
  return render(<LoginSecurityTab />);
}

beforeEach(() => {
  mockUpdate.mockClear();
  policy = makePolicy("tenant");
});

describe("LoginSecurityTab 二次认证 card", () => {
  it("renders the card", async () => {
    await renderTab();
    expect(screen.getByTestId("login-security-2fa")).toBeInTheDocument();
    expect(screen.getByText("二次认证")).toBeInTheDocument();
  });

  it("tenant scope reflects its own forceTwoFactor value", async () => {
    policy = makePolicy("tenant", {
      effective: { ...DEFAULTS, forceTwoFactor: true },
    });
    await renderTab();

    const toggle = screen.getByTestId("twofactor-force-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).not.toHaveAttribute("aria-disabled", "true");
  });

  it("tenant scope can keep its own forceTwoFactor off", async () => {
    policy = makePolicy("tenant", {
      effective: { ...DEFAULTS, forceTwoFactor: false },
    });
    await renderTab();

    const toggle = screen.getByTestId("twofactor-force-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("platform scope renders the same field for its own accounts", async () => {
    policy = makePolicy("platform", {
      effective: { ...DEFAULTS, forceTwoFactor: true },
    });
    await renderTab();

    const forceToggle = screen.getByTestId("twofactor-force-toggle");
    expect(forceToggle).toHaveAttribute("aria-checked", "true");
  });

  it("toggling the tenant switch writes only its scoped forceTwoFactor field", async () => {
    policy = makePolicy("tenant", {
      effective: { ...DEFAULTS, forceTwoFactor: false },
    });
    await renderTab();

    screen.getByTestId("twofactor-force-toggle").click();
    screen.getByTestId("login-security-save").click();

    expect(mockUpdate).toHaveBeenCalledWith(
      { forceTwoFactor: true },
      expect.anything(),
    );
  });

  it("toggling the platform force switch calls update with only {forceTwoFactor}", async () => {
    policy = makePolicy("platform", {
      effective: { ...DEFAULTS, forceTwoFactor: false },
    });
    await renderTab();

    screen.getByTestId("twofactor-force-toggle").click();
    screen.getByTestId("login-security-save").click();

    expect(mockUpdate).toHaveBeenCalledWith(
      { forceTwoFactor: true },
      expect.anything(),
    );
  });
});
