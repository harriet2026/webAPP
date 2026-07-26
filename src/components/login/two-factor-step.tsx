'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { OtpInput } from './otp-input';
import { StepHeader } from './step-header';
import { FormAlert } from './form-alert';

export interface TwoFactorStepProps {
  maskedTarget: string;
  code: string;
  trustDevice: boolean;
  resendIn: number;
  submitting: boolean;
  error?: string | null;
  onCodeChange: (v: string) => void;
  onTrustDeviceChange: (v: boolean) => void;
  onResend: () => void;
  onSubmit: () => void;
  onBack: () => void;
}

/**
 * TwoFactorStep — 6-box OTP input + resend-countdown button + trust-device
 * checkbox. Per Spec §0.3 C1 it does NOT switch between SMS/email channels:
 * the channel was already chosen when the user enabled 2FA.
 */
export function TwoFactorStep({
  maskedTarget,
  code,
  trustDevice,
  resendIn,
  submitting,
  error,
  onCodeChange,
  onTrustDeviceChange,
  onResend,
  onSubmit,
  onBack,
}: TwoFactorStepProps) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <StepHeader
        title={t('auth.twoFactorRequired')}
        description={t('auth.twoFactorRequiredHint', { target: maskedTarget })}
        onBack={onBack}
        backDisabled={submitting}
      />

      {/* The prototype drops the visible label, so the group carries the name. */}
      <div className="flex justify-center py-2">
        <OtpInput
          value={code}
          onChange={onCodeChange}
          length={6}
          autoFocus
          groupLabel={t('auth.twoFactorCode')}
          boxLabel={(n) => t('auth.otpBoxLabel', { n })}
        />
      </div>

      <div className="flex flex-row items-start gap-3 space-y-0">
        <Checkbox
          id="osg-trust-device"
          checked={trustDevice}
          onCheckedChange={(v) => onTrustDeviceChange(v === true)}
        />
        <div className="space-y-0.5 leading-none">
          <label htmlFor="osg-trust-device" className="text-sm font-medium cursor-pointer">
            {t('auth.trustDevice')}
          </label>
          <p className="text-xs text-muted-foreground">{t('auth.trustDeviceHint')}</p>
        </div>
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-sm"
        disabled={resendIn > 0 || submitting}
        onClick={onResend}
      >
        {resendIn > 0 ? t('auth.resendIn', { n: resendIn }) : t('auth.resend')}
      </Button>

      <Button type="button" className="w-full" disabled={code.length !== 6 || submitting} onClick={onSubmit}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {submitting ? t('common.loading') : t('auth.verify')}
      </Button>
    </div>
  );
}
