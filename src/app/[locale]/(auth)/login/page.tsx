'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  loginStep1,
  loginVerify2FA,
  loginVerify2FACode,
  loginSetupCode,
  loginSetupVerify,
  loginForcedChange,
  getCaptcha,
  getPublicPasswordPolicy,
  resetPasswordCode,
  resetPasswordVerifyCode,
  resetPasswordCommit,
  isNeed2FA,
  isNeed2FASetup,
  isNeedChangePwd,
  type LoginStep1Response,
  type PublicPasswordPolicy,
} from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import type { LoginResponse } from '@/types/user';
import { BrandPanel } from '@/components/login/brand-panel';
import { CredentialsStep } from '@/components/login/credentials-step';
import { ForcedChangeStep } from '@/components/login/forced-change-step';
import { TwoFactorStep } from '@/components/login/two-factor-step';
import { SetupStep } from '@/components/login/setup-step';
import { ForgotStep } from '@/components/login/forgot-step';

// The login state machine. Each step is a distinct screen; transitions are
// driven by the backend response shape (Plans 2/3/4).
type Step =
  | { kind: 'credentials' }
  | { kind: 'forcedChange'; ticket: string }
  | { kind: 'twoFactor'; ticket: string; method: 'sms' | 'email'; maskedTarget: string }
  | { kind: 'setup'; ticket: string }
  | { kind: 'forgot' }
  | { kind: 'success' };

const REMEMBER_KEY = 'osg_login_account';
const LOCK_TICK = 1000; // ms

// The advanced-rules sidebar menu is opt-in. Its login-form checkbox was
// dropped in the 2FA login refactor; instead, adding `?advance` to the login
// URL (bare, or any value) turns it on. completeLogin() persists the choice to
// localStorage ('osgateway_show_advanced_rules'), so it survives until logout.
// Read live from the URL at call time so no dep wiring is needed.
function advancedRulesFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('advance');
}

