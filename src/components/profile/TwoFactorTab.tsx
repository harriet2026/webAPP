'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { use2FA, useEnable2FA, useDisable2FA, useSendCode } from './api';
import type { TwoFactorMethod } from './types';
import { isPhone, isEmail } from './password-rules';

export function TwoFactorTab() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const { data: config, isLoading } = use2FA();
  const enable2FA = useEnable2FA();
  const disable2FA = useDisable2FA();
  const sendCode = useSendCode();

  const [method, setMethod] = useState<TwoFactorMethod>('sms');
  // SMS is only offered when the deployment has an SMS channel configured.
  // Default to true until the config loads so we don't flicker the option off.
  const smsAvailable = config?.smsChannelAvailable !== false;
  // If the server has no SMS channel, never leave the picker on 'sms'.
  useEffect(() => {
    if (!smsAvailable && method === 'sms') {
      setMethod('email');
    }
  }, [smsAvailable, method]);
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [cd, setCd] = useState(0);
  const [err, setErr] = useState('');
  const [cdTimer, setCdTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  const [disableOpen, setDisableOpen] = useState(false);
  const [verifyPwd, setVerifyPwd] = useState('');
  const [verifyErr, setVerifyErr] = useState('');

  const startCountdown = () => {
    setCd(60);
    const timer = setInterval(() => {
      setCd((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setCdTimer(timer);
  };

  const handleSendCode = async () => {
    if (method === 'sms' && !isPhone(target)) {
      setErr(t('twoFactor.phoneInvalid'));
      return;
    }
    if (method === 'email' && !isEmail(target)) {
      setErr(t('twoFactor.emailInvalid'));
      return;
    }
    setErr('');
    try {
      await sendCode.mutateAsync({
        purpose: method === 'sms' ? 'bind_phone' : 'bind_email',
        target,
        method,
      });
      startCountdown();
      toast.success(t('twoFactor.codeSent'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tc('error'));
    }
  };

  const handleEnable = async () => {
    if (code.length !== 6) {
      setErr(t('twoFactor.codeInvalid'));
      return;
    }
    setErr('');
    try {
      await enable2FA.mutateAsync({ method, target, code });
      setCode('');
      setTarget('');
      if (cdTimer) clearInterval(cdTimer);
      setCd(0);
      toast.success(t('twoFactor.enabled'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('twoFactor.enableFailed'));
    }
  };

  const confirmDisable = async () => {
    if (!verifyPwd) {
      setVerifyErr(tc('required'));
      return;
    }
    try {
      await disable2FA.mutateAsync({ enabled: false, password: verifyPwd });
      setDisableOpen(false);
      setVerifyPwd('');
      setVerifyErr('');
      toast.success(t('twoFactor.disabled'));
    } catch (e) {
      setVerifyErr(e instanceof Error ? e.message : t('twoFactor.disableFailed'));
    }
  };

  if (isLoading || !config) {
    return (
      <Card className="p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const required = config.required;

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium">{t('tabs.twoFactor')}</h3>
      <div className="my-4 border-t border-border" />

      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground">{t('twoFactor.statusLabel')}</span>
          {config.enabled ? (
            <Badge variant="outline" className="border-green-200 bg-green-50 font-normal text-green-600 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
              <ShieldCheck className="mr-1 h-3 w-3" />
              {required ? t('twoFactor.forced') : t('twoFactor.enabled')}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {t('twoFactor.disabled')}
            </Badge>
          )}
        </div>

        {config.enabled ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t('twoFactor.methodLabel')}</p>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">
                  {config.method === 'sms' ? t('twoFactor.sms') : t('twoFactor.email')}
                </span>
              </div>
              <div className="mt-3 pl-0 text-xs text-muted-foreground">
                {config.method === 'sms'
                  ? `${t('twoFactor.boundPhone')}: ${config.smsPhone}`
                  : `${t('twoFactor.boundEmail')}: ${config.emailMasked}`}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t('twoFactor.methodLabel')}</p>
            <RadioGroup
              value={method}
              onValueChange={(v) => setMethod(v as TwoFactorMethod)}
              className="space-y-3"
            >
              {(['sms', 'email'] as TwoFactorMethod[]).map((m) => {
                const disabled = m === 'sms' && !smsAvailable;
                return (
                  <div
                    key={m}
                    className={cn(
                      'rounded-lg border p-3',
                      disabled
                        ? 'border-border opacity-60'
                        : method === m
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value={m} id={`tf-${m}`} disabled={disabled} />
                      <label htmlFor={`tf-${m}`} className="text-sm text-foreground">
                        {m === 'sms' ? t('twoFactor.sms') : t('twoFactor.email')}
                      </label>
                      {disabled && (
                        <span className="text-xs text-muted-foreground">
                          （{t('twoFactor.smsUnavailable')}）
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </RadioGroup>

            <div className="space-y-2">
              <div className="flex max-w-2xl flex-wrap items-center gap-2">
                <Input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-56"
                  placeholder={method === 'sms' ? t('twoFactor.phonePlaceholder') : t('twoFactor.emailPlaceholder')}
                />
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  className="w-32"
                  placeholder={t('twoFactor.codePlaceholder')}
                />
                <Button variant="outline" disabled={cd > 0 || sendCode.isPending} onClick={handleSendCode}>
                  {cd > 0 ? t('twoFactor.resendIn', { n: cd }) : t('twoFactor.getCode')}
                </Button>
                <Button disabled={code.length !== 6 || enable2FA.isPending} onClick={handleEnable}>
                  {t('twoFactor.enable')}
                </Button>
              </div>
              {err ? <p className="text-xs text-destructive">{err}</p> : null}
            </div>
          </div>
        )}

        {config.enabled ? (
          <div className="space-y-2 border-t border-border pt-5">
            <p className="text-sm font-medium">{t('twoFactor.disableTitle')}</p>
            {required ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-block" />}>
                  <Button variant="outline" size="sm" disabled className="text-destructive">
                    {t('twoFactor.disable')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('twoFactor.cannotDisable')}</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/30 text-destructive hover:bg-destructive/5"
                onClick={() => {
                  setVerifyPwd('');
                  setVerifyErr('');
                  setDisableOpen(true);
                }}
              >
                {t('twoFactor.disable')}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('twoFactor.disableTitle')}</DialogTitle>
            <DialogDescription>{t('twoFactor.disableConfirm')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Input
              type="password"
              value={verifyPwd}
              onChange={(e) => setVerifyPwd(e.target.value)}
              placeholder={t('twoFactor.passwordPlaceholder')}
              className={verifyErr ? 'border-destructive' : ''}
            />
            {verifyErr ? <p className="text-xs text-destructive">{verifyErr}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={disable2FA.isPending}
              onClick={confirmDisable}
            >
              {disable2FA.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('twoFactor.disable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
