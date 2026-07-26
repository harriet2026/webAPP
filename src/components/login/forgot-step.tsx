"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { OtpInput } from "./otp-input";
import { PasswordRuleList, PasswordStrengthBar } from "./password-rules";
import { StepHeader } from "./step-header";
import { FormAlert } from "./form-alert";
import type { PublicPasswordPolicy } from "@/lib/api/auth";
import {
  countCharClasses,
  passwordLength,
} from "@/components/profile/password-rules";

type Stage = "request" | "verify";

export interface ForgotStepProps {
  submitting: boolean;
  error?: string | null;
  // D1: server-side password policy (see ForcedChangeStep).
  policy?: PublicPasswordPolicy;
  onSendCode: (
    account: string,
    method: "sms" | "email",
  ) => Promise<{ maskedTarget: string }>;
  onVerify: (code: string, newPassword: string) => Promise<void>;
  onBack: () => void;
}

/**
 * ForgotStep — password reset flow. Two sub-stages:
 *   1. request: account + channel → server sends a code, returns masked target
 *   2. verify:  code + new password → server resets
 * The page owns the reset ticket; this component just collects inputs.
 */
export function ForgotStep({
  submitting,
  error,
  policy,
  onSendCode,
  onVerify,
  onBack,
}: ForgotStepProps) {
  const t = useTranslations();
  const [stage, setStage] = useState<Stage>("request");
  const [account, setAccount] = useState("");
  const [method, setMethod] = useState<"sms" | "email">("email");
  const [maskedTarget, setMaskedTarget] = useState("");
  const [code, setCode] = useState("");
  const [pwd, setPwd] = useState("");
  const [cd, setCd] = useState(0);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = () => {
    setCd(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCd((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSend = async () => {
    if (!account.trim()) {
      setLocalErr(t("auth.forgotAccount"));
      return;
    }
    setLocalErr(null);
    try {
      const r = await onSendCode(account.trim(), method);
      setMaskedTarget(r.maskedTarget);
      setStage("verify");
      startCountdown();
    } catch (err) {
      // reset/code is anti-enumeration (almost always 200), so this only fires
      // on a network/transport error — surface it instead of leaving the button
      // looking inert.
      setLocalErr(
        err instanceof Error && err.message
          ? err.message
          : t("auth.sendCodeFailed"),
      );
    }
  };

  const minLength = policy?.minLength ?? 10;
  const minCharClasses = policy?.minCharClasses ?? 2;
  const pwdRulesOk =
    passwordLength(pwd) >= minLength && countCharClasses(pwd) >= minCharClasses;

  const handleVerify = async () => {
    setLocalErr(null);
    if (code.length !== 6) {
      setLocalErr(t("profile.account.codeInvalid"));
      return;
    }
    if (!pwdRulesOk) {
      setLocalErr(t("auth.pwdWeak"));
      return;
    }
    await onVerify(code, pwd);
  };

  if (stage === "request") {
    return (
      <div className="space-y-4">
        <StepHeader title={t("auth.forgotTitle")} description={t("auth.forgotHint")} onBack={onBack} backDisabled={submitting} />

        <div className="space-y-2">
          <label htmlFor="osg-forgot-account" className="text-sm font-medium">
            {t("auth.forgotAccount")}
          </label>
          <Input
            id="osg-forgot-account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("auth.setupMethod")}</label>
          <RadioGroup
            value={method}
            onValueChange={(v) => setMethod(v as "sms" | "email")}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="sms" id="forgot-sms" />
              <label htmlFor="forgot-sms" className="text-sm">
                {t("auth.setupMethodSms")}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="email" id="forgot-email" />
              <label htmlFor="forgot-email" className="text-sm">
                {t("auth.setupMethodEmail")}
              </label>
            </div>
          </RadioGroup>
        </div>

        {localErr && <FormAlert variant="error">{localErr}</FormAlert>}
        {error && <FormAlert variant="error">{error}</FormAlert>}

        <Button
          type="button"
          className="w-full"
          disabled={submitting}
          onClick={handleSend}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          {t("auth.sendCode")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StepHeader
        title={t("auth.forgotTitle")}
        description={t("auth.twoFactorRequiredHint", { target: maskedTarget })}
        onBack={() => setStage("request")}
        backDisabled={submitting}
      />

      <div className="space-y-2">
        {/* Not a <label htmlFor>: the OTP is six inputs, so the name lives on
            the group instead. */}
        <span className="block text-sm font-medium">{t("auth.twoFactorCode")}</span>
        <div className="flex items-center gap-2">
          <OtpInput
            value={code}
            onChange={setCode}
            length={6}
            groupLabel={t("auth.twoFactorCode")}
            boxLabel={(n) => t("auth.otpBoxLabel", { n })}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={cd > 0 || submitting}
            onClick={async () => {
              setLocalErr(null);
              try {
                const r = await onSendCode(account.trim(), method);
                setMaskedTarget(r.maskedTarget);
                startCountdown();
              } catch (err) {
                setLocalErr(
                  err instanceof Error && err.message
                    ? err.message
                    : t("auth.sendCodeFailed"),
                );
              }
            }}
          >
            {cd > 0 ? t("auth.resendIn", { n: cd }) : t("auth.resend")}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="osg-forgot-new" className="text-sm font-medium">
          {t("auth.newPassword")}
        </label>
        <Input
          id="osg-forgot-new"
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          autoComplete="new-password"
        />
        <PasswordStrengthBar password={pwd} />
        <PasswordRuleList password={pwd} minLength={minLength} minCharClasses={minCharClasses} />
      </div>

      {localErr && <FormAlert variant="error">{localErr}</FormAlert>}
      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Button
        type="button"
        className="w-full"
        disabled={code.length !== 6 || !pwdRulesOk || submitting}
        onClick={handleVerify}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : null}
        {t("auth.setupSubmit")}
      </Button>
    </div>
  );
}