export default function LoginPage() {
  const t = useTranslations();
  const { completeLogin } = useAuth();
  const router = useRouter();
  const locale = useLocale();

  // Shared, hoisted form state. The credentials step owns username/password,
  // but every later step still needs the username (e.g. to persist session).
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaSvg, setCaptchaSvg] = useState<string | null>(null);

  // Error / hint siblings from the last failed login response.
  const [remainingAttempts, setRemainingAttempts] = useState<number | undefined>(undefined);
  const [lockRemainingSec, setLockRemainingSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Separate from errorMessage so a success banner (e.g. forgot-password
  // reset confirmation) doesn't render with the destructive/red styling.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'credentials' });

  // D1: server-side password policy so the forced-change / forgot-password
  // rule checklist matches the actual configured policy (not a hardcoded
  // copy). Fetched once on mount; falls back to undefined → PasswordRuleList /
  // the steps use conservative defaults.
  const [pwdPolicy, setPwdPolicy] = useState<PublicPasswordPolicy | undefined>(undefined);
  // GT-11959: the EFFECTIVE policy for the user in the current flow, once they have
  // been identified (password verified, or reset code proven). `pwdPolicy` above is
  // the public baseline — the loosest possible answer, all we can know before anyone
  // has said who they are. A tenant may have tightened the rules, and showing the
  // baseline checklist would tell such a user their password is acceptable and then
  // have the server reject it.
  const [flowPolicy, setFlowPolicy] = useState<PublicPasswordPolicy | undefined>(undefined);
  const effectivePwdPolicy = flowPolicy ?? pwdPolicy;
  useEffect(() => {
    let cancelled = false;
    getPublicPasswordPolicy()
      .then((p) => {
        if (!cancelled) setPwdPolicy(p);
      })
      .catch(() => {
        // Non-fatal: steps fall back to client defaults.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore remembered account + seed remember checkbox on first paint.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setUsername(saved);
        setRemember(true);
      }
    } catch {
      // localStorage may be unavailable (private mode) — ignore.
    }
  }, []);

  // Tear down the lock-countdown timer on unmount.
  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    };
  }, []);

  const startLockCountdown = useCallback((seconds: number) => {
    setLockRemainingSec(Math.max(0, seconds));
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    lockTimerRef.current = setInterval(() => {
      setLockRemainingSec((prev) => {
        if (prev <= 1) {
          if (lockTimerRef.current) clearInterval(lockTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, LOCK_TICK);
  }, []);

  const refreshCaptcha = useCallback(async () => {
    try {
      const r = await getCaptcha();
      setCaptchaSvg(r.image_svg);
      // Stash the captcha_id on the captcha-required flag carrier so the
      // submit path can read it. We piggy-back on a module-level ref since
      // the captcha_id is opaque to the UI.
      captchaIdRef.current = r.captcha_id;
      setCaptchaAnswer('');
    } catch {
      // Non-fatal: the user can still try; the server will re-prompt.
    }
  }, []);

  // Holds the opaque captcha_id between refresh and submit. Not React state
  // (the UI never renders it).
  const captchaIdRef = useRef<string | null>(null);

  // Remembers whether captcha was required before a step-transition-away, so
  // that when the user comes back to credentials we can re-fetch a fresh
  // challenge (the previous captcha_id is likely expired).
  const captchaWasRequiredRef = useRef(false);

  // Wipe the captcha challenge/answer state. Called on every step transition
  // away from credentials and on back-navigation into credentials, so a stale
  // captcha_id never leaks across a submit boundary.
  const resetCaptchaState = useCallback(() => {
    setCaptchaRequired(false);
    setCaptchaSvg(null);
    setCaptchaAnswer('');
    captchaIdRef.current = null;
  }, []);

  // Navigate back to the credentials step from any later step. Any prior
  // captcha challenge is discarded, and if captcha was required before the
  // step-away we fetch a fresh one so the next submit uses a valid id.
  const backToCredentials = useCallback(() => {
    setErrorMessage(null);
    resetCaptchaState();
    if (captchaWasRequiredRef.current) {
      setCaptchaRequired(true);
      void refreshCaptcha();
    }
    setStep({ kind: 'credentials' });
  }, [refreshCaptcha, resetCaptchaState]);

  // Persist / clear remembered account.
  const applyRemember = useCallback(
    (name: string) => {
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, name);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        // ignore storage errors
      }
    },
    [remember],
  );

  const finishLogin = useCallback(
    (response: LoginResponse, name: string, showAdvancedRules: boolean) => {
      applyRemember(name);
      completeLogin(response, name, { showAdvancedRules });
      setStep({ kind: 'success' });
      router.push(`/${locale}/dashboard`);
    },
    [applyRemember, completeLogin, locale, router],
  );

  // ---- Two-factor resend countdown ----
  // Declared ahead of dispatchStep1 (below), which starts this countdown as
  // soon as a login response transitions into the twoFactor step.
  const [resendIn, setResendIn] = useState(0);
  const twoFactorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (twoFactorTimerRef.current) clearInterval(twoFactorTimerRef.current);
    };
  }, []);

  const startResendCountdown = useCallback((sec = 60) => {
    setResendIn(sec);
    if (twoFactorTimerRef.current) clearInterval(twoFactorTimerRef.current);
    twoFactorTimerRef.current = setInterval(() => {
      setResendIn((p) => {
        if (p <= 1) {
          if (twoFactorTimerRef.current) clearInterval(twoFactorTimerRef.current);
          return 0;
        }
        return p - 1;
      });
    }, 1000);
  }, []);

  // Drive a LoginStep1Response (from step1 or forced-change) through the
  // state machine. Returns true when a step transition was taken (so callers
  // know not to flip back to "submitting=false" themselves).
  const dispatchStep1 = useCallback(
    (resp: LoginStep1Response, name: string, showAdvancedRules: boolean): boolean => {
      if (isNeedChangePwd(resp)) {
        captchaWasRequiredRef.current = captchaRequired;
        resetCaptchaState();
        // The server knows who this is now; use ITS policy, not the baseline.
        setFlowPolicy(resp.policy);
        setStep({ kind: 'forcedChange', ticket: resp.ticket });
        return true;
      }
      if (isNeed2FA(resp)) {
        captchaWasRequiredRef.current = captchaRequired;
        resetCaptchaState();
        setStep({
          kind: 'twoFactor',
          ticket: resp.ticket,
          method: resp.method,
          maskedTarget: resp.masked_target,
        });
        // The backend already dispatched the login code (and started its own
        // resend-throttle window) before returning need_2fa. Start the UI
        // countdown in lockstep so an immediate resend click doesn't hit the
        // backend's ErrResendTooSoon (Spec §2.2 / TC-B05).
        startResendCountdown(60);
        return true;
      }
      if (isNeed2FASetup(resp)) {
        captchaWasRequiredRef.current = captchaRequired;
        resetCaptchaState();
        setStep({ kind: 'setup', ticket: resp.ticket });
        return true;
      }
      // Full login response — finish the session.
      finishLogin(resp, name, showAdvancedRules);
      return true;
    },
    [captchaRequired, finishLogin, resetCaptchaState, startResendCountdown],
  );

  // Map a thrown ApiError onto the credentials-step hint state.
  const handleLoginError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        if (typeof err.remainingAttempts === 'number') setRemainingAttempts(err.remainingAttempts);
        else setRemainingAttempts(undefined);
        if (err.captchaRequired) {
          setCaptchaRequired(true);
          void refreshCaptcha();
        }
        if (err.retryAfterSeconds && err.retryAfterSeconds > 0) {
          startLockCountdown(err.retryAfterSeconds);
        } else if (err.lockedUntil) {
          const ms = Date.parse(err.lockedUntil) - Date.now();
          if (ms > 0) startLockCountdown(Math.ceil(ms / 1000));
        }
        setErrorMessage(err.message || t('auth.loginError'));
      } else {
        setRemainingAttempts(undefined);
        setErrorMessage(err instanceof Error ? err.message : t('auth.loginError'));
      }
    },
    [refreshCaptcha, startLockCountdown, t],
  );

  // ---- Credentials submit ----
  const submitCredentials = useCallback(async (values?: { username: string; password: string; captchaAnswer: string }) => {
    const submitUsername = values?.username ?? username;
    const submitPassword = values?.password ?? password;
    const submitCaptchaAnswer = values?.captchaAnswer ?? captchaAnswer;
    if (values) {
      setUsername(values.username);
      setPassword(values.password);
      setCaptchaAnswer(values.captchaAnswer);
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setRemainingAttempts(undefined);
    // GT-12511: 空用户名/密码在前端拦截并给出本地化提示，不再把请求发给后端
    // （后端 binding 校验错误是 Go validator 英文原文，不应展示给终端用户）。
    if (!submitUsername.trim()) {
      setErrorMessage(t('auth.usernameRequired'));
      return;
    }
    if (!submitPassword) {
      setErrorMessage(t('auth.passwordRequired'));
      return;
    }
    setSubmitting(true);
    // Persist / clear the remembered account on every submit attempt (not
    // only on success) so the user sees it back even after a typo.
    applyRemember(submitUsername);
    try {
      const resp = await loginStep1({
        username: submitUsername,
        password: submitPassword,
        captcha_id: captchaRequired ? captchaIdRef.current ?? undefined : undefined,
        captcha_answer: captchaRequired ? submitCaptchaAnswer : undefined,
      });
      dispatchStep1(resp, submitUsername, advancedRulesFromUrl());
    } catch (err) {
      handleLoginError(err);
    } finally {
      setSubmitting(false);
    }
  }, [applyRemember, captchaAnswer, captchaRequired, dispatchStep1, handleLoginError, password, t, username]);

  // ---- Forced change submit ----
  const submitForcedChange = useCallback(
    async (newPassword: string) => {
      if (step.kind !== 'forcedChange') return;
      setErrorMessage(null);
      setSubmitting(true);
      try {
        const resp = await loginForcedChange(step.ticket, newPassword);
        dispatchStep1(resp, username, advancedRulesFromUrl());
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : t('auth.pwdWeak'));
      } finally {
        setSubmitting(false);
      }
    },
    [dispatchStep1, step, t, username],
  );

  // ---- Two-factor submit ----
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);

  const submitTwoFactor = useCallback(async () => {
    if (step.kind !== 'twoFactor') return;
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const resp = await loginVerify2FA(step.ticket, twoFactorCode, trustDevice);
      finishLogin(resp, username, advancedRulesFromUrl());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('auth.twoFactorInvalid'));
    } finally {
      setSubmitting(false);
    }
  }, [finishLogin, step, t, trustDevice, twoFactorCode, username]);

  const resendTwoFactor = useCallback(async () => {
    if (step.kind !== 'twoFactor') return;
    setErrorMessage(null);
    try {
      await loginVerify2FACode(step.ticket);
      startResendCountdown(60);
    } catch (err) {
      // Do NOT start the countdown if the send failed — the user should be
      // able to retry immediately after a rate-limit / service-unavailable.
      if (err instanceof ApiError) {
        setErrorMessage(err.message || t('auth.twoFactorInvalid'));
      } else {
        setErrorMessage(err instanceof Error ? err.message : t('auth.twoFactorInvalid'));
      }
    }
  }, [startResendCountdown, step, t]);

  // ---- Setup submit ----
  const submitSetupCode = useCallback(
    async (method: 'sms' | 'email', target: string) => {
      if (step.kind !== 'setup') return;
      await loginSetupCode(step.ticket, method, target);
    },
    [step],
  );

  const submitSetupVerify = useCallback(
    async (method: 'sms' | 'email', target: string, code: string) => {
      if (step.kind !== 'setup') return;
      setErrorMessage(null);
      setSubmitting(true);
      try {
        const resp = await loginSetupVerify(step.ticket, method, target, code);
        finishLogin(resp, username, advancedRulesFromUrl());
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : t('auth.twoFactorSetupInvalid'));
      } finally {
        setSubmitting(false);
      }
    },
    [finishLogin, step, t, username],
  );

  // ---- Forgot password ----
  const submitForgotCode = useCallback(async (account: string, method: 'sms' | 'email') => {
    const r = await resetPasswordCode(account, method);
    // Stash the reset ticket; the verify call below reads it via closure.
    forgotTicketRef.current = r.ticket;
    // A fresh code invalidates any continuation ticket from a previous attempt;
    // reusing a stale one would spend the OLD proof against the NEW code.
    forgotContinuationRef.current = null;
    // ...and the identity it proved. Fall back to the baseline until the new code
    // is verified, or a policy from a DIFFERENT account could be shown.
    setFlowPolicy(undefined);
    return { maskedTarget: r.masked_target };
  }, []);
  const forgotTicketRef = useRef<string | null>(null);
  // GT-11959: the reset flow is now verify-code -> commit. The continuation
  // ticket is held here because the code is CONSUMED by the first step: if the
  // password is then rejected by policy, retrying must NOT re-verify (the code is
  // spent and would 401), it must reuse this ticket. Losing it would strand the
  // user needing a fresh code for a simple typo.
  const forgotContinuationRef = useRef<string | null>(null);

  const submitForgotVerify = useCallback(
    async (code: string, newPassword: string) => {
      setErrorMessage(null);
      setSubmitting(true);
      try {
        if (!forgotContinuationRef.current) {
          const { continuation_ticket, policy } = await resetPasswordVerifyCode(
            forgotTicketRef.current ?? '',
            code,
          );
          forgotContinuationRef.current = continuation_ticket;
          // The code is proven, so the account is identified: switch the rule
          // checklist from the public baseline to what will actually be enforced.
          setFlowPolicy(policy);
        }
        await resetPasswordCommit(forgotContinuationRef.current, newPassword);
        forgotContinuationRef.current = null;
        // Success → back to credentials with a hint banner (green, not the
        // destructive/red styling errorMessage carries). Clear the leftover
        // "还可尝试 N 次" remaining-attempts hint from any earlier failed login:
        // CredentialsStep ranks remainingAttempts ABOVE successMessage, so a
        // stale value would hide this green banner on the most common path
        // (user hits "forgot password" right after a failed login).
        setStep({ kind: 'credentials' });
        setRemainingAttempts(undefined);
        setSuccessMessage(t('auth.resetSuccess'));
        setPassword('');
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : t('auth.pwdWeak'));
      } finally {
        setSubmitting(false);
      }
    },
    [t],
  );

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-2" data-testid="login-root">
      <BrandPanel />

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          {/* 移动端品牌标识：<lg 时品牌区隐藏，这里补一行 */}
          <div className="mb-8 flex items-center gap-3 lg:hidden" data-testid="login-brand-mobile">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">{t('auth.brandProductName')}</span>
          </div>

          {step.kind === 'credentials' && (
            <div className="mb-6 space-y-1">
              <h1 className="text-2xl font-bold text-foreground">{t('auth.welcomeTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t('auth.welcomeSubtitle')}</p>
            </div>
          )}

          {step.kind === 'credentials' && (
            <CredentialsStep
              username={username}
              password={password}
              remember={remember}
              captchaRequired={captchaRequired}
              captchaSvg={captchaSvg}
              captchaAnswer={captchaAnswer}
              remainingAttempts={remainingAttempts}
              lockRemainingSec={lockRemainingSec}
              submitting={submitting}
              errorMessage={errorMessage}
              successMessage={successMessage}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onRememberChange={(v) => {
                setRemember(v);
                try {
                  if (!v) localStorage.removeItem(REMEMBER_KEY);
                } catch {
                  /* ignore */
                }
              }}
              onCaptchaAnswerChange={setCaptchaAnswer}
              onRefreshCaptcha={refreshCaptcha}
              onForgot={() => {
                setErrorMessage(null);
                setSuccessMessage(null);
                captchaWasRequiredRef.current = captchaRequired;
                resetCaptchaState();
                setStep({ kind: 'forgot' });
              }}
              onSubmit={submitCredentials}
            />
          )}

          {step.kind === 'forcedChange' && (
            <ForcedChangeStep
              submitting={submitting}
              error={errorMessage}
              policy={effectivePwdPolicy}
              onSubmit={submitForcedChange}
              onBack={backToCredentials}
            />
          )}

          {step.kind === 'twoFactor' && (
            <TwoFactorStep
              maskedTarget={step.maskedTarget}
              code={twoFactorCode}
              trustDevice={trustDevice}
              resendIn={resendIn}
              submitting={submitting}
              error={errorMessage}
              onCodeChange={setTwoFactorCode}
              onTrustDeviceChange={setTrustDevice}
              onResend={resendTwoFactor}
              onSubmit={submitTwoFactor}
              onBack={backToCredentials}
            />
          )}

          {step.kind === 'setup' && (
            <SetupStep
              submitting={submitting}
              error={errorMessage}
              onSendCode={submitSetupCode}
              onSubmit={submitSetupVerify}
              onBack={backToCredentials}
            />
          )}

          {step.kind === 'forgot' && (
            <ForgotStep
              submitting={submitting}
              error={errorMessage}
              policy={effectivePwdPolicy}
              onSendCode={submitForgotCode}
              onVerify={submitForgotVerify}
              onBack={backToCredentials}
            />
          )}

          {step.kind === 'success' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <h2 className="text-lg font-semibold text-foreground">{t('auth.loginSuccess')}</h2>
              <p className="text-sm text-muted-foreground">{t('auth.loginSuccessHint')}</p>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
