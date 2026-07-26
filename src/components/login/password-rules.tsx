"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import {
  passwordStrength,
  countCharClasses,
  passwordLength,
} from "@/components/profile/password-rules";
import { useTranslations } from "next-intl";

export interface PasswordRuleListProps {
  password: string;
  minLength?: number;
  minCharClasses?: number;
}

const STRENGTH_COLORS = [
  "bg-muted",
  "bg-red-500",
  "bg-amber-500",
  "bg-emerald-500",
];
const STRENGTH_LABELS = [
  "",
  "profile.pwd.strength1",
  "profile.pwd.strength2",
  "profile.pwd.strength3",
];

/**
 * PasswordStrengthBar — inline 3-segment strength bar shown beneath the new
 * password input (prototype form). Returns null when the password is empty.
 *
 * No `aria-live` here: this subtree unmounts on an empty password, and a live
 * region that comes and goes is unreliable. PasswordRuleList is the stable
 * announcer for both.
 */
export function PasswordStrengthBar({ password }: { password: string }) {
  const t = useTranslations();
  const strength = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="flex h-1.5 flex-1 gap-1">
        {[1, 2, 3].map((seg) => (
          <div
            key={seg}
            className={`h-full flex-1 rounded-full transition-colors ${
              strength >= seg ? STRENGTH_COLORS[strength] : STRENGTH_COLORS[0]
            }`}
          />
        ))}
      </div>
      <span className="w-8 text-xs text-muted-foreground">
        {strength > 0 ? t(STRENGTH_LABELS[strength]) : ""}
      </span>
    </div>
  );
}

/**
 * PasswordRuleList — 2-column checklist of length + char-class rules.
 */
export function PasswordRuleList({
  password,
  minLength = 10,
  minCharClasses = 2,
}: PasswordRuleListProps) {
  const t = useTranslations();
  const rules = [
    {
      key: "len",
      label: t("profile.pwd.minLen", { n: minLength }),
      ok: passwordLength(password) >= minLength,
    },
    {
      key: "classes",
      label: t("profile.pwd.classes", { n: minCharClasses }),
      ok: countCharClasses(password) >= minCharClasses,
    },
  ];
  return (
    <ul className="grid grid-cols-2 gap-1.5" aria-live="polite">
      {rules.map((r) => (
        <li
          key={r.key}
          className={`flex items-center gap-1.5 text-xs ${
            r.ok ? "text-success" : "text-muted-foreground"
          }`}
        >
          {r.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          {r.label}
        </li>
      ))}
    </ul>
  );
}
