"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordRuleList, PasswordStrengthBar } from "./password-rules";
import { StepHeader } from "./step-header";
import { FormAlert } from "./form-alert";
import type { PublicPasswordPolicy } from "@/lib/api/auth";
import {
  countCharClasses,
  passwordLength,
} from "@/components/profile/password-rules";

export interface ForcedChangeStepProps {
  submitting: boolean;
  error?: string | null;
  // D1: server-side password policy. When undefined (fetch failed / pending),
  // the conservative defaults below apply (min length 10, at least 2 of the 4
  // char classes — the N-of-4 model).
  policy?: PublicPasswordPolicy;
  onSubmit: (newPassword: string) => void;
  onBack: () => void;
}

/**
 * ForcedChangeStep — shown when the server returned `need_change_pwd`. The
 * user sets a new password (with the live rule checklist) and the page
 * completes the login via /auth/password/forced-change.
 */
export function ForcedChangeStep({
  submitting,
  error,
  policy,
  onSubmit,
  onBack,
}: ForcedChangeStepProps) {
  const t = useTranslations();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const minLength = policy?.minLength ?? 10;
  const minCharClasses = policy?.minCharClasses ?? 2;

  const mismatch = confirm.length > 0 && pwd !== confirm;
  const rulesOk =
    passwordLength(pwd) >= minLength && countCharClasses(pwd) >= minCharClasses;
  const canSubmit =
    rulesOk && confirm.length > 0 && pwd === confirm && !submitting;

  return (
    <div className="space-y-4">
      <StepHeader
        title={t("auth.changePwdTitle")}
        description={t("auth.changePwdHint")}
        onBack={onBack}
        backDisabled={submitting}
      />

      <div className="space-y-2">
        <label htmlFor="osg-fc-new" className="text-sm font-medium">
          {t("auth.newPassword")}
        </label>
        <div className="relative">
          <Input
            id="osg-fc-new"
            type={show ? "text" : "password"}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            autoComplete="new-password"
            autoFocus
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
            tabIndex={-1}
          >
            {show ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <PasswordStrengthBar password={pwd} />

      <div className="space-y-2">
        <label htmlFor="osg-fc-confirm" className="text-sm font-medium">
          {t("auth.confirmPassword")}
        </label>
        <Input
          id="osg-fc-confirm"
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {mismatch && (
          <p className="text-xs text-destructive">{t("auth.pwdMismatch")}</p>
        )}
      </div>

      <PasswordRuleList password={pwd} minLength={minLength} minCharClasses={minCharClasses} />

      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Button
        type="button"
        className="w-full"
        disabled={!canSubmit}
        onClick={() => onSubmit(pwd)}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : null}
        {submitting ? t("common.loading") : t("auth.setupSubmit")}
      </Button>
    </div>
  );
}
