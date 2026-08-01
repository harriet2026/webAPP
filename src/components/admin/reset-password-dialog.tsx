'use client';

// GT-12314：独立「重置密码」对话框（原型 layer-2a）。
// 行「重置密码」→ 打开本对话框：可手输或「生成」16 位随机密码（明文
// text 展示，原型 D-006 语义——管理员需要读到并转交这串密码）；有值时
// 出现「复制密码」（clipboard → toast「密码已复制」）。提交复用平台
// PUT /users/:id / 租户 PUT /tenant-users/:id 的 password 字段，服务端
// 会按目标账号所在作用域的密码策略校验，并自动置 must_change_password
// （管理员代设的密码是临时密码，用户首登须改）。

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, Copy, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

// 生成 16 位随机密码：大写/小写/数字/特殊各至少 1 个（满足后端
// N-of-4 复杂度的最严配置），剔除易混淆字符（I/l/O/0/1）。
export function generatePassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = chars.length; i < length; i++) chars.push(pick(all));
  // Fisher-Yates 打乱，避免"前四位固定为各类别"的可预测模式
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 目标账号用户名（对话框描述文案用） */
  username: string;
  /** 提交回调：由调用方按平台/租户视角调对应 API，抛错则展示错误 */
  onSubmit: (password: string) => Promise<void>;
}

export function ResetPasswordDialog({ open, onOpenChange, username, onSubmit }: ResetPasswordDialogProps) {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const close = (next: boolean) => {
    if (!next) setPassword('');
    onOpenChange(next);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success(t('users.resetPassword.copied'));
    } catch {
      toast.error(t('users.resetPassword.copyFailed'));
    }
  };

  const handleSubmit = async () => {
    if (!password) {
      toast.error(t('users.validation.passwordRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(password);
      toast.success(t('users.resetPassword.success'));
      close(false);
    } catch (e) {
      // 服务端按目标作用域的密码策略校验，失败消息（长度/复杂度）直接透传。
      // GT-12614 刻意保留这条透传：密码策略按租户可配，服务端返回的就是当前生效
      // 策略的权威描述，前端没有等价文案可替代（同 tenant-form-drawer 的
      // admin_password_weak 分支）。守卫见 reset-password-dialog.test.tsx。
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent data-testid="reset-password-dialog" className="max-w-md rounded-[28px] border-border/70 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t('users.resetPassword.title')}
          </DialogTitle>
          <DialogDescription>{t('users.resetPassword.description', { username })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>
            {t('users.resetPassword.newPassword')} <span className="text-destructive">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              data-testid="reset-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('users.resetPassword.placeholder')}
              autoComplete="new-password"
            />
            <Button
              type="button"
              variant="outline"
              data-testid="reset-password-generate"
              onClick={() => setPassword(generatePassword())}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {t('users.resetPassword.generate')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('users.resetPassword.hint')}</p>
          {password && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              data-testid="reset-password-copy"
              onClick={handleCopy}
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              {t('users.resetPassword.copy')}
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" data-testid="reset-password-submit" disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t('users.resetPassword.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
