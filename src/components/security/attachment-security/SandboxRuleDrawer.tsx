'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiRequest, ApiError } from '@/lib/api/client';
import {
  createSandboxRule,
  updateSandboxRule,
} from '@/lib/api/attachment-security';
import type {
  SandboxRule,
  SandboxRiskAction,
  SandboxAttachmentPolicy,
  SandboxMarkLocation,
  SandboxTimeoutActionType,
  Direction,
} from '@/types/attachment-security';

const FILE_TYPE_CATEGORY_KEYS = ['office', 'script', 'exec'] as const;

const FILE_TYPE_CHILDREN: Record<(typeof FILE_TYPE_CATEGORY_KEYS)[number], string[]> = {
  office: [
    'wps', 'wpt', 'doc', 'dot', 'docx', 'dotx', 'docm', 'dotm', 'pptx', 'pptm',
    'potx', 'potm', 'ppsx', 'ppsm', 'et', 'ett', 'xls', 'xlsm', 'xltx', 'xltm',
    'xlt', 'rtf',
  ],
  script: ['jar', 'js', 'pl', 'py', 'pyc'],
  exec: ['exe', 'bin', 'cmd', 'com', 'bat'],
};

/** 沙箱规则的检测范围方向支持多选（接收/外发/域内可任意组合），与其他
 * 沙箱检测子模块共用的单选 `DirectionSwitcher` 语义不同，故在本组件内单独
 * 实现一个多选分段控件，不改动共享的 `DirectionSwitcher`。 */
const SANDBOX_DIRECTIONS: Direction[] = ['receive', 'send', 'internal'];

const RISK_ACTION_OPTIONS: SandboxRiskAction[] = ['quarantine', 'audit', 'discard', 'none'];
const ATTACHMENT_POLICY_OPTIONS: SandboxAttachmentPolicy[] = ['mark', 'discard', 'none'];
const MARK_LOCATION_OPTIONS: SandboxMarkLocation[] = ['subject', 'header', 'body_start'];
const TIMEOUT_ACTION_OPTIONS: SandboxTimeoutActionType[] = [
  'recall',
  'notify_admin',
  'notify_recipient',
];

function emptyDraft(): SandboxRule {
  return {
    name: '',
    enabled: true,
    direction: ['receive'],
    sender_recipient_filter_enabled: false,
    file_type_categories: [],
    custom_extensions: [],
      risk_actions: {
      low: { action: 'audit', attachment_policy: 'mark', mark_locations: ['subject'] },
      medium: {
        action: 'quarantine',
        attachment_policy: 'mark',
        mark_locations: ['subject', 'header'],
      },
      high: { action: 'discard', attachment_policy: 'discard', mark_locations: [] },
    },
    timeout: { actions: ['notify_admin'] },
    created_at: '',
    updated_at: '',
  };
}

function isValidationError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  return err.message || null;
}

