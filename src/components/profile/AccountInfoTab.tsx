'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAccount, useUpdateName, useSendCode, useBindContact } from './api';
import { isPhone, isEmail } from './password-rules';
import { roleLabelKey } from '@/lib/role-labels';
import { profileApiErrorMessage } from './profile-errors';
import { formatTimestamp } from '@/lib/format-time';
import type { AccountInfo } from './types';

function ReadonlyRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3" data-testid={testId}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value || '—'}</span>
    </div>
  );
}

export function AccountInfoTab({ onNameChange }: { onNameChange?: (n: string) => void }) {
  const { data: account, isLoading } = useAccount();

  if (isLoading || !account) {
    return (
      <Card className="p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return <AccountForm key={account.username} account={account} onNameChange={onNameChange} />;
}

function AccountForm({
  account,
  onNameChange,
}: {
  account: AccountInfo;
  onNameChange?: (n: string) => void;
}) {
  const t = useTranslations('profile');
  const tRoot = useTranslations();
  const tc = useTranslations('common');
  // GT-11970: role labels live under the `users` namespace (single source of
  // truth shared with 用户管理); resolve the Chinese label instead of showing
  // the raw backend field (e.g. "tenant_admin").
  const tu = useTranslations('users');
  const roleLabelKeyOpt = roleLabelKey(account.role);
  const roleDisplay = roleLabelKeyOpt ? tu(roleLabelKeyOpt) : account.role;
  const updateName = useUpdateName();
  const sendCode = useSendCode();
  const bindContact = useBindContact();

  const [name, setName] = useState(account.name || '');
  const [nameErr, setNameErr] = useState('');

  const [phone, setPhone] = useState(account.phone || '');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [phoneCd, setPhoneCd] = useState(0);

  const [email, setEmail] = useState(account.email || '');
  const [emailCode, setEmailCode] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [emailCd, setEmailCd] = useState(0);

  const timers = useRef<{ p?: ReturnType<typeof setInterval>; e?: ReturnType<typeof setInterval> }>({});
  useEffect(() => {
    const t = timers.current;
    return () => {
      if (t.p) clearInterval(t.p);
      if (t.e) clearInterval(t.e);
    };
  }, []);

  const startCountdown = (which: 'p' | 'e') => {
    const set = which === 'p' ? setPhoneCd : setEmailCd;
    set(60);
    const timer = setInterval(() => {
      set((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    timers.current[which] = timer;
  };

  const sendPhoneCode = async () => {
    if (!isPhone(phone)) {
      setPhoneErr(t('account.phoneInvalid'));
      return;
    }
    setPhoneErr('');
    try {
      await sendCode.mutateAsync({ purpose: 'bind_phone', target: phone, method: 'sms' });
      startCountdown('p');
      toast.success(t('account.codeSent'));
    } catch (e) {
      toast.error(profileApiErrorMessage(e, 'account.codeSendFailed', t, tRoot));
    }
  };

  const sendEmailCode = async () => {
    if (!isEmail(email)) {
      setEmailErr(t('account.emailInvalid'));
      return;
    }
    setEmailErr('');
    try {
      await sendCode.mutateAsync({ purpose: 'bind_email', target: email, method: 'email' });
      startCountdown('e');
      toast.success(t('account.codeSent'));
    } catch (e) {
      toast.error(profileApiErrorMessage(e, 'account.codeSendFailed', t, tRoot));
    }
  };

  const bindPhone = async () => {
    if (phoneCode.length !== 6) {
      setPhoneErr(t('account.codeInvalid'));
      return;
    }
    setPhoneErr('');
    try {
      await bindContact.mutateAsync({ type: 'phone', target: phone, code: phoneCode });
      setPhoneCode('');
      toast.success(t('account.boundPhone'));
    } catch (e) {
      setPhoneErr(profileApiErrorMessage(e, 'account.bindFailed', t, tRoot));
    }
  };

  const bindEmail = async () => {
    if (emailCode.length !== 6) {
      setEmailErr(t('account.codeInvalid'));
      return;
    }
    setEmailErr('');
    try {
      await bindContact.mutateAsync({ type: 'email', target: email, code: emailCode });
      setEmailCode('');
      toast.success(t('account.boundEmail'));
    } catch (e) {
      setEmailErr(profileApiErrorMessage(e, 'account.bindFailed', t, tRoot));
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setNameErr(t('account.nameEmpty'));
      return;
    }
    setNameErr('');
    try {
      await updateName.mutateAsync(name.trim());
      onNameChange?.(name.trim());
      toast.success(t('account.saved'));
    } catch (e) {
      setNameErr(profileApiErrorMessage(e, 'account.saveFailed', t, tRoot));
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium">{t('tabs.account')}</h3>
      <div className="my-4 border-t border-border" />

      <div className="max-w-2xl space-y-5">
        <div className="space-y-3">
          <ReadonlyRow label={t('account.username')} value={account.username} />
          <ReadonlyRow label={t('account.role')} value={roleDisplay} testId="profile-account-role" />
        </div>

        <div className="border-t border-border" />

        <div className="grid grid-cols-[120px_1fr] items-start gap-3">
          <span className="pt-2 text-sm text-foreground">
            {t('account.name')}
            <span className="ml-0.5 text-destructive">*</span>
          </span>
          <div className="max-w-md">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={nameErr ? 'border-destructive' : ''}
              placeholder={t('account.namePlaceholder')}
              data-testid="profile-account-name-input"
            />
            {nameErr ? <p className="mt-1 text-xs text-destructive" data-testid="profile-account-name-error">{nameErr}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-[120px_1fr] items-start gap-3">
          <span className="pt-2 text-sm text-foreground">{t('account.phone')}</span>
          <div className="space-y-2">
            <div className="flex max-w-2xl flex-wrap items-center gap-2">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-48 ${phoneErr ? 'border-destructive' : ''}`}
                placeholder={t('account.phonePlaceholder')}
                data-testid="profile-account-phone-input"
              />
              <Input
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                className="w-32"
                placeholder={t('account.codePlaceholder')}
                data-testid="profile-account-phone-code-input"
              />
              <Button variant="outline" disabled={phoneCd > 0 || sendCode.isPending} onClick={sendPhoneCode} data-testid="profile-account-phone-send-code">
                {phoneCd > 0 ? t('account.resendIn', { n: phoneCd }) : t('account.getCode')}
              </Button>
              <Button disabled={phoneCode.length !== 6 || bindContact.isPending} onClick={bindPhone} data-testid="profile-account-phone-bind">
                {t('account.bind')}
              </Button>
            </div>
            {phoneErr ? <p className="text-xs text-destructive">{phoneErr}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-[120px_1fr] items-start gap-3">
          <span className="pt-2 text-sm text-foreground">{t('account.email')}</span>
          <div className="space-y-2">
            <div className="flex max-w-2xl flex-wrap items-center gap-2">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-48 ${emailErr ? 'border-destructive' : ''}`}
                placeholder={t('account.emailPlaceholder')}
              />
              <Input
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                className="w-32"
                placeholder={t('account.codePlaceholder')}
              />
              <Button variant="outline" disabled={emailCd > 0 || sendCode.isPending} onClick={sendEmailCode}>
                {emailCd > 0 ? t('account.resendIn', { n: emailCd }) : t('account.getCode')}
              </Button>
              <Button disabled={emailCode.length !== 6 || bindContact.isPending} onClick={bindEmail}>
                {t('account.bind')}
              </Button>
            </div>
            {emailErr ? <p className="text-xs text-destructive">{emailErr}</p> : null}
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="space-y-3">
          <ReadonlyRow label={t('account.lastLoginTime')} value={formatTimestamp(account.lastLoginTime) || '—'} />
          <ReadonlyRow label={t('account.lastLoginIp')} value={account.lastLoginIp || '—'} />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { setName(account.name || ''); setNameErr(''); }} data-testid="profile-account-cancel">
            {tc('cancel')}
          </Button>
          <Button disabled={!name.trim() || updateName.isPending} onClick={save} data-testid="profile-account-save">
            {updateName.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {updateName.isPending ? tc('loading') : tc('save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
