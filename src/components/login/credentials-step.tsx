'use client';

import { useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { Eye, EyeOff, Loader2, RefreshCw, Lock, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FormAlert } from './form-alert';

export interface CredentialsStepProps {
  username: string;
  password: string;
  remember: boolean;
  captchaRequired: boolean;
  captchaSvg: string | null;
  captchaAnswer: string;
  remainingAttempts?: number;
  lockRemainingSec: number;
  submitting: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onRememberChange: (v: boolean) => void;
  onCaptchaAnswerChange: (v: string) => void;
  onRefreshCaptcha: () => void;
  onForgot: () => void;
  onSubmit: (values: { username: string; password: string; captchaAnswer: string }) => void;
}

function fmtLock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * CredentialsStep — username + password (+ optional captcha) form. Owned by
 * the login page; all state is hoisted up via props. Shows the remaining
 * attempts hint or the lockout countdown based on the last failed response.
 */
export function CredentialsStep(props: CredentialsStepProps) {
  const t = useTranslations();
  const [showPwd, setShowPwd] = useState(false);
  const locked = props.lockRemainingSec > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (props.submitting || locked) return;
        const form = new FormData(e.currentTarget);
        props.onSubmit({
          username: String(form.get('username') ?? ''),
          password: String(form.get('password') ?? ''),
          captchaAnswer: String(form.get('captcha_answer') ?? ''),
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <label htmlFor="osg-login-username" className="text-sm font-medium">
          {t('auth.account')}
        </label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="osg-login-username"
            name="username"
            autoComplete="username"
            placeholder={t('auth.accountPlaceholder')}
            className="pl-9"
            value={props.username}
            onChange={(e) => props.onUsernameChange(e.target.value)}
            disabled={props.submitting}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="osg-login-password" className="text-sm font-medium">
          {t('auth.password')}
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="osg-login-password"
            name="password"
            type={showPwd ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder={t('auth.passwordPlaceholder')}
            value={props.password}
            onChange={(e) => props.onPasswordChange(e.target.value)}
            disabled={props.submitting}
            className="pl-9 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPwd((s) => !s)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            aria-label={showPwd ? t('auth.hidePassword') : t('auth.showPassword')}
            tabIndex={-1}
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="osg-login-remember"
            checked={props.remember}
            onCheckedChange={(v) => props.onRememberChange(v === true)}
          />
          <label htmlFor="osg-login-remember" className="text-sm cursor-pointer text-muted-foreground">
            {t('auth.rememberAccount')}
          </label>
        </div>
        <button
          type="button"
          onClick={props.onForgot}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t('auth.forgotPassword')}
        </button>
      </div>

      {props.captchaRequired && (
        <div className="space-y-2">
          <label htmlFor="osg-login-captcha" className="text-sm font-medium">
            {t('auth.captchaLabel')}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="osg-login-captcha"
              name="captcha_answer"
              value={props.captchaAnswer}
              onChange={(e) => props.onCaptchaAnswerChange(e.target.value)}
              disabled={props.submitting}
              className="flex-1"
              autoComplete="off"
            />
            {props.captchaSvg ? (
              <button
                type="button"
                onClick={props.onRefreshCaptcha}
                className="flex h-10 items-center rounded-md border border-input bg-background px-2 hover:bg-muted"
                aria-label={t('auth.captchaRefresh')}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(props.captchaSvg, {
                    USE_PROFILES: { svg: true, svgFilters: true },
                  }),
                }}
              />
            ) : (
              <Button type="button" variant="outline" size="icon" onClick={props.onRefreshCaptcha}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {locked ? (
        <FormAlert variant="error" data-testid="login-locked">
          {t('auth.accountLocked', { time: fmtLock(props.lockRemainingSec) })}
        </FormAlert>
      ) : props.remainingAttempts !== undefined ? (
        <FormAlert variant="error" data-testid="login-remaining">
          {t('auth.remainingAttempts', { n: props.remainingAttempts })}
        </FormAlert>
      ) : props.errorMessage ? (
        <FormAlert variant="error">{props.errorMessage}</FormAlert>
      ) : props.successMessage ? (
        <FormAlert variant="success" data-testid="login-success">
          {props.successMessage}
        </FormAlert>
      ) : null}

      <Button
        type="submit"
        className="w-full"
        disabled={props.submitting || locked}
      >
        {props.submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {props.submitting ? t('common.loading') : t('auth.loginButton')}
      </Button>
    </form>
  );
}
