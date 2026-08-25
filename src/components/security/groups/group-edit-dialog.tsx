'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Group, GroupType } from '@/types/groups';
import { isValidAddressMember, isValidIPOrCIDR } from '@/lib/api/group-validation';
import { Checkbox } from '@/components/ui/checkbox';

const NAME_RE = /^[A-Za-z0-9._\-一-龥]{1,64}$/;

// GT-12802：内容组的 scopes 选集（与后端 contentGroupScopeFields 对齐）。
// 默认三件套 = subject/text_body/html_body，可勾掉任一项以收窄匹配范围。
const CONTENT_SCOPE_DEFAULTS = ['subject', 'text_body', 'html_body'];
const CONTENT_SCOPE_CHOICES = [
  { value: 'subject', labelKey: 'contentScopeSubject' },
  { value: 'text_body', labelKey: 'contentScopeTextBody' },
  { value: 'html_body', labelKey: 'contentScopeHtmlBody' },
  { value: 'header', labelKey: 'contentScopeHeader' },
  { value: 'attachment_names', labelKey: 'contentScopeAttachmentNames' },
  { value: 'urls', labelKey: 'contentScopeUrls' },
] as const;

export interface GroupEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGroup: Group | null;
  initialType: GroupType;
  existingNames: string[];
  allowedTypes?: GroupType[];
  onSubmit: (values: { name: string; type: GroupType; members: string[]; scopes?: string[] }) => Promise<void>;
  // 类型选「特征组」时切到宽屏特征组抽屉（demo：同一抽屉内切换形态；webapp 拆成两个组件）
  onSwitchToFeature?: () => void;
}

const DEFAULT_ALLOWED_TYPES: GroupType[] = ['ip', 'sender', 'recipient', 'content'];

