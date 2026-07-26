'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { OtpInput } from './otp-input';
import { StepHeader } from './step-header';
import { FormAlert } from './form-alert';

function isPhone(v: string): boolean {
  return /^1[3-9]\d{9}$/.test(v);
}
function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export interface SetupStepProps {
  submitting: boolean;
  error?: string | null;
  onSendCode: (method: 'sms' | 'email', target: string) => Promise<void>;
  onSubmit: (method: 'sms' | 'email', target: string, code: string) => Promise<void>;
  onBack: () => void;
}

/**
 * SetupStep — forced 2FA binding on first login. The user picks SMS/email,
 * enters their target, receives a code, and verifies. Carries a 60s resend
 * countdown (the verifycode service also enforces this server-side).
 *
 * Migrated verbatim from the inline SetupStep in the old login page, with the
 * single code Input replaced by the 6-box OtpInput for consistency with the
 * existing-2FA step. The page owns the server-issued ticket and closes over
 * it in the onSendCode/onSubmit callbacks it passes down.
 */
export function SetupStep({ submitting, error, onSendCode, onSubmit, onBack }: SetupStepProps) {
  const t = useTranslations();
  const [method, setMethod] = useState<'sms' | 'email'>('sms');
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
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

  const validateTarget = (): boolean => {
    if (method === 'sms' && !isPhone(target)) {
      setLocalErr(t('profile.account.phoneInvalid'));
      return false;
    }
    if (method === 'email' && !isEmail(target)) {
      setLocalErr(t('profile.account.emailInvalid'));
      return false;
    }
    setLocalErr(null);
    return true;
  };

  const handleSendCode = async () => {
    if (!validateTarget()) return;
    setLocalErr(null);
    try {
      await onSendCode(method, target);
      startCountdown();
    } catch (err) {
      // Do NOT start the countdown; show why the send failed so the user is not
      // left with zero feedback (e.g. rate-limited / target rejected).
      setLocalErr(err instanceof Error && err.message ? err.message : t('auth.sendCodeFailed'));
    }
  };

  const handleSubmit = async () => {
    if (!validateTarget()) return;
    if (code.length !== 6) {
      setLocalErr(t('profile.account.codeInvalid'));
      return;
    }
    setLocalErr(null);
    await onSubmit(method, target, code);
  };

  return (
    <div className="space-y-4">
      <StepHeader
        title={t('auth.twoFactorSetupRequired')}
        description={t('auth.twoFactorSetupHint')}
        onBack={onBack}
        backDisabled={submitting}
      />

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('auth.setupMethod')}</label>
        <RadioGroup value={method} onValueChange={(v) => setMethod(v as 'sms' | 'email')}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="sms" id="setup-sms" />
            <label htmlFor="setup-sms" className="text-sm">
              {t('auth.setupMethodSms')}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="email" id="setup-email" />
            <label htmlFor="setup-email" className="text-sm">
              {t('auth.setupMethodEmail')}
            </label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <label htmlFor="osg-setup-target" className="text-sm font-medium">
          {t('auth.setupTarget')}
        </label>
        <Input
          id="osg-setup-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={method === 'sms' ? t('auth.setupTargetPlaceholderSms') : t('auth.setupTargetPlaceholderEmail')}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('auth.twoFactorCode')}</label>
        <div className="flex items-center gap-2">
          <OtpInput value={code} onChange={setCode} length={6} />
          <Button type="button" variant="outline" disabled={cd > 0} onClick={handleSendCode} className="shrink-0">
            {cd > 0 ? t('auth.setupResendIn', { n: cd }) : t('auth.setupGetCode')}
          </Button>
        </div>
      </div>

      {localErr && <FormAlert variant="error">{localErr}</FormAlert>}
      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Button
        type="button"
        className="w-full"
        disabled={code.length !== 6 || !target || submitting}
        onClick={handleSubmit}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {submitting ? t('common.loading') : t('auth.setupSubmit')}
      </Button>
    </div>
  );
}
