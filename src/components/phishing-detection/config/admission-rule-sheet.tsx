'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useApiRequest } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { GROUPS_LIST_QUERY, ruleToGroup } from '@/lib/api/groups';
import { listContactDepartments } from '@/lib/api/contacts';
import { createAdmissionRule, updateAdmissionRule } from '@/lib/api/phishing-admission-rules';
import { DepartmentScopeSelect, GroupScopeSelect } from './scope-selectors';
import { useUnsavedDraftRegistration } from './use-unsaved-draft-registration';
import type { PhishAdmissionRule, PhishAdmissionRuleWrite } from '@/types/phishing-config';
import type { Rule } from '@/types/unified-rules';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: PhishAdmissionRule | null;
  onSaved: () => void;
  readOnly?: boolean;
}

type Direction = PhishAdmissionRule['directions'][number];
type ScopeSide = 'recipient' | 'sender';
const DIRECTIONS: Direction[] = ['inbound', 'outbound', 'internal'];

function emptyDraft(): PhishAdmissionRuleWrite {
  return {
    name: '', enabled: true, directions: ['inbound'], filter_on: false,
    recipient_groups: [], recipient_depts: [], recipient_emails: [],
    sender_groups: [], sender_depts: [], sender_emails: [],
    require_url: true, max_size_mb: 0, sender_first_seen: true,
    require_qrcode: false, require_executable: false,
  };
}

function draftFromRule(rule: PhishAdmissionRule | null): PhishAdmissionRuleWrite {
  if (!rule) return emptyDraft();
  return {
    name: rule.name,
    enabled: rule.enabled,
    directions: [...rule.directions],
    filter_on: rule.filter_on ?? false,
    recipient_groups: [...(rule.recipient_groups ?? [])],
    recipient_depts: [...(rule.recipient_depts ?? [])],
    recipient_emails: [...(rule.recipient_emails ?? [])],
    sender_groups: [...(rule.sender_groups ?? [])],
    sender_depts: [...(rule.sender_depts ?? [])],
    sender_emails: [...(rule.sender_emails ?? [])],
    require_url: rule.require_url,
    max_size_mb: rule.max_size_mb ?? 0,
    sender_first_seen: rule.sender_first_seen,
    require_qrcode: rule.require_qrcode,
    require_executable: rule.require_executable ?? false,
  };
}

