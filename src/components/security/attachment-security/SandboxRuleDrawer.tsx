'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DirectionSwitcher } from './DirectionSwitcher';
import { useApiRequest, ApiError } from '@/lib/api/client';
import {
  createSandboxRule,
  updateSandboxRule,
} from '@/lib/api/attachment-security';
import type {
  SandboxRule,
  SandboxRiskAction,
  SandboxTimeoutActionType,
} from '@/types/attachment-security';

const FILE_TYPE_CATEGORY_KEYS = [
  'executable',
  'macro_doc',
  'script',
  'archive',
  'pdf',
] as const;

const RISK_ACTION_OPTIONS: SandboxRiskAction[] = ['quarantine', 'audit', 'discard'];
const TIMEOUT_ACTION_OPTIONS: SandboxTimeoutActionType[] = [
  'recall',
  'notify_admin',
  'notify_recipient',
];

function emptyDraft(): SandboxRule {
  return {
    name: '',
    enabled: true,
    direction: 'both',
    sender_recipient_filter_enabled: false,
    file_type_categories: [],
    custom_extensions: [],
    max_file_size_mb: 20,
    risk_actions: { low: 'audit', medium: 'quarantine', high: 'discard' },
    timeout: { timeout_sec: 120, actions: ['notify_admin'] },
    created_at: '',
    updated_at: '',
  };
}

function isValidationError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  return err.message || null;
}

interface SandboxRuleDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: SandboxRule | null;
  onSaved: () => void;
}

