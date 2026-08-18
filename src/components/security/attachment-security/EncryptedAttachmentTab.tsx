'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Direction, EncryptedActionConfig, EncryptedConfig } from '@/types/attachment-security';
import { PasswordBookTable } from './PasswordBookTable';

export const DEFAULT_ENCRYPTED_CONFIG: EncryptedConfig = {
  detect_mode: 'detect_only',
  extract_password_from_body: true,
  extract_password_from_filename: true,
  use_password_book: true,
  recursive_detect: true,
  max_password_attempts: 100,
  mark_suspicious: true,
};

export const DEFAULT_ENCRYPTED_ACTIONS: EncryptedActionConfig = {
  decrypt_fail_action: 'accept',
};

interface EncryptedAttachmentTabProps {
  direction?: Direction;
  config: EncryptedConfig;
  actions: EncryptedActionConfig;
  onChange: (config: EncryptedConfig) => void;
  onActionsChange: (config: EncryptedActionConfig) => void;
}

export function EncryptedAttachmentTab({
  direction = 'receive',
  config,
  actions,
  onChange,
  onActionsChange,
}: EncryptedAttachmentTabProps) {
  const t = useTranslations('attachmentSecurity');

  const infoLabel = (label: string, tip: string, testId: string) => (
    <span className="flex items-center gap-1.5">
      {label}
      <Tooltip>
        <TooltipTrigger render={<button type="button" className="text-muted-foreground" aria-label={tip} data-testid={`${testId}-help`} />}>
          <Info className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-xs" data-testid={`${testId}-tooltip`}>{tip}</TooltipContent>
      </Tooltip>
    </span>
  );

  return (
    <div className="space-y-6" data-testid="encrypted-attachment-tab" data-direction={direction}>
      <section className="space-y-3">
        <Label>{infoLabel(t('encrypted.detectPolicy'), t('tooltips.encryptedMode'), 'encrypted-detect-mode')}</Label>
        <Select value={config.detect_mode} onValueChange={(mode) => onChange({ ...config, detect_mode: mode as EncryptedConfig['detect_mode'] })}>
          <SelectTrigger className="w-[360px] max-w-full" data-testid="encrypted-detect-mode"><SelectValue /></SelectTrigger>
          <SelectContent data-testid="encrypted-detect-mode-options">
            <SelectItem value="none" data-testid="encrypted-detect-mode-none">{t('encrypted.mode_none')}</SelectItem>
            <SelectItem value="detect_only" data-testid="encrypted-detect-mode-detect-only">{t('encrypted.mode_detectOnly')}</SelectItem>
            <SelectItem value="decrypt" data-testid="encrypted-detect-mode-decrypt">{t('encrypted.mode_deep')}</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-3">
        <Label>{infoLabel(t('encrypted.decryptFailAction'), t('tooltips.decryptFailAction'), 'decrypt-fail-action')}</Label>
        <Select
          value={actions.decrypt_fail_action}
          onValueChange={(action) => onActionsChange({ decrypt_fail_action: action as EncryptedActionConfig['decrypt_fail_action'] })}
        >
          <SelectTrigger className="w-[220px] max-w-full" data-testid="decrypt-fail-action"><SelectValue /></SelectTrigger>
          <SelectContent data-testid="decrypt-fail-action-options">
            <SelectItem value="quarantine" data-testid="decrypt-fail-action-quarantine">{t('actions.quarantine')}</SelectItem>
            <SelectItem value="accept" data-testid="decrypt-fail-action-accept">{t('actions.accept')}</SelectItem>
            <SelectItem value="reject" data-testid="decrypt-fail-action-reject">{t('actions.reject')}</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-3">
        <Label className="font-medium">{t('encrypted.passwordSources')}</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.extract_password_from_body}
              onCheckedChange={(checked) => onChange({ ...config, extract_password_from_body: checked === true })}
              data-testid="extract-password-from-body"
            />
            {t('encrypted.extractFromBody')}
          </label>
          {/* GT-12200: 从附件文件名提取密码。该能力后端一直是通的
              （configs/attachd/attachd.cf [encrypted] extract_password_from_filename，
              由 cmd/attachd/internal/encrypted_workflow.go:14 消费），前端类型与默认值
              也都有，唯独漏了这个勾选框 —— 结果是它被强制按默认值生效且无法关闭。 */}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.extract_password_from_filename}
              onCheckedChange={(checked) => onChange({ ...config, extract_password_from_filename: checked === true })}
              data-testid="extract-password-from-filename"
            />
            {t('encrypted.extractFromFilename')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.use_password_book}
              onCheckedChange={(checked) => onChange({ ...config, use_password_book: checked === true })}
              data-testid="use-password-book"
            />
            {t('encrypted.usePasswordBook')}
          </label>
        </div>
      </section>

      {config.use_password_book && <PasswordBookTable />}

      <section className="space-y-3">
        <Label className="font-medium">{t('encrypted.advancedOptions')}</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.recursive_detect}
              onCheckedChange={(checked) => onChange({ ...config, recursive_detect: checked === true })}
              data-testid="encrypted-recursive-detect"
            />
            {t('encrypted.recursiveDetectDepth')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.mark_suspicious}
              onCheckedChange={(checked) => onChange({ ...config, mark_suspicious: checked === true })}
              data-testid="encrypted-mark-suspicious"
            />
            {t('encrypted.markSuspicious')}
          </label>
        </div>
      </section>
    </div>
  );
}
