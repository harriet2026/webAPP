import type { SecurityPolicy } from "./types";

export interface PasswordRule {
  key: string;
  label: string;
  test: (pwd: string) => boolean;
}

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

/** Number of distinct char classes present: {lower, upper, digit, special}. Mirrors backend validateNewPassword. */
export function countCharClasses(pw: string): number {
  let lower = false,
    upper = false,
    digit = false,
    special = false;
  for (const ch of pw) {
    if (ch >= "a" && ch <= "z") lower = true;
    else if (ch >= "A" && ch <= "Z") upper = true;
    else if (ch >= "0" && ch <= "9") digit = true;
    else special = true;
  }
  return [lower, upper, digit, special].filter(Boolean).length;
}

/** Rune/code-point length, matching the backend's len([]rune(pw)). Never use pw.length. */
export function passwordLength(pw: string): number {
  return Array.from(pw).length;
}

export function buildPasswordRules(
  policy: SecurityPolicy,
  t: TFn,
): PasswordRule[] {
  return [
    {
      key: "len",
      label: t("pwd.minLen", { n: policy.minLength }),
      test: (p) => passwordLength(p) >= policy.minLength,
    },
    {
      key: "classes",
      label: t("pwd.classes", { n: policy.minCharClasses }),
      test: (p) => countCharClasses(p) >= policy.minCharClasses,
    },
  ];
}

export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  // Length checks use rune/code-point length (passwordLength), matching the
  // backend and the checklist/gate discipline — pw.length (UTF-16 units) would
  // over-count emoji/astral characters.
  const len = passwordLength(pw);
  let score = 0;
  if (len >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (len >= 12) score++;
  const v = Math.min(3, Math.max(1, Math.ceil(score * 0.6)));
  return v as 1 | 2 | 3;
}

export function isPhone(v: string): boolean {
  return /^1[3-9]\d{9}$/.test(v);
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