export function SandboxRuleDrawer({
  open,
  onOpenChange,
  rule,
  onSaved,
}: SandboxRuleDrawerProps) {
  const t = useTranslations('attachmentSecurity.sandbox');
  const tdir = useTranslations('attachmentSecurity.direction');
  const { apiRequest } = useApiRequest();

  const [draft, setDraft] = useState<SandboxRule>(emptyDraft());
  const [extInput, setExtInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(rule ? { ...rule } : emptyDraft());
      setExtInput('');
      setErrors({});
    }
  }, [open, rule]);

  const toggleFileTypeCategory = (key: string) => {
    setDraft((d) => {
      const has = d.file_type_categories.includes(key);
      return {
        ...d,
        file_type_categories: has
          ? d.file_type_categories.filter((k) => k !== key)
          : [...d.file_type_categories, key],
      };
    });
  };

  const addCustomExtension = () => {
    const raw = extInput.trim();
    if (!raw) return;
    if (!raw.startsWith('.')) {
      setErrors((e) => ({ ...e, customExt: t('errors.invalidExtFormat') }));
      return;
    }
    if (draft.custom_extensions.includes(raw)) {
      setErrors((e) => ({ ...e, customExt: t('errors.duplicateExt') }));
      return;
    }
    setDraft((d) => ({ ...d, custom_extensions: [...d.custom_extensions, raw] }));
    setExtInput('');
    setErrors((e) => ({ ...e, customExt: '' }));
  };

  const removeCustomExtension = (ext: string) => {
    setDraft((d) => ({
      ...d,
      custom_extensions: d.custom_extensions.filter((e) => e !== ext),
    }));
  };

  const setRiskAction = (level: 'low' | 'medium' | 'high', action: SandboxRiskAction) => {
    setDraft((d) => ({
      ...d,
      risk_actions: { ...d.risk_actions, [level]: action },
    }));
  };

  const toggleTimeoutAction = (action: SandboxTimeoutActionType) => {
    setDraft((d) => {
      const has = d.timeout.actions.includes(action);
      return {
        ...d,
        timeout: {
          ...d.timeout,
          actions: has
            ? d.timeout.actions.filter((a) => a !== action)
            : [...d.timeout.actions, action],
        },
      };
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = t('errors.needName');
    if (draft.file_type_categories.length === 0 && draft.custom_extensions.length === 0) {
      next.fileType = t('errors.needFileTypeOrExt');
    }
    if (draft.timeout.actions.length === 0) {
      next.timeoutAction = t('errors.needTimeoutAction');
    }
    setErrors((e) => ({ ...e, ...next, name: next.name ?? '', fileType: next.fileType ?? '', timeoutAction: next.timeoutAction ?? '' }));
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error(t('validationFailed'));
      return;
    }
    setSaving(true);
    try {
      if (rule?.id) {
        await updateSandboxRule(rule.id, draft, apiRequest);
        toast.success(t('updated'));
      } else {
        await createSandboxRule(draft, apiRequest);
        toast.success(t('created'));
      }
      onSaved();
    } catch (err) {
      toast.error(isValidationError(err) ?? t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{rule ? t('editTitle') : t('createTitle')}</SheetTitle>
          <SheetDescription>{t('sheetDescription')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sandbox-rule-name">{t('colName')}</Label>
            <Input
              id="sandbox-rule-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t('namePlaceholder')}
              data-testid="sandbox-rule-name-input"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">{t('sectionScope')}</Label>
            <DirectionSwitcher
              value={draft.direction}
              onChange={(direction) => setDraft((d) => ({ ...d, direction }))}
            />
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="sandbox-recipient-filter" className="text-sm">
                {t('recipientFilter')}
              </Label>
              <Switch
                id="sandbox-recipient-filter"
                checked={draft.sender_recipient_filter_enabled}
                onCheckedChange={(checked) =>
                  setDraft((d) => ({ ...d, sender_recipient_filter_enabled: checked }))
                }
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">{t('sectionFileType')}</Label>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('fileTypeCategoriesLabel')}</p>
              <div className="space-y-2">
                {FILE_TYPE_CATEGORY_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={`sandbox-filetype-${key}`}
                      checked={draft.file_type_categories.includes(key)}
                      onCheckedChange={() => toggleFileTypeCategory(key)}
                    />
                    <Label htmlFor={`sandbox-filetype-${key}`} className="text-sm font-normal">
                      {t(`fileTypeCategories.${key}`)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sandbox-custom-ext">{t('customExtLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  id="sandbox-custom-ext"
                  value={extInput}
                  onChange={(e) => setExtInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addCustomExtension();
                    }
                  }}
                  placeholder={t('customExtPlaceholder')}
                />
                <Button type="button" variant="outline" onClick={addCustomExtension}>
                  {t('customExtLabel')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('customExtHint')}</p>
              {errors.customExt && (
                <p className="text-xs text-destructive">{errors.customExt}</p>
              )}
              {draft.custom_extensions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {draft.custom_extensions.map((ext) => (
                    <button
                      key={ext}
                      type="button"
                      onClick={() => removeCustomExtension(ext)}
                      className="rounded-full border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      {ext} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
            {errors.fileType && <p className="text-xs text-destructive">{errors.fileType}</p>}

            <div className="space-y-1.5">
              <Label htmlFor="sandbox-max-size">{t('maxFileSizeLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="sandbox-max-size"
                  type="number"
                  min={1}
                  value={draft.max_file_size_mb}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, max_file_size_mb: Number(e.target.value) || 0 }))
                  }
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">MB</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('maxFileSizeHint')}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">{t('sectionRiskAction')}</Label>
            <p className="text-xs text-muted-foreground">{t('riskActionHint')}</p>
            <div className="space-y-2">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <div key={level} className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-normal">{t(`riskLevel${level.charAt(0).toUpperCase()}${level.slice(1)}`)}</Label>
                  <Select
                    value={draft.risk_actions[level]}
                    onValueChange={(v) => setRiskAction(level, v as SandboxRiskAction)}
                  >
                    <SelectTrigger className="w-40" data-testid={`sandbox-risk-action-${level}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_ACTION_OPTIONS.map((action) => (
                        <SelectItem key={action} value={action}>
                          {t(`riskActionOptions.${action}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">{t('sectionTimeout')}</Label>
            <div className="space-y-1.5">
              <Label htmlFor="sandbox-timeout-sec">{t('timeoutSecLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="sandbox-timeout-sec"
                  type="number"
                  min={1}
                  value={draft.timeout.timeout_sec}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      timeout: { ...d.timeout, timeout_sec: Number(e.target.value) || 0 },
                    }))
                  }
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">
                  {t('timeoutSecLabel').includes('秒') ? '' : 's'}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{t('timeoutActionLabel')}</Label>
              <p className="text-xs text-muted-foreground">{t('timeoutActionHint')}</p>
              <div className="space-y-2">
                {TIMEOUT_ACTION_OPTIONS.map((action) => (
                  <div key={action} className="flex items-center gap-2">
                    <Checkbox
                      id={`sandbox-timeout-action-${action}`}
                      checked={draft.timeout.actions.includes(action)}
                      onCheckedChange={() => toggleTimeoutAction(action)}
                    />
                    <Label
                      htmlFor={`sandbox-timeout-action-${action}`}
                      className="text-sm font-normal"
                    >
                      {t(`timeoutAction.${action}`)}
                    </Label>
                  </div>
                ))}
              </div>
              {draft.timeout.actions.includes('notify_recipient') && (
                <p className="text-xs text-muted-foreground">{t('timeoutActionNotifyHint')}</p>
              )}
              {errors.timeoutAction && (
                <p className="text-xs text-destructive">{errors.timeoutAction}</p>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="sandbox-rule-enabled" className="text-sm">
              {t('enabledLabel')}
            </Label>
            <Switch
              id="sandbox-rule-enabled"
              checked={draft.enabled}
              onCheckedChange={(checked) => setDraft((d) => ({ ...d, enabled: checked }))}
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} data-testid="sandbox-rule-save">
            {saving ? t('saving') : t('save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