export function AdmissionRuleSheet({ open, onOpenChange, rule, onSaved, readOnly = false }: Props) {
  const t = useTranslations('phishingConfig.admission');
  const tdir = useTranslations('phishingConfig.admission.direction');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const apiErrorMessage = useApiErrorMessage();
  const baseline = useMemo(() => draftFromRule(rule), [rule]);
  const [draft, setDraft] = useState<PhishAdmissionRuleWrite>(baseline);
  const [lastLoadKey, setLastLoadKey] = useState('');
  const [saving, setSaving] = useState(false);

  const loadKey = `${open}:${rule?.id ?? 'new'}:${rule?.revision ?? ''}`;
  if (open && loadKey !== lastLoadKey) {
    setLastLoadKey(loadKey);
    setDraft(draftFromRule(rule));
  } else if (!open && lastLoadKey) {
    setLastLoadKey('');
  }

  const dirty = open && JSON.stringify(draft) !== JSON.stringify(baseline);
  useUnsavedDraftRegistration(open, dirty);

  const groupsQuery = useQuery({
    queryKey: ['phish-scope-groups', effectiveTenantId],
    queryFn: async () => {
      const response = await apiRequest<{ items: Array<Rule & { rule_uid?: string }> }>(
        `/unified-rules?${new URLSearchParams(GROUPS_LIST_QUERY)}`,
      );
      return (response.items ?? []).flatMap((item) => {
        const group = ruleToGroup(item);
        if (!group || !item.rule_uid || !['sender', 'recipient'].includes(group.type)) return [];
        return [{ uid: item.rule_uid, name: group.name, type: group.type }];
      });
    },
  });
  const departmentsQuery = useQuery({
    queryKey: ['contacts', 'departments', effectiveTenantId],
    queryFn: () => listContactDepartments(apiRequest),
  });

  const patch = (next: Partial<PhishAdmissionRuleWrite>) => setDraft((current) => ({ ...current, ...next }));
  const hasRecipientDirections = draft.directions.some((direction) => direction !== 'outbound');
  const hasSenderDirection = draft.directions.includes('outbound');
  const mixedSides = hasRecipientDirections && hasSenderDirection;

  const targetCount = [
    ...(hasRecipientDirections ? [draft.recipient_groups, draft.recipient_depts, draft.recipient_emails] : []),
    ...(hasSenderDirection ? [draft.sender_groups, draft.sender_depts, draft.sender_emails] : []),
  ].reduce((sum, values) => sum + (values?.length ?? 0), 0);
  const validationError = useMemo(() => {
    if (!draft.name.trim()) return t('errors.needName');
    if (draft.directions.length === 0) return t('errors.needDirection');
    if (!draft.sender_first_seen && !draft.require_qrcode && !draft.require_executable) return t('errors.needRiskSignal');
    if (draft.filter_on && targetCount === 0) return t('errors.needRecipientTarget');
    if ((draft.max_size_mb ?? 0) < 0 || (draft.max_size_mb ?? 0) > 100000) return t('errors.maxSizeTooLarge');
    return null;
  }, [draft, t, targetCount]);

  const toggleDirection = (direction: Direction) => patch({
    directions: draft.directions.includes(direction)
      ? draft.directions.filter((item) => item !== direction)
      : [...draft.directions, direction],
  });

  const save = async () => {
    if (validationError || readOnly) return;
    const normalized: PhishAdmissionRuleWrite = {
      ...draft,
      name: draft.name.trim(),
      recipient_groups: draft.filter_on && hasRecipientDirections ? draft.recipient_groups ?? [] : [],
      recipient_depts: draft.filter_on && hasRecipientDirections ? draft.recipient_depts ?? [] : [],
      recipient_emails: draft.filter_on && hasRecipientDirections ? (draft.recipient_emails ?? []).map((value) => value.toLowerCase()) : [],
      sender_groups: draft.filter_on && hasSenderDirection ? draft.sender_groups ?? [] : [],
      sender_depts: draft.filter_on && hasSenderDirection ? draft.sender_depts ?? [] : [],
      sender_emails: draft.filter_on && hasSenderDirection ? (draft.sender_emails ?? []).map((value) => value.toLowerCase()) : [],
    };
    setSaving(true);
    try {
      if (rule?.id != null) {
        await updateAdmissionRule(rule.id, { ...normalized, expected_revision: rule.revision ?? '' }, apiRequest);
      } else {
        await createAdmissionRule(normalized, apiRequest);
      }
      toast.success(rule ? t('updated') : t('created'));
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, t('saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const renderScope = (side: ScopeSide) => {
    const groupField = `${side}_groups` as 'recipient_groups' | 'sender_groups';
    const deptField = `${side}_depts` as 'recipient_depts' | 'sender_depts';
    const emailField = `${side}_emails` as 'recipient_emails' | 'sender_emails';
    const expectedGroupType = side === 'sender' ? 'sender' : 'recipient';
    const groupOptions = (groupsQuery.data ?? [])
      .filter((group) => group.type === expectedGroupType)
      .map((group) => ({ uid: group.uid, name: group.name }));
    const labels = {
      noMatch: t('noMatch'),
      clearAll: t('clearAll'),
      selectedCount: (count: number) => t('selectedCount', { count }),
    };
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-4" data-testid={`rule-scope-${side}`}>
        <p className="text-sm font-medium">{t(side === 'sender' ? 'senderScope' : 'recipientScope')}</p>
        <div className="space-y-2">
          <Label>{t('groupSectionLabel')}</Label>
          <GroupScopeSelect
            {...labels}
            options={groupOptions}
            selected={draft[groupField] ?? []}
            onChange={(values) => patch({ [groupField]: values })}
            placeholder={t('selectGroups')}
            searchPlaceholder={t('searchGroups')}
            emptyHint={t('noGroupsHint')}
            testIdPrefix={`rule-${side}-group`}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('deptSectionLabel')}</Label>
          <DepartmentScopeSelect
            {...labels}
            rows={departmentsQuery.data?.items ?? []}
            selected={draft[deptField] ?? []}
            onChange={(values) => patch({ [deptField]: values })}
            selectedEmails={draft[emailField] ?? []}
            onEmailsChange={(values) => patch({ [emailField]: values })}
            onInvalidEmail={() => toast.error(t('errors.invalidEmail'))}
            personSearchPlaceholder={t('searchPeople')}
            loadingLabel={t('loading')}
            searchPlaceholder={t('searchDepartments')}
            emptyHint={t('noDepartmentsHint')}
            testIdPrefix={`rule-${side}-dept`}
          />
        </div>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]" data-testid="admission-rule-sheet">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle>{rule ? t('editTitle') : t('createTitle')}</SheetTitle>
          <SheetDescription>{t('sheetDescription')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <div className="space-y-2"><Label htmlFor="rule-name">{t('colName')}</Label><Input id="rule-name" data-testid="rule-name-input" value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></div>
          <section className="space-y-4">
            <div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">1</span><h4 className="text-sm font-semibold">{t('sectionScope')}</h4></div>
            <div className="flex flex-wrap gap-2" data-testid="rule-direction-group">
              {DIRECTIONS.map((direction) => <Button key={direction} type="button" size="sm" variant={draft.directions.includes(direction) ? 'default' : 'outline'} data-testid={`rule-direction-${direction}`} onClick={() => toggleDirection(direction)}>{tdir(direction)}</Button>)}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-4"><div><Label>{t(mixedSides ? 'mixedScope' : hasSenderDirection ? 'senderScope' : 'recipientScope')}</Label><p className="mt-1 text-xs text-muted-foreground">{t('recipientTagsHint')}</p></div><Switch checked={draft.filter_on ?? false} onCheckedChange={(filter_on) => patch({ filter_on })} data-testid="rule-recipient-filter" /></div>
            {draft.filter_on ? <div className="space-y-3">{hasRecipientDirections ? renderScope('recipient') : null}{hasSenderDirection ? renderScope('sender') : null}</div> : null}
          </section>
          <section className="space-y-3">
            <div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-md bg-warning/15 text-xs font-semibold text-warning">2</span><h4 className="text-sm font-semibold">{t('sectionRisk')}</h4></div>
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3"><div><Label>{t('requireUrl')}</Label><p className="mt-1 text-xs text-muted-foreground">{t('urlNotQRHint')}</p></div><Switch checked={draft.require_url} data-testid="rule-require-url" onCheckedChange={(require_url) => patch({ require_url })} /></div>
              <div className="space-y-2 border-t border-border pt-4"><div><Label htmlFor="rule-maxsize">{t('maxSize')}</Label><p className="mt-1 text-sm text-muted-foreground">{t('maxSizeHint')}</p></div><div className="relative min-w-0"><Input id="rule-maxsize" type="number" min={0} max={100000} className="w-full pr-12" value={draft.max_size_mb ?? 0} onChange={(event) => patch({ max_size_mb: Number(event.target.value) || 0 })} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">MB</span></div></div>
            </div>
            {([
              ['sender_first_seen', 'senderFirstSeen', 'senderFirstSeenHint'],
              ['require_qrcode', 'qrcode', 'qrcodeDesc'],
              ['require_executable', 'executable', 'executableDesc'],
            ] as const).map(([field, label, description]) => (
              <div key={field} className="flex items-center justify-between rounded-lg border border-border p-4"><div><Label>{t(label)}</Label><p className="mt-1 text-xs text-muted-foreground">{t(description)}</p></div><Switch checked={Boolean(draft[field])} data-testid={`rule-${field.replaceAll('_', '-')}`} onCheckedChange={(value) => patch({ [field]: value })} /></div>
            ))}
            {validationError ? <p className="text-sm text-destructive" data-testid="rule-validation-error">{validationError}</p> : null}
          </section>
          <div className="flex items-center gap-3"><Switch id="rule-enabled" checked={draft.enabled} onCheckedChange={(enabled) => patch({ enabled })} /><Label htmlFor="rule-enabled">{t('enabledLabel')}</Label></div>
        </div>
        <SheetFooter className="shrink-0 flex-row justify-between gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('cancel')}</Button>
          <Button onClick={save} disabled={Boolean(validationError) || saving || readOnly} data-testid="rule-save">{saving ? t('saving') : t('save')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
