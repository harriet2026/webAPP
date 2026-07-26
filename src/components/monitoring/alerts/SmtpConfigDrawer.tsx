'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApiRequest } from '@/lib/api/client';
import { testSmtpConfig } from '@/lib/api/monitoring';
import { useSmtpConfig, usePutSmtpConfig } from './hooks';
import type { SmtpConfigPayload, SmtpAuthMethod, SmtpEncryption } from '@/types/alerts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PW_MASK = '••••••••••••';

export function SmtpConfigDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations('alertCenter');
  const { apiRequest } = useApiRequest();
  const { data: cfg } = useSmtpConfig(open);
  const put = usePutSmtpConfig();

  const [form, setForm] = useState<SmtpConfigPayload | null>(null);
  const [pwPlaceholder, setPwPlaceholder] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Re-seed the form from the saved config every time the drawer OPENS (not just
  // when cfg's reference changes). cfg is a stable react-query cached object, so
  // depending on [cfg] alone meant "discard changes → reopen" showed the discarded
  // edits — the drawer is always mounted and never reset on close.
  useEffect(() => {
    if (open && cfg) {
      setForm({
        use_internal_postfix: cfg.use_internal_postfix, server: cfg.server, port: cfg.port,
        encryption: cfg.encryption, auth_method: cfg.auth_method, username: cfg.username,
        sender_email: cfg.sender_email, sender_name: cfg.sender_name,
        connect_timeout_seconds: cfg.connect_timeout_seconds, send_timeout_seconds: cfg.send_timeout_seconds,
        password: '',
      });
      setPwPlaceholder(cfg.password_configured);
      setErrors({});
      setTestMsg(null);
    }
  }, [cfg, open]);

  const dirty = useMemo(() => {
    if (!form || !cfg) return false;
    return form.server !== cfg.server || form.port !== cfg.port || form.encryption !== cfg.encryption
      || form.auth_method !== cfg.auth_method || form.username !== cfg.username
      || form.sender_email !== cfg.sender_email || form.sender_name !== cfg.sender_name
      || form.use_internal_postfix !== cfg.use_internal_postfix
      || form.connect_timeout_seconds !== cfg.connect_timeout_seconds
      || form.send_timeout_seconds !== cfg.send_timeout_seconds
      || (!!form.password && form.password.length > 0);
  }, [form, cfg]);

  const set = <K extends keyof SmtpConfigPayload>(k: K, v: SmtpConfigPayload[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const onEncryption = (v: SmtpEncryption) =>
    setForm((f) => (f ? { ...f, encryption: v, port: v === 'none' ? 25 : v === 'starttls' ? 587 : 465 } : f));

  const requestClose = () => { if (dirty) setConfirmClose(true); else onOpenChange(false); };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (form && !form.use_internal_postfix) {
      if (!form.server.trim()) e.server = t('smtp.err.server');
      if (form.port < 1 || form.port > 65535) e.port = t('smtp.err.port');
      if (!EMAIL_RE.test(form.sender_email)) e.sender = t('smtp.err.sender');
      if (form.auth_method !== 'none' && !form.username.trim()) e.username = t('smtp.err.username');
      // A password is required only when none is stored server-side AND none is
      // typed. Use the persisted cfg.password_configured (not the transient
      // pwPlaceholder, which flips to false on focus) so merely clicking into the
      // masked field doesn't force the admin to re-type an already-stored password.
      if (form.auth_method !== 'none' && !cfg?.password_configured && !form.password) e.password = t('smtp.err.password');
      if (form.password && !cfg?.enc_key_ready) e.password = t('smtp.err.noEncKey');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSave = async (closeAfter: boolean) => {
    if (!form || !validate()) return;
    const payload: SmtpConfigPayload = { ...form };
    if (!form.password) delete payload.password;
    try {
      await put.mutateAsync(payload);
      toast.success(t('smtp.saved'));
      if (closeAfter) onOpenChange(false);
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? t('smtp.saveFailed'));
    }
  };

  const onTest = async () => {
    if (!form || !validate()) return;
    if (!EMAIL_RE.test(testEmail)) { setErrors((e) => ({ ...e, testEmail: t('smtp.err.testEmail') })); return; }
    setTesting(true); setTestMsg(null);
    try {
      // Test the CURRENT form values (unsaved), not the last-saved config —
      // otherwise editing server/port/auth then clicking Test silently probes
      // the old config (review M7). A blank password is reused server-side.
      const payload: SmtpConfigPayload = { ...form };
      if (!form.password) delete payload.password;
      const r = await testSmtpConfig(testEmail, payload, apiRequest);
      setTestMsg({ ok: r.success, text: r.message });
    } catch (err) {
      setTestMsg({ ok: false, text: (err as { message?: string })?.message ?? t('smtp.testFailed') });
    } finally {
      setTesting(false);
    }
  };

  if (!form) return null;
  const authOptions: SmtpAuthMethod[] = ['none', 'plain', 'login'];

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(v) => { if (!v) requestClose(); else onOpenChange(true); }}
      >
        <SheetContent side="right" className="flex w-[80vw] min-w-[720px] flex-col p-0 sm:max-w-none" data-testid="smtp-config-drawer">
          <div className="border-b p-4 text-lg font-semibold">{t('smtp.title')}</div>
          <div className="flex-1 space-y-6 overflow-y-auto p-6" data-testid="smtp-form">
            {!cfg?.enc_key_ready && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                {t('smtp.encKeyMissing')}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label>{t('smtp.useInternal')}</Label>
              <Switch checked={form.use_internal_postfix} onCheckedChange={(v) => set('use_internal_postfix', v)} />
            </div>

            {!form.use_internal_postfix && (
              <div className="space-y-4" data-testid="smtp-external">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label>{t('smtp.server')} *</Label>
                    <Input value={form.server} onChange={(e) => set('server', e.target.value)} className={errors.server ? 'border-red-500' : ''} placeholder="smtp.company.com" />
                    {errors.server && <p className="text-xs text-red-500">{errors.server}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{t('smtp.port')} *</Label>
                    <Input type="number" value={form.port} onChange={(e) => set('port', Number(e.target.value))} className={errors.port ? 'border-red-500' : ''} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('smtp.encryption')} *</Label>
                  <RadioGroup value={form.encryption} onValueChange={(v) => onEncryption(v as SmtpEncryption)} className="flex gap-4">
                    <label className="flex items-center gap-2"><RadioGroupItem value="none" id="enc-none" />{t('smtp.encNone')}</label>
                    <label className="flex items-center gap-2"><RadioGroupItem value="starttls" id="enc-starttls" />STARTTLS</label>
                    <label className="flex items-center gap-2"><RadioGroupItem value="ssl" id="enc-ssl" />SSL/TLS</label>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>{t('smtp.auth')} *</Label>
                  <RadioGroup value={form.auth_method} onValueChange={(v) => set('auth_method', v as SmtpAuthMethod)} className="flex gap-4">
                    {authOptions.map((a) => (
                      <label key={a} className="flex items-center gap-2"><RadioGroupItem value={a} id={`auth-${a}`} />{t(`smtp.auth_${a}`)}</label>
                    ))}
                  </RadioGroup>
                </div>

                {form.auth_method !== 'none' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('smtp.username')} *</Label>
                      <Input value={form.username} onChange={(e) => set('username', e.target.value)} className={errors.username ? 'border-red-500' : ''} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('smtp.password')} *</Label>
                      <Input
                        type="password"
                        value={pwPlaceholder ? PW_MASK : (form.password ?? '')}
                        onFocus={() => { if (pwPlaceholder) { setPwPlaceholder(false); set('password', ''); } }}
                        onChange={(e) => set('password', e.target.value)}
                        className={errors.password ? 'border-red-500' : ''}
                      />
                      {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('smtp.senderEmail')} *</Label>
                    <Input value={form.sender_email} onChange={(e) => set('sender_email', e.target.value)} className={errors.sender ? 'border-red-500' : ''} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('smtp.senderName')}</Label>
                    <Input value={form.sender_name} onChange={(e) => set('sender_name', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <Label>{t('smtp.testRecipient')}</Label>
              <div className="flex items-end gap-3">
                <Input className="flex-1" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="admin@company.com" />
                <Button onClick={onTest} disabled={testing} data-testid="smtp-test-btn">
                  {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {t('smtp.sendTest')}
                </Button>
              </div>
              {testMsg && (
                <div className={`rounded-lg border p-3 text-sm ${testMsg.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`} data-testid="smtp-test-result">
                  {testMsg.text}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t p-4">
            <Button variant="outline" onClick={requestClose}>{t('cancel')}</Button>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => onSave(false)} disabled={put.isPending}>{t('save')}</Button>
              <Button onClick={() => onSave(true)} disabled={put.isPending} data-testid="smtp-save-close">{t('smtp.saveClose')}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('smtp.unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('smtp.unsavedDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmClose(false); onOpenChange(false); }}>{t('smtp.leave')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setConfirmClose(false)}>{t('smtp.continueEdit')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