function SectionHeading({ index, label }: { index: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary',
        )}
      >
        {index}
      </span>
      <Label className="text-sm font-medium">{label}</Label>
    </div>
  );
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
  const [fileTypePickerOpen, setFileTypePickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(rule ? { ...rule } : emptyDraft());
      setExtInput('');
      setErrors({});
    }
  }, [open, rule]);

  const toggleDirection = (dir: Direction) => {
    setDraft((d) => {
      const has = d.direction.includes(dir);
      if (has && d.direction.length === 1) return d;
      return {
        ...d,
        direction: has ? d.direction.filter((v) => v !== dir) : [...d.direction, dir],
      };
    });
  };

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
      risk_actions: {
        ...d.risk_actions,
        [level]: { ...d.risk_actions[level], action },
      },
    }));
  };

  const setRiskAttachmentPolicy = (
    level: 'low' | 'medium' | 'high',
    policy: SandboxAttachmentPolicy,
  ) => {
    setDraft((d) => ({
      ...d,
      risk_actions: {
        ...d.risk_actions,
        [level]: {
          ...d.risk_actions[level],
          attachment_policy: policy,
          // 切出“标记”时清空标记位置，避免残留无效数据；切入“标记”时若尚
          // 无任何位置，不强制补默认值，允许为空（不要求至少保留一项）。
          mark_locations: policy === 'mark' ? d.risk_actions[level].mark_locations : [],
        },
      },
    }));
  };

  const toggleMarkLocation = (level: 'low' | 'medium' | 'high', loc: SandboxMarkLocation) => {
    setDraft((d) => {
      const current = d.risk_actions[level].mark_locations;
      const has = current.includes(loc);
      return {
        ...d,
        risk_actions: {
          ...d.risk_actions,
          [level]: {
            ...d.risk_actions[level],
            mark_locations: has ? current.filter((v) => v !== loc) : [...current, loc],
          },
        },
      };
    });
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
          ...(action === 'notify_admin' && has ? { admin_email: '' } : {}),
        },
      };
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = t('errors.needName');
    if (draft.direction.length === 0) {
      next.direction = t('errors.needDirection');
    }
    if (draft.file_type_categories.length === 0 && draft.custom_extensions.length === 0) {
      next.fileType = t('errors.needFileTypeOrExt');
    }
    if (draft.timeout.actions.length === 0) {
      next.timeoutAction = t('errors.needTimeoutAction');
    }
    if (draft.timeout.actions.includes('notify_admin')) {
      const adminEmail = draft.timeout.admin_email?.trim() ?? '';
      if (!adminEmail) {
        next.adminEmail = t('errors.needAdminEmail');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
        next.adminEmail = t('errors.invalidAdminEmail');
      }
    }
    const riskActionInvalidLevel = (['low', 'medium', 'high'] as const).find((level) => {
      const cfg = draft.risk_actions[level];
      return cfg.action === 'none' && cfg.attachment_policy === 'none';
    });
    if (riskActionInvalidLevel) {
      next.riskAction = t('errors.needRiskAction');
    }
    setErrors((e) => ({
      ...e,
      ...next,
      name: next.name ?? '',
      direction: next.direction ?? '',
      fileType: next.fileType ?? '',
      timeoutAction: next.timeoutAction ?? '',
      adminEmail: next.adminEmail ?? '',
      riskAction: next.riskAction ?? '',
    }));
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
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{rule ? t('editTitle') : t('createTitle')}</SheetTitle>
          <SheetDescription>{t('sheetDescription')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
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

          <div className="space-y-3">
            <SectionHeading index={1} label={t('sectionScope')} />
            <div
              className="inline-flex rounded-2xl border border-border/70 bg-muted/30 p-1 gap-1"
              data-testid="sandbox-direction-multiselect"
            >
              {SANDBOX_DIRECTIONS.map((dir) => {
                const selected = draft.direction.includes(dir);
                return (
                  <button
                    key={dir}
                    type="button"
                    aria-pressed={selected}
                    data-testid={`sandbox-direction-${dir}`}
                    className={cn(
                      'inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                        : 'border border-input bg-background text-foreground hover:bg-muted/60',
                    )}
                    onClick={() => toggleDirection(dir)}
                  >
                    {tdir(dir)}
                  </button>
                );
              })}
            </div>
            {errors.direction && (
              <p className="text-xs text-destructive">{errors.direction}</p>
            )}
          </div>

            <div className="flex flex-col gap-3">
              <SectionHeading index={2} label={t('sectionFileType')} />
              <p className="text-xs text-muted-foreground">{t('fileTypePickerDescription')}</p>
              <Popover open={fileTypePickerOpen} onOpenChange={setFileTypePickerOpen}>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      className="flex min-h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left shadow-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={fileTypePickerOpen}
                      data-testid="sandbox-filetype-picker"
                    />
                  }
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {[...draft.file_type_categories, ...draft.custom_extensions].map((value) => (
                      <span
                        key={value}
                        className="inline-flex items-center gap-1 rounded-sm border bg-muted px-2 py-0.5 text-xs text-foreground"
                      >
                        {draft.file_type_categories.includes(value)
                          ? t(`fileTypeCategories.${value}`)
                          : value}
                        <button
                          type="button"
                          aria-label={`${t('removeExtension')} ${value}`}
                          className="rounded-sm text-muted-foreground hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (draft.file_type_categories.includes(value)) {
                              toggleFileTypeCategory(value);
                            } else {
                              removeCustomExtension(value);
                            }
                          }}
                        >
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                    {draft.file_type_categories.length === 0 && draft.custom_extensions.length === 0 && (
                      <span className="text-sm text-muted-foreground">{t('fileTypePickerPlaceholder')}</span>
                    )}
                  </div>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(500px,calc(100vw-3rem))] p-0">
                  <div className="max-h-64 overflow-y-auto p-2">
                    {FILE_TYPE_CATEGORY_KEYS.map((key) => {
                      const checked = draft.file_type_categories.includes(key);
                      return (
                        <div key={key} className="rounded-sm">
                          <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-muted">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleFileTypeCategory(key)}
                            />
                            <span className="font-medium">{t(`fileTypeCategories.${key}`)}</span>
                          </label>
                          {checked && FILE_TYPE_CHILDREN[key].length > 0 && (
                            <div className="ml-7 border-l pl-3">
                              {FILE_TYPE_CHILDREN[key].map((extension) => (
                                <div key={extension} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                                  <Checkbox checked readOnly aria-label={extension} />
                                  <span>{extension}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex flex-col gap-1.5">
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
                {errors.customExt && <p className="text-xs text-destructive">{errors.customExt}</p>}
              </div>
              {errors.fileType && <p className="text-xs text-destructive">{errors.fileType}</p>}

            </div>

          <div className="space-y-3">
            <SectionHeading index={3} label={t('sectionRiskAction')} />
            <p className="text-xs text-muted-foreground">{t('riskActionHint')}</p>
            <div className="space-y-3">
              {(['low', 'medium', 'high'] as const).map((level) => {
                const cfg = draft.risk_actions[level];
                return (
                  <div key={level} className="flex flex-col gap-3 rounded-lg border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Label className="text-sm font-normal">
                        {t(`riskLevel${level.charAt(0).toUpperCase()}${level.slice(1)}`)}
                      </Label>
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-normal text-muted-foreground">
                            {t('riskActionLabel')}
                          </Label>
                          <Select
                            value={cfg.action}
                            onValueChange={(v) => setRiskAction(level, v as SandboxRiskAction)}
                          >
                            <SelectTrigger
                              className="w-36"
                              data-testid={`sandbox-risk-action-${level}`}
                            >
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
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-normal text-muted-foreground">
                            {t('riskAttachmentPolicyLabel')}
                          </Label>
                          <Select
                            value={cfg.attachment_policy}
                            onValueChange={(v) =>
                              setRiskAttachmentPolicy(level, v as SandboxAttachmentPolicy)
                            }
                          >
                            <SelectTrigger
                              className="w-36"
                              data-testid={`sandbox-risk-attachment-policy-${level}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ATTACHMENT_POLICY_OPTIONS.map((policy) => (
                                <SelectItem key={policy} value={policy}>
                                  {t(`riskAttachmentPolicyOptions.${policy}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    {cfg.attachment_policy === 'mark' && (
                      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                        <Label className="text-xs font-normal text-muted-foreground">
                          {t('markLocationLabel')}
                        </Label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {MARK_LOCATION_OPTIONS.map((loc) => {
                            const selected = cfg.mark_locations.includes(loc);
                            return (
                              <button
                                key={loc}
                                type="button"
                                aria-pressed={selected}
                                data-testid={`sandbox-mark-location-${level}-${loc}`}
                                className={cn(
                                  'inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                  selected
                                    ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                                    : 'border border-input bg-background text-foreground hover:bg-muted/60',
                                )}
                                onClick={() => toggleMarkLocation(level, loc)}
                              >
                                {t(`markLocationOptions.${loc}`)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {errors.riskAction && (
              <p className="text-xs text-destructive">{errors.riskAction}</p>
            )}
          </div>

          <div className="space-y-3">
            <SectionHeading index={4} label={t('sectionTimeout')} />
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
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
                    {action === 'notify_admin' && draft.timeout.actions.includes('notify_admin') && (
                      <div className="ml-6 mt-2 flex flex-col gap-1.5">
                        <Label htmlFor="sandbox-admin-email" className="text-xs font-normal text-muted-foreground">
                          {t('timeoutAdminEmailLabel')}
                        </Label>
                        <Input
                          id="sandbox-admin-email"
                          type="email"
                          value={draft.timeout.admin_email ?? ''}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              timeout: { ...d.timeout, admin_email: e.target.value },
                            }))
                          }
                          placeholder={t('timeoutAdminEmailPlaceholder')}
                          aria-invalid={Boolean(errors.adminEmail)}
                          data-testid="sandbox-admin-email-input"
                        />
                        {errors.adminEmail && (
                          <p className="text-xs text-destructive">{errors.adminEmail}</p>
                        )}
                      </div>
                    )}
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

          <div className="flex items-center justify-between">
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

        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-3">
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
