'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Eye, EyeOff, Check, X, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useSecurityPolicy, useChangePassword } from './api';
import { buildPasswordRules, passwordStrength } from './password-rules';
import { profileApiErrorMessage, isWrongCurrentPasswordError } from './profile-errors';

function PwdInput({
  value,
  onChange,
  placeholder,
  error,
  onBlur,
  showLabel,
  hideLabel,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  onBlur?: () => void;
  showLabel: string;
  hideLabel: string;
  testId?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="max-w-md">
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={cn('pr-10', error && 'border-destructive')}
          autoComplete="new-password"
          data-testid={testId}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? hideLabel : showLabel}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function PasswordTab() {
  const t = useTranslations('profile');
  const tRoot = useTranslations();
  const tc = useTranslations('common');
  const { data: policy } = useSecurityPolicy();
  const changePassword = useChangePassword();
  const router = useRouter();
  const locale = useLocale();
  const { logout } = useAuth();

  const rules = useMemo(
    () => (policy ? buildPasswordRules(policy, t) : []),
    [policy, t],
  );

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [oldErr, setOldErr] = useState('');
  const [confirmErr, setConfirmErr] = useState('');
  const [success, setSuccess] = useState(false);

  const strength = passwordStrength(newPwd);
  const ruleResults = rules.map((r) => ({ ...r, passed: r.test(newPwd) }));
  const allPassed = newPwd.length > 0 && ruleResults.every((r) => r.passed);
  const confirmMatch = confirmPwd.length > 0 && confirmPwd === newPwd;
  const canSave = oldPwd.length > 0 && allPassed && confirmMatch && !!policy;

  const checkConfirm = () => {
    if (confirmPwd && confirmPwd !== newPwd) setConfirmErr(t('pwd.mismatch'));
    else setConfirmErr('');
  };

  const save = async () => {
    if (!canSave) return;
    try {
      const res = await changePassword.mutateAsync({
        current_password: oldPwd,
        new_password: newPwd,
      });
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setOldErr('');
      setConfirmErr('');
      if (res?.relogin) {
        toast.success(t('pwd.reloginHint'));
        setTimeout(() => {
          logout();
          router.push(`/${locale}/login`);
        }, 1200);
      } else {
        setSuccess(true);
      }
    } catch (e) {
      // GT-11969: wrong current password -> localized inline error; everything
      // else -> localized toast. Never show the raw English backend message
      // ("Current password is incorrect" / "Internal server error").
      if (isWrongCurrentPasswordError(e)) {
        setOldErr(t('pwd.incorrect'));
      } else {
        toast.error(profileApiErrorMessage(e, 'pwd.changeFailed', t, tRoot));
      }
    }
  };

  const reset = () => {
    setOldPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setOldErr('');
    setConfirmErr('');
    setSuccess(false);
  };

  const strengthColor =
    strength === 3 ? 'bg-green-500' : strength === 2 ? 'bg-amber-500' : 'bg-red-500';
  const strengthLabel = strength === 0 ? '' : t(`pwd.strength${strength}`);

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium">{t('tabs.password')}</h3>
      <div className="my-4 border-t border-border" />

      {success ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" strokeWidth={1.5} />
          <h4 className="mt-4 text-lg font-semibold text-foreground">{t('pwd.changed')}</h4>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('pwd.changedDesc')}</p>
          <Button className="mt-6" onClick={reset} data-testid="profile-password-done">
            {t('pwd.done')}
          </Button>
        </div>
      ) : (
      <div className="max-w-2xl space-y-5">
        <div className="grid grid-cols-[120px_1fr] items-start gap-3">
          <span className="pt-2 text-sm text-foreground">
            {t('pwd.old')}
            <span className="ml-0.5 text-destructive">*</span>
          </span>
          <PwdInput
            value={oldPwd}
            onChange={setOldPwd}
            placeholder={t('pwd.oldPlaceholder')}
            error={oldErr}
            showLabel={t('pwd.show')}
            hideLabel={t('pwd.hide')}
            testId="profile-password-old-input"
          />
        </div>

        <div className="grid grid-cols-[120px_1fr] items-start gap-3">
          <span className="pt-2 text-sm text-foreground">
            {t('pwd.new')}
            <span className="ml-0.5 text-destructive">*</span>
          </span>
          <div className="max-w-md space-y-3">
            <PwdInput
              value={newPwd}
              onChange={setNewPwd}
              placeholder={t('pwd.newPlaceholder')}
              showLabel={t('pwd.show')}
              hideLabel={t('pwd.hide')}
              testId="profile-password-new-input"
            />

            <div className="flex items-center gap-3">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 flex-1 rounded-full',
                      i <= strength ? strengthColor : 'bg-muted',
                    )}
                  />
                ))}
              </div>
              <span
                className={cn(
                  'w-8 text-xs',
                  strength === 3 ? 'text-green-600' : strength === 2 ? 'text-amber-600' : 'text-red-500',
                )}
              >
                {strengthLabel}
              </span>
            </div>

            <ul className="space-y-1">
              {ruleResults.map((r) => (
                <li key={r.key} className="flex items-center gap-1.5 text-xs">
                  {r.passed ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className={r.passed ? 'text-muted-foreground' : 'text-muted-foreground'}>
                    {r.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-[120px_1fr] items-start gap-3">
          <span className="pt-2 text-sm text-foreground">
            {t('pwd.confirm')}
            <span className="ml-0.5 text-destructive">*</span>
          </span>
          <PwdInput
            value={confirmPwd}
            onChange={setConfirmPwd}
            onBlur={checkConfirm}
            placeholder={t('pwd.confirmPlaceholder')}
            error={confirmErr}
            showLabel={t('pwd.show')}
            hideLabel={t('pwd.hide')}
            testId="profile-password-confirm-input"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={reset} data-testid="profile-password-cancel">
            {tc('cancel')}
          </Button>
          <Button disabled={!canSave || changePassword.isPending} onClick={save} data-testid="profile-password-save">
            {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {changePassword.isPending ? tc('loading') : tc('save')}
          </Button>
        </div>
      </div>
      )}
    </Card>
  );
}