// 普通组新建/编辑：右侧抽屉（demo GroupDrawer 的 max-w-md 形态）
export function GroupEditDialog({
  open, onOpenChange, initialGroup, initialType, existingNames, allowedTypes = DEFAULT_ALLOWED_TYPES, onSubmit,
  onSwitchToFeature,
}: GroupEditDialogProps) {
  const t = useTranslations('groups');
  const tCommon = useTranslations('common');

  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [type, setType] = useState<GroupType>(initialType);
  const [membersText, setMembersText] = useState('');
  const [membersTouched, setMembersTouched] = useState(false);
  // GT-12802：内容组的 scopes。仅在 type === 'content' 时显示/提交。
  const [contentScopes, setContentScopes] = useState<string[]>(CONTENT_SCOPE_DEFAULTS);
  const [scopesTouched, setScopesTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEdit = initialGroup != null;

  useEffect(() => {
    if (open) {
      setName(initialGroup?.name ?? '');
      setNameTouched(false);
      setType(initialGroup?.type ?? initialType);
      setMembersText((initialGroup?.members ?? []).join('\n'));
      setMembersTouched(false);
      // GT-12802：编辑回显 scopes。缺失/空 → 默认三件套。
      const restored = initialGroup?.scopes && initialGroup.scopes.length > 0
        ? initialGroup.scopes
        : CONTENT_SCOPE_DEFAULTS;
      setContentScopes(restored);
      setScopesTouched(false);
      setErrorMsg(null);
    }
  }, [open, initialGroup, initialType]);

  const placeholderKey = `${type}Placeholder` as const;

  // 名称实时校验（spec §5.2：红框 + 提示 + 保存禁用）
  const trimmedName = name.trim();
  const nameEmpty = trimmedName.length === 0;
  const namePatternBad = !nameEmpty && !NAME_RE.test(trimmedName);
  const nameDuplicate = !isEdit && !nameEmpty && existingNames.includes(trimmedName);
  const nameInvalid = nameEmpty || namePatternBad || nameDuplicate;
  const showNameError = (nameTouched && nameEmpty) || namePatternBad || nameDuplicate;
  const nameErrorText = nameEmpty
    ? t('nameRequired')
    : namePatternBad
      ? t('namePattern')
      : t('duplicateName');

  // GT-12259：成员是必填项（标签上已标 *，validateMembers 也会拒绝空值），
  // 但保存按钮此前只看 nameInvalid —— 成员为空时按钮仍可点，点了才弹错误。
  // 改为与名称同一套口径：实时禁用 + 就地提示。
  const memberLines = membersText.split('\n').map(s => s.trim()).filter(Boolean);
  const membersEmpty = memberLines.length === 0;
  const showMembersError = membersEmpty && (membersTouched || nameTouched);

  // GT-12802：内容组至少要选一个 scope。
  const scopesEmpty = type === 'content' && contentScopes.length === 0;
  const showScopesError = scopesEmpty && (scopesTouched || nameTouched || membersTouched);

  const toggleScope = (scope: string, checked: boolean) => {
    setScopesTouched(true);
    setContentScopes(prev =>
      checked ? Array.from(new Set([...prev, scope])) : prev.filter(s => s !== scope),
    );
  };

  const validateMembers = (lines: string[]): string | null => {
    if (lines.length === 0) return t('noMembers');
    if (type === 'ip') {
      for (const l of lines) {
        if (!isValidIPOrCIDR(l)) {
          return t('invalidIp', { value: l });
        }
      }
    }
    if (type === 'sender' || type === 'recipient') {
      for (const l of lines) {
        if (!isValidAddressMember(l)) {
          return t('invalidMember', { value: l });
        }
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    setNameTouched(true);
    if (nameInvalid) return;
    setMembersTouched(true);
    if (type === 'content') setScopesTouched(true);
    if (scopesEmpty) return;
    const dedup = Array.from(new Set(memberLines));
    const memberErr = validateMembers(dedup);
    if (memberErr) { setErrorMsg(memberErr); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        type,
        members: dedup,
        scopes: type === 'content' ? contentScopes : undefined,
      });
      onOpenChange(false);
    } catch (e) {
      setErrorMsg((e as Error).message ?? 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full flex flex-col p-0" data-testid="group-edit-drawer" showCloseButton={false}>
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>
            {isEdit
              ? t('editGroup')
              : t('newGroupOfType', {
                  typeLabel: ({ ip: t('ipGroup'), sender: t('senderGroup'), recipient: t('recipientGroup'), content: t('contentGroup'), feature: t('featureGroup') })[type],
                })}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* 新建时：类型已由 Tab 上下文确定，直接全宽显示名称输入框
              编辑时：类型只读展示，名称禁止修改，两列并排保持原有布局 */}
          {isEdit ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('groupName')} *</Label>
                <Input
                  value={name}
                  onChange={e => { setName(e.target.value); if (!nameTouched) setNameTouched(true); }}
                  placeholder={t('namePlaceholder')}
                  disabled={true}
                  aria-invalid={showNameError || undefined}
                  className={showNameError ? 'border-destructive focus-visible:ring-destructive' : ''}
                  data-testid="group-edit-name"
                />
                {showNameError && (
                  <p className="text-xs text-destructive" data-testid="group-edit-name-error">{nameErrorText}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t('groupType')}</Label>
                <Input
                  value={({ ip: t('ipGroup'), sender: t('senderGroup'), recipient: t('recipientGroup'), content: t('contentGroup'), feature: t('featureGroup') })[type]}
                  disabled={true}
                  data-testid="group-edit-type-readonly"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{t('groupName')} *</Label>
              <Input
                value={name}
                onChange={e => { setName(e.target.value); if (!nameTouched) setNameTouched(true); }}
                placeholder={t('namePlaceholder')}
                aria-invalid={showNameError || undefined}
                className={showNameError ? 'border-destructive focus-visible:ring-destructive' : ''}
                data-testid="group-edit-name"
              />
              {showNameError && (
                <p className="text-xs text-destructive" data-testid="group-edit-name-error">{nameErrorText}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>{type === 'content' ? t('contentMemberListPerLine') : t('memberListPerLine')} *</Label>
            <Textarea
              rows={8}
              value={membersText}
              onChange={e => { setMembersText(e.target.value); if (!membersTouched) setMembersTouched(true); }}
              placeholder={t(placeholderKey)}
              aria-invalid={showMembersError || undefined}
              className={showMembersError ? 'border-destructive focus-visible:ring-destructive' : ''}
              data-testid="group-edit-members"
            />
            {showMembersError && (
              <p className="text-xs text-destructive" data-testid="group-edit-members-error">{t('noMembers')}</p>
            )}
          </div>
          {type === 'content' && (
            <div className="space-y-2" data-testid="group-edit-content-scopes">
              <Label>{t('contentScopes')}</Label>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                {CONTENT_SCOPE_CHOICES.map(choice => (
                  <label key={choice.value} className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
                    <Checkbox
                      checked={contentScopes.includes(choice.value)}
                      onCheckedChange={(checked) => toggleScope(choice.value, checked === true)}
                      data-testid={`group-edit-scope-${choice.value}`}
                    />
                    <span>{t(choice.labelKey)}</span>
                  </label>
                ))}
              </div>
              {showScopesError && (
                <p className="text-xs text-destructive" data-testid="group-edit-scopes-error">{t('noScopes')}</p>
              )}
            </div>
          )}
          {errorMsg && <p className="text-sm text-destructive" data-testid="group-edit-error">{errorMsg}</p>}
        </div>
        <SheetFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tCommon('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={submitting || nameInvalid || membersEmpty || scopesEmpty} data-testid="group-edit-save">
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {tCommon('save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
