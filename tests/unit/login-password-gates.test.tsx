import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";

// Regression coverage for the N-of-4 password gates (design §5.2). The old code
// hardcoded "must contain a digit" (/\d/.test) in every login/profile submit
// gate; the N-of-4 model made "upper+lower+special, no digit" a VALID password
// when the policy requires <= 3 classes. These tests RENDER the actual
// components (not a re-implemented predicate) so a future regression that
// reintroduces a hardcoded class requirement — or switches a length check back
// to pw.length (UTF-16) — is caught.

// --- shared mocks -----------------------------------------------------------

// Identity translations with {param} substitution; namespace ignored.
vi.mock("next-intl", () => ({
  useTranslations: (_ns?: string) =>
    (key: string, params?: Record<string, string | number>) => {
      void _ns;
      if (params) {
        return Object.entries(params).reduce(
          (s, [k, v]) => s.replace(`{${k}}`, String(v)),
          key,
        );
      }
      return key;
    },
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

// PasswordTab reads its policy + mutation from ./api; stub both.
const useSecurityPolicyMock = vi.fn();
vi.mock("@/components/profile/api", () => ({
  useSecurityPolicy: () => useSecurityPolicyMock(),
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ForcedChangeStep } from "@/components/login/forced-change-step";
import { ForgotStep } from "@/components/login/forgot-step";
import { PasswordTab } from "@/components/profile/PasswordTab";

// A 3-class password with NO digit: upper + lower + special, 11 runes.
const THREE_CLASS_NO_DIGIT = "Abcdefg!hij";

function setInput(el: Element | null, value: string) {
  if (!el) throw new Error("input not found");
  fireEvent.change(el, { target: { value } });
}

describe("ForcedChangeStep gate (rendered component)", () => {
  it("ENABLES submit for 3-class no-digit password when minCharClasses=3", () => {
    const { container } = render(
      createElement(ForcedChangeStep, {
        submitting: false,
        policy: { minLength: 10, minCharClasses: 3, historyLimit: 3 },
        onSubmit: vi.fn(),
        onBack: vi.fn(),
      }),
    );
    setInput(container.querySelector("#osg-fc-new"), THREE_CLASS_NO_DIGIT);
    setInput(container.querySelector("#osg-fc-confirm"), THREE_CLASS_NO_DIGIT);
    expect(
      screen.getByRole("button", { name: "auth.setupSubmit" }),
    ).not.toBeDisabled();
  });

  it("DISABLES submit for the same password when minCharClasses=4 (needs the 4th class)", () => {
    const { container } = render(
      createElement(ForcedChangeStep, {
        submitting: false,
        policy: { minLength: 10, minCharClasses: 4, historyLimit: 3 },
        onSubmit: vi.fn(),
        onBack: vi.fn(),
      }),
    );
    setInput(container.querySelector("#osg-fc-new"), THREE_CLASS_NO_DIGIT);
    setInput(container.querySelector("#osg-fc-confirm"), THREE_CLASS_NO_DIGIT);
    expect(
      screen.getByRole("button", { name: "auth.setupSubmit" }),
    ).toBeDisabled();
  });

  it("DISABLES submit when the password is too short (rune length)", () => {
    const { container } = render(
      createElement(ForcedChangeStep, {
        submitting: false,
        policy: { minLength: 10, minCharClasses: 3, historyLimit: 3 },
        onSubmit: vi.fn(),
        onBack: vi.fn(),
      }),
    );
    setInput(container.querySelector("#osg-fc-new"), "Ab!cd"); // 3 classes but 5 runes
    setInput(container.querySelector("#osg-fc-confirm"), "Ab!cd");
    expect(
      screen.getByRole("button", { name: "auth.setupSubmit" }),
    ).toBeDisabled();
  });
});

describe("ForgotStep gate (rendered component)", () => {
  it("ENABLES submit for 3-class no-digit password when minCharClasses=3", async () => {
    const onSendCode = vi
      .fn()
      .mockResolvedValue({ maskedTarget: "a***@b.com" });
    const { container } = render(
      createElement(ForgotStep, {
        submitting: false,
        policy: { minLength: 10, minCharClasses: 3, historyLimit: 3 },
        onSendCode,
        onVerify: vi.fn(),
        onBack: vi.fn(),
      }),
    );
    // Stage 1 (request) → send a code to reach the verify stage.
    setInput(container.querySelector("#osg-forgot-account"), "someone");
    fireEvent.click(screen.getByRole("button", { name: "auth.sendCode" }));

    // Verify stage renders the new-password input once the code was "sent".
    await waitFor(() =>
      expect(container.querySelector("#osg-forgot-new")).toBeTruthy(),
    );

    // Fill the 6-digit OTP (the only textboxes on this stage).
    const otp = screen.getAllByRole("textbox");
    expect(otp).toHaveLength(6);
    "123456".split("").forEach((d, i) =>
      fireEvent.change(otp[i], { target: { value: d } }),
    );

    setInput(container.querySelector("#osg-forgot-new"), THREE_CLASS_NO_DIGIT);

    expect(
      screen.getByRole("button", { name: "auth.setupSubmit" }),
    ).not.toBeDisabled();
  });
});

describe("PasswordTab gate (rendered component)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ENABLES save for 3-class no-digit password when minCharClasses=3", () => {
    useSecurityPolicyMock.mockReturnValue({
      data: { minLength: 10, minCharClasses: 3, historyLimit: 3 },
    });
    render(createElement(PasswordTab));

    setInput(screen.getByTestId("profile-password-old-input"), "oldpassword1!");
    setInput(
      screen.getByTestId("profile-password-new-input"),
      THREE_CLASS_NO_DIGIT,
    );
    setInput(
      screen.getByTestId("profile-password-confirm-input"),
      THREE_CLASS_NO_DIGIT,
    );

    expect(screen.getByTestId("profile-password-save")).not.toBeDisabled();
  });

  it("DISABLES save for the same password when minCharClasses=4", () => {
    useSecurityPolicyMock.mockReturnValue({
      data: { minLength: 10, minCharClasses: 4, historyLimit: 3 },
    });
    render(createElement(PasswordTab));

    setInput(screen.getByTestId("profile-password-old-input"), "oldpassword1!");
    setInput(
      screen.getByTestId("profile-password-new-input"),
      THREE_CLASS_NO_DIGIT,
    );
    setInput(
      screen.getByTestId("profile-password-confirm-input"),
      THREE_CLASS_NO_DIGIT,
    );

    expect(screen.getByTestId("profile-password-save")).toBeDisabled();
  });
});
