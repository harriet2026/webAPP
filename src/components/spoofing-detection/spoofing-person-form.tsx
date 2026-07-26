'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Eye, Loader2, Plus, Trash2, AlertTriangle, Shield, ShieldAlert, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { useApiRequest, type ApiRequestFn } from '@/lib/api/client';
import { listContacts } from '@/lib/api/contacts';
import { getRoutingScope } from '@/lib/api/mail-routing';
import {
  createSpoofPerson, updateSpoofPerson, bulkSpoofPersons, listSpoofPersons,
  previewSpoofPersonNotification,
} from '@/lib/api/spoofing-detection';
import type { Contact } from '@/types/contacts';
import type {
  SpoofPersonConfig, SpoofPersonDTO, SpoofLegitEmail, SpoofSensitivity,
  SpoofPersonCategory, SpoofProtectionLevel, SpoofDispositionMode, SpoofDispositionAction,
  SpoofMarkPosition,
  SpoofNotificationPreviewResponse,
} from '@/types/spoofing-detection';
import {
  buildSpoofPersonConfigFromContact,
  deriveSpoofCategoryFromJobTitle,
  displayNameFromContact,
  normalizeSpoofImportEmail,
  parseSpoofPersonPaste,
  recommendSensitivityForCategory,
} from './spoofing-person-import';
import { SpoofingNotificationPreviewDialog } from './spoofing-notification-preview-dialog';
import { spoofingQueryKeys } from './spoofing-query-keys';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SENS_TIERS: { value: SpoofSensitivity; labelKey: string }[] = [
  { value: 60, labelKey: 'personForm.sensLoose' },
  { value: 75, labelKey: 'personForm.sensStandard' },
  { value: 85, labelKey: 'personForm.sensStrict' },
  { value: 95, labelKey: 'personForm.sensExtreme' },
];

const CATEGORIES: SpoofPersonCategory[] = ['executive', 'finance', 'business', 'hr', 'tech', 'custom'];
const LEVELS: SpoofProtectionLevel[] = ['high', 'medium', 'low'];
const MARK_POSITIONS: SpoofMarkPosition[] = ['subject', 'header', 'banner'];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

async function listAllSpoofPersons(apiRequest: Parameters<typeof listSpoofPersons>[1]) {
  const pageSize = 100;
  const first = await listSpoofPersons({ page: 1, page_size: pageSize }, apiRequest);
  const pages = Math.ceil(first.total / pageSize);
  if (pages <= 1) return first.items;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => listSpoofPersons({ page: i + 2, page_size: pageSize }, apiRequest)),
  );
  return first.items.concat(rest.flatMap((page) => page.items));
}

function initFromEditing(e: SpoofPersonDTO | null) {
  return {
    displayName: e?.display_name ?? '',
    category: e?.category ?? ('business' as SpoofPersonCategory),
    protectionLevel: e?.protection_level ?? ('medium' as SpoofProtectionLevel),
    sensitivity: (e?.sensitivity ?? 75) as SpoofSensitivity,
    sensTouched: !!e,
    confidenceThreshold: e?.confidence_threshold ?? 80,
    legitEmails: e?.legit_emails?.length
      ? e.legit_emails.map((x) => ({ ...x }))
      : ([] as SpoofLegitEmail[]),
    mode: (e?.disposition?.mode ?? 'standard') as SpoofDispositionMode,
    action: (e?.disposition?.action ?? 'quarantine') as SpoofDispositionAction,
    markStyle: (e?.disposition?.mark_style ?? (['subject'] as SpoofMarkPosition[])),
    markText: e?.disposition?.mark_text ?? '',
    notify: e?.disposition?.notify ?? false,
    adminEmails: (e?.disposition?.admin_emails ?? []).join(', '),
  };
}

function SectionCard({ index, title, hint, children }: {
  index: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
          {index}
        </span>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {hint ? <span className="text-xs text-muted-foreground">({hint})</span> : null}
      </div>
      {children}
    </section>
  );
}

export function SpoofingPersonForm({ open, onOpenChange, editing, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: SpoofPersonDTO | null;
  onSaved: () => void;
}) {
  const tsd = useTranslations('spoofingDetection');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { isSystemAdmin } = useAuth();

  const s = initFromEditing(editing);
  const isEdit = !!editing;
  const [mode, setMode] = useState<SpoofDispositionMode>(s.mode);
  const [action, setAction] = useState<SpoofDispositionAction>(s.action);
  const [displayName, setDisplayName] = useState(s.displayName);
  const [category, setCategory] = useState<SpoofPersonCategory>(s.category);
  const [protectionLevel, setProtectionLevel] = useState<SpoofProtectionLevel>(s.protectionLevel);
  const [sensitivity, setSensitivity] = useState<SpoofSensitivity>(s.sensitivity);
  const [sensTouched, setSensTouched] = useState(s.sensTouched);
  const [confidenceThreshold, setConfidenceThreshold] = useState(s.confidenceThreshold);
  const [legitEmails, setLegitEmails] = useState<SpoofLegitEmail[]>(s.legitEmails);
  const [markStyle, setMarkStyle] = useState<SpoofMarkPosition[]>(s.markStyle);
  const [markText, setMarkText] = useState(s.markText);
  const [notify, setNotify] = useState(s.notify);
  const [adminEmails, setAdminEmails] = useState(s.adminEmails);
  const [tab, setTab] = useState<'single' | 'contacts' | 'paste'>(isEdit ? 'single' : 'contacts');
  const [pasteText, setPasteText] = useState('');
  const [contactKeyword, setContactKeyword] = useState('');
  const [contactDept, setContactDept] = useState('');
  const [contactJobTitle, setContactJobTitle] = useState('');
  const [contactSourceId, setContactSourceId] = useState('');
  const [contactTag, setContactTag] = useState('all');
  const [contactPage, setContactPage] = useState(1);
  const [selectedContacts, setSelectedContacts] = useState<Record<number, Contact>>({});
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notificationPreview, setNotificationPreview] = useState<SpoofNotificationPreviewResponse | null>(null);

  const markPos = markStyle[0] ?? 'subject';
  const categoryLabel = tsd(`person.category.${category}`);
  const protectionLevelLabel = tsd(`person.level.${protectionLevel}`);

  function legitEmailMatchLabel(matchType: SpoofLegitEmail['match_type']) {
    if (matchType === 'wildcard') return tsd('personForm.matchWildcard');
    if (matchType === 'regex') return tsd('personForm.matchRegex');
    return tsd('personForm.matchExact');
  }

  function onModeChange(next: SpoofDispositionMode) {
    setMode(next);
    if (next === 'observe') setAction('mark');
    else if (next === 'standard') setAction('quarantine');
    else if (next === 'strict') setAction('reject');
  }

  function onCategoryChange(next: SpoofPersonCategory) {
    setCategory(next);
    if (!sensTouched) setSensitivity(recommendSensitivityForCategory(next));
  }

  const contactQueryParams = {
    keyword: contactKeyword.trim() || undefined,
    dept: contactDept.trim() || undefined,
    job_title: contactJobTitle.trim() || undefined,
    source_id: /^\d+$/.test(contactSourceId.trim()) ? Number(contactSourceId.trim()) : undefined,
    tag: contactTag === 'all' ? undefined : contactTag,
    page: contactPage,
    page_size: 20,
  };
  const contactScopeQuery = useQuery({
    queryKey: spoofingQueryKeys.routingScope(effectiveTenantId),
    queryFn: () => getRoutingScope(apiRequest),
    enabled: open && !isEdit && tab === 'contacts' && isSystemAdmin,
  });
  const importTenantId = contactScopeQuery.data?.mode === 'single' ? contactScopeQuery.data.tenant_id : null;
  const contactApiRequest = useCallback<ApiRequestFn>((path, options = {}) => {
    const headers = { ...options.headers };
    if (importTenantId !== null) {
      headers['X-Tenant-ID'] = String(importTenantId);
    }
    return apiRequest(path, { ...options, headers });
  }, [apiRequest, importTenantId]);
  const contactsReady = !isSystemAdmin || !contactScopeQuery.isLoading;

  const contactsQuery = useQuery({
    queryKey: spoofingQueryKeys.importContacts(effectiveTenantId, importTenantId, contactQueryParams),
    queryFn: () => listContacts(contactQueryParams, contactApiRequest),
    enabled: open && !isEdit && tab === 'contacts' && contactsReady,
  });

  const allPersonsQuery = useQuery({
    queryKey: spoofingQueryKeys.importPersons(effectiveTenantId, importTenantId),
    queryFn: () => listAllSpoofPersons(contactApiRequest),
    enabled: open && !isEdit && (tab === 'contacts' || tab === 'paste'),
  });

  function buildConfig(name?: string, email?: string): SpoofPersonConfig {
    const adminList = adminEmails.split(',').map((x) => x.trim()).filter(Boolean);
    const legit = (name && email)
      ? [{ email, match_type: 'exact' as const }]
      : legitEmails.filter((e) => e.email.trim());
    return {
      display_name: (name ?? displayName).trim(),
      category,
      protection_level: protectionLevel,
      sensitivity,
      confidence_threshold: clamp(confidenceThreshold, 0, 100),
      legit_emails: legit,
      disposition: {
        mode,
        action,
        mark_style: markStyle,
        mark_text: markText || undefined,
        notify,
        admin_emails: adminList.length ? adminList : undefined,
      },
      enabled: editing?.enabled ?? true,
      observe_mode: editing?.observe_mode ?? false,
    };
  }

  // ---- validation ----
  const discardNeedsAlert = action === 'discard' && !notify;
  const sensWarn = sensitivity >= 95 && confidenceThreshold < 80;
  const singleEmailInvalid = legitEmails.some((e) => e.email.trim() && !EMAIL_RE.test(e.email));
  const singleEmailDups = (() => {
    const seen: Record<string, number> = {};
    let dup = false;
    for (const e of legitEmails) {
      const k = e.email.trim().toLowerCase();
      if (!k) continue;
      seen[k] = (seen[k] ?? 0) + 1;
      if (seen[k] > 1) dup = true;
    }
    return dup;
  })();
  const selectedContactItems = Object.values(selectedContacts);
  const selectedContactCount = selectedContactItems.length;
  const existingPersonEmailSet = new Set(
    (allPersonsQuery.data ?? []).flatMap((person) => person.legit_emails ?? [])
      .map((email) => normalizeSpoofImportEmail(email.email))
      .filter(Boolean),
  );
  const pasteResult = parseSpoofPersonPaste(pasteText, existingPersonEmailSet);
  const singleSaveDisabled = !displayName.trim() || discardNeedsAlert || singleEmailInvalid || singleEmailDups;
  const selectedContactBlocked = selectedContactItems.some((contact) => Boolean(contactDisabledReason(contact, true)));
  const contactsSaveDisabled = selectedContactCount === 0 || selectedContactCount > 20 || discardNeedsAlert || allPersonsQuery.isLoading || allPersonsQuery.isError || selectedContactBlocked;
  const pasteSaveDisabled = pasteResult.rows.length === 0 || pasteResult.issues.length > 0 || pasteResult.overLimit || discardNeedsAlert || allPersonsQuery.isLoading || allPersonsQuery.isError;
  const initialTab = isEdit ? 'single' : 'contacts';
  const hasUnsavedChanges = tab !== initialTab
    || selectedContactCount > 0
    || pasteText.trim().length > 0
    || displayName !== s.displayName
    || category !== s.category
    || protectionLevel !== s.protectionLevel
    || sensitivity !== s.sensitivity
    || confidenceThreshold !== s.confidenceThreshold
    || JSON.stringify(legitEmails) !== JSON.stringify(s.legitEmails)
    || mode !== s.mode
    || action !== s.action
    || JSON.stringify(markStyle) !== JSON.stringify(s.markStyle)
    || markText !== s.markText
    || notify !== s.notify
    || adminEmails !== s.adminEmails;

  function requestClose() {
    if (hasUnsavedChanges) {
      setConfirmCancelOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function discardAndClose() {
    setConfirmCancelOpen(false);
    onOpenChange(false);
  }

  const saveMutation = useMutation({
    mutationFn: async (kind: 'single' | 'contacts' | 'paste') => {
      if (kind === 'single') {
        if (isEdit && editing) {
          return updateSpoofPerson(editing.id, buildConfig(), apiRequest);
        }
        return createSpoofPerson(buildConfig(), apiRequest);
      }
      const adminList = adminEmails.split(',').map((x) => x.trim()).filter(Boolean);
      const items = kind === 'contacts'
        ? selectedContactItems.map((contact) => buildSpoofPersonConfigFromContact(contact, {
            protectionLevel,
            confidenceThreshold: clamp(confidenceThreshold, 0, 100),
            disposition: {
              mode,
              action,
              mark_style: markStyle,
              mark_text: markText || undefined,
              notify,
              admin_emails: adminList.length ? adminList : undefined,
            },
          }))
        : pasteResult.rows.map((row) => buildConfig(row.name, row.email));
      return bulkSpoofPersons({ action: 'create', items }, contactApiRequest);
    },
    onSuccess: (data, kind) => {
      if (kind === 'single' && data && typeof data === 'object' && 'warnings' in data) {
        const warnings = (data as { warnings?: string[] }).warnings ?? [];
        warnings.forEach((w) => toast.message(w));
      }
      onSaved();
      setSelectedContacts({});
      setPasteText('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'error'),
  });

  function currentPreviewPerson(): SpoofPersonConfig {
    if (!isEdit && tab === 'contacts') {
      const contact = selectedContactItems[0];
      if (!contact) throw new Error(tsd('personForm.importSelectedEmpty'));
      const adminList = adminEmails.split(',').map((x) => x.trim()).filter(Boolean);
      return buildSpoofPersonConfigFromContact(contact, {
        protectionLevel,
        confidenceThreshold: clamp(confidenceThreshold, 0, 100),
        disposition: {
          mode,
          action,
          mark_style: markStyle,
          mark_text: markText || undefined,
          notify,
          admin_emails: adminList.length ? adminList : undefined,
        },
      });
    }
    if (!isEdit && tab === 'paste') {
      const row = pasteResult.rows[0];
      if (!row) throw new Error(tsd('personForm.importSelectedEmpty'));
      return buildConfig(row.name, row.email);
    }
    return buildConfig();
  }

  const previewDisabled = !isEdit
    ? (tab === 'contacts' ? selectedContactCount === 0 : tab === 'paste' ? pasteResult.rows.length === 0 : !displayName.trim())
    : !displayName.trim();
  const previewMutation = useMutation({
    mutationFn: () => previewSpoofPersonNotification({
      person: currentPreviewPerson(),
      language: locale as 'zh' | 'en' | 'th' | 'ru',
    }, !isEdit && (tab === 'contacts' || tab === 'paste') ? contactApiRequest : apiRequest),
    onSuccess: (preview) => {
      setNotificationPreview(preview);
      setPreviewOpen(true);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : tsd('notificationPreview.error')),
  });

  return (
    <>
    <Sheet open={open} onOpenChange={(next) => next ? onOpenChange(true) : requestClose()}>
      <SheetContent side="right" className="flex max-w-[80vw] flex-col gap-0 p-0 data-[side=right]:w-[80vw]">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            {isEdit ? tsd('personForm.editTitle') : tsd('personForm.addTitle')}
          </SheetTitle>
          <SheetDescription>{isEdit ? tsd('person.subtitle') : tsd('personForm.addDescription')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {!isEdit ? (
            <div className="space-y-4">
              {SourceSection()}
              {tab === 'single' ? (
                <>
                  <SectionCard index={2} title={tsd('personForm.sectionBasicIdentity')}>
                    {IdentityFields()}
                  </SectionCard>
                  <SectionCard index={3} title={tsd('personForm.sectionDetection')}>
                    {DetectionFields()}
                  </SectionCard>
                  {DispositionSection(4)}
                  {NotifySection(5)}
                </>
              ) : null}
              {tab === 'contacts' ? (
                <>
                  <SectionCard index={2} title={tsd('personForm.sectionBasicIdentity')} hint={tsd('personForm.importIdentitySectionHint')}>
                    {ImportIdentityFields()}
                  </SectionCard>
                  <SectionCard index={3} title={tsd('personForm.sectionDetection')}>
                    {ImportDetectionFields()}
                  </SectionCard>
                  {DispositionSection(4)}
                  {NotifySection(5)}
                </>
              ) : null}
              {tab === 'paste' ? (
                <>
                  <SectionCard index={2} title={tsd('personForm.sectionBatch')}>
                    {PasteFields()}
                  </SectionCard>
                  <SectionCard index={3} title={tsd('personForm.sectionDetection')}>
                    {ImportDetectionFields()}
                  </SectionCard>
                  {DispositionSection(4)}
                  {NotifySection(5)}
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <SectionCard index={1} title={tsd('personForm.sectionIdentity')}>
                {IdentityFields()}
              </SectionCard>
              <SectionCard index={2} title={tsd('personForm.sectionDetection')}>
                {DetectionFields()}
              </SectionCard>
              {DispositionSection(3)}
              {NotifySection(4)}
            </div>
          )}
        </div>

        <SheetFooter className="border-t px-6 py-3">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={requestClose}>{tsd('personForm.cancel')}</Button>
            {!isEdit && tab === 'contacts' ? (
              <Button disabled={contactsSaveDisabled || saveMutation.isPending} onClick={() => saveMutation.mutate('contacts')}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {tsd('personForm.saveSelected', { n: selectedContactCount })}
              </Button>
            ) : !isEdit && tab === 'paste' ? (
              <Button disabled={pasteSaveDisabled || saveMutation.isPending} onClick={() => saveMutation.mutate('paste')}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {tsd('personForm.saveSelected', { n: pasteResult.rows.length })}
              </Button>
            ) : (
              <Button disabled={singleSaveDisabled || saveMutation.isPending} onClick={() => saveMutation.mutate('single')}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {tsd('personForm.save')}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tsd('personForm.cancelConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{tsd('personForm.cancelConfirmDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tsd('personForm.continueEditing')}</AlertDialogCancel>
          <AlertDialogAction onClick={discardAndClose}>{tsd('personForm.discardChanges')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <SpoofingNotificationPreviewDialog
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      preview={notificationPreview}
    />
    </>
  );

  // ---- render closures ----

  function SourceSection() {
    const sourceCards: {
      value: 'contacts' | 'single' | 'paste';
      titleKey: string;
      descKey: string;
      recommended?: boolean;
    }[] = [
      {
        value: 'contacts',
        titleKey: 'personForm.sourceContactsTitle',
        descKey: 'personForm.sourceContactsDesc',
        recommended: true,
      },
      {
        value: 'single',
        titleKey: 'personForm.sourceSingleTitle',
        descKey: 'personForm.sourceSingleDesc',
      },
      {
        value: 'paste',
        titleKey: 'personForm.sourcePasteTitle',
        descKey: 'personForm.sourcePasteDesc',
      },
    ];

    return (
      <SectionCard index={1} title={tsd('personForm.sectionSource')}>
        <RadioGroup
          value={tab}
          onValueChange={(v) => setTab(v as 'single' | 'contacts' | 'paste')}
          className="grid grid-cols-1 gap-3 lg:grid-cols-3"
        >
          {sourceCards.map((card) => (
            <label
              key={card.value}
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
                tab === card.value
                  ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20'
                  : 'border-border hover:bg-accent/50',
              )}
            >
              <RadioGroupItem value={card.value} id={`person-source-${card.value}`} className="mt-1" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{tsd(card.titleKey)}</span>
                  {card.recommended ? <Badge variant="secondary" className="text-[10px]">{tsd('personForm.sourceRecommended')}</Badge> : null}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{tsd(card.descKey)}</p>
              </div>
            </label>
          ))}
        </RadioGroup>
        {tab === 'contacts' ? ContactImportFields() : null}
      </SectionCard>
    );
  }

  function PasteFields() {
    return (
      <div className="space-y-3">
        <Textarea
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={tsd('personForm.pastePlaceholder')}
          className="min-h-40 font-mono text-sm"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{tsd('personForm.pasteHint')}</span>
          <span className={cn('tabular-nums', pasteResult.overLimit && 'text-destructive')}>{pasteResult.count}/20</span>
        </div>
        {pasteResult.overLimit ? <p className="text-xs text-destructive">{tsd('personForm.errPasteOverLimit')}</p> : null}
        {pasteResult.issues.length > 0 ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {pasteResult.issues.map((issue) => (
              <p key={`${issue.line}-${issue.code}`}>
                {tsd('personForm.pasteIssue', {
                  line: issue.line,
                  reason: tsd(`personForm.pasteIssueReason.${issue.code}`),
                })}
              </p>
            ))}
          </div>
        ) : null}
        {pasteResult.rows.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {pasteResult.rows.map((row) => (
              <div key={`${row.line}-${row.email}`} className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">{row.name}</p>
                <p className="mt-1 truncate font-mono text-muted-foreground">{row.email}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function IdentityFields() {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{tsd('personForm.name')}</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{tsd('personForm.category')}</Label>
            <Select value={category} onValueChange={(v) => onCategoryChange((v ?? 'custom') as SpoofPersonCategory)}>
              <SelectTrigger className="w-full"><SelectValue>{categoryLabel}</SelectValue></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{tsd(`person.category.${c}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{tsd('personForm.protectionLevel')}</Label>
            <Select value={protectionLevel} onValueChange={(v) => setProtectionLevel((v ?? 'medium') as SpoofProtectionLevel)}>
              <SelectTrigger className="w-full"><SelectValue>{protectionLevelLabel}</SelectValue></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => <SelectItem key={l} value={l}>{tsd(`person.level.${l}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>{tsd('personForm.legitEmail')}</Label>
            <Button type="button" variant="outline" size="sm"
              onClick={() => setLegitEmails((prev) => [...prev, { email: '', match_type: 'exact' }])}>
              <Plus className="mr-1 h-3.5 w-3.5" />{tsd('personForm.addEmail')}
            </Button>
          </div>
          <div className="space-y-2">
            {legitEmails.map((le, idx) => {
              const invalid = le.email.trim() !== '' && !EMAIL_RE.test(le.email);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <Input value={le.email} placeholder="name@corp.com"
                    onChange={(e) => setLegitEmails((prev) => prev.map((x, i) => i === idx ? { ...x, email: e.target.value } : x))}
                    className={invalid ? 'border-destructive' : ''} />
                  <Select value={le.match_type}
                    onValueChange={(v) => setLegitEmails((prev) => prev.map((x, i) => i === idx ? { ...x, match_type: (v ?? 'exact') as SpoofLegitEmail['match_type'] } : x))}>
                    <SelectTrigger className="w-28"><SelectValue>{legitEmailMatchLabel(le.match_type)}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exact">{tsd('personForm.matchExact')}</SelectItem>
                      <SelectItem value="wildcard">{tsd('personForm.matchWildcard')}</SelectItem>
                      <SelectItem value="regex">{tsd('personForm.matchRegex')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-rose-500"
                    onClick={() => setLegitEmails((prev) => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            {legitEmails.length === 0 ? (
              <p className="text-xs text-muted-foreground">{tsd('personForm.legitEmail')}</p>
            ) : null}
            {singleEmailDups ? <p className="text-xs text-destructive">{tsd('personForm.errEmailDup')}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  function DetectionFields() {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{tsd('personForm.sensitivity')}</Label>
          <div className="flex flex-wrap gap-2">
            {SENS_TIERS.map((tier) => (
              <button key={tier.value} type="button"
                onClick={() => { setSensitivity(tier.value); setSensTouched(true); }}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  sensitivity === tier.value
                    ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300"
                    : "border-border hover:bg-accent"
                )}>
                {tsd(tier.labelKey)} ({tier.value})
              </button>
            ))}
          </div>
          {!sensTouched ? <p className="text-xs text-muted-foreground">{tsd('personForm.sensRecommended')}</p> : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{tsd('personForm.confidenceThreshold')}</Label>
            <span className="text-sm font-medium tabular-nums w-8 text-right">{confidenceThreshold}</span>
          </div>
          <input
            type="range" min={0} max={100} step={1}
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-600 bg-muted"
          />
          <p className="text-xs text-muted-foreground">{tsd('personForm.confidenceThresholdHint')}</p>
        </div>
      </div>
    );
  }

  function ImportDetectionFields() {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{tsd('personForm.protectionLevel')}</Label>
          <Select value={protectionLevel} onValueChange={(v) => setProtectionLevel((v ?? 'medium') as SpoofProtectionLevel)}>
            <SelectTrigger className="w-full"><SelectValue>{protectionLevelLabel}</SelectValue></SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => <SelectItem key={l} value={l}>{tsd(`person.level.${l}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{tsd('personForm.confidenceThreshold')}</Label>
            <span className="text-sm font-medium tabular-nums w-8 text-right">{confidenceThreshold}</span>
          </div>
          <input
            type="range" min={0} max={100} step={1}
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-600 bg-muted"
          />
          <p className="text-xs text-muted-foreground">{tsd('personForm.importSensitivityHint')}</p>
        </div>
      </div>
    );
  }

  function contactDisabledReason(contact: Contact, selected: boolean): string | null {
    const email = normalizeSpoofImportEmail(contact.email);
    if (!email || !EMAIL_RE.test(email)) return tsd('personForm.importDisabledInvalidEmail');
    if (contact.status && contact.status !== 'active') return tsd('personForm.importDisabledInactive');
    if (allPersonsQuery.isLoading) return tsd('personForm.importCheckingExisting');
    if (allPersonsQuery.isError) return tsd('personForm.importExistingCheckFailed');
    if (existingPersonEmailSet.has(email)) return tsd('personForm.importDisabledExisting');
    if (!selected && selectedContactCount >= 20) return tsd('personForm.importDisabledLimit');
    return null;
  }

  function toggleContact(contact: Contact, next: boolean) {
    const selected = Boolean(selectedContacts[contact.id]);
    if (next && contactDisabledReason(contact, selected)) return;
    setSelectedContacts((prev) => {
      if (!next) {
        const rest = { ...prev };
        delete rest[contact.id];
        return rest;
      }
      return { ...prev, [contact.id]: contact };
    });
  }

  function ContactImportFields() {
    const contacts = contactsQuery.data?.items ?? [];
    const total = contactsQuery.data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / contactQueryParams.page_size));

    function resetContactFilters() {
      setContactKeyword('');
      setContactDept('');
      setContactJobTitle('');
      setContactSourceId('');
      setContactTag('all');
      setContactPage(1);
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(16rem,2fr)_1fr_1fr_1fr]">
          <div className="space-y-1.5">
            <Label>{tsd('personForm.importKeyword')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={contactKeyword} onChange={(e) => { setContactKeyword(e.target.value); setContactPage(1); }}
                placeholder={tsd('personForm.importKeywordPlaceholder')} className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{tsd('personForm.importDept')}</Label>
            <Input value={contactDept} onChange={(e) => { setContactDept(e.target.value); setContactPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label>{tsd('personForm.importJobTitle')}</Label>
            <Input value={contactJobTitle} onChange={(e) => { setContactJobTitle(e.target.value); setContactPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label>{tsd('personForm.importSourceId')}</Label>
            <Input inputMode="numeric" value={contactSourceId} onChange={(e) => { setContactSourceId(e.target.value.replace(/\D/g, '')); setContactPage(1); }} />
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label>{tsd('personForm.importTag')}</Label>
              <Select value={contactTag} onValueChange={(value) => { setContactTag(value ?? 'all'); setContactPage(1); }}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tsd('personForm.importAllTags')}</SelectItem>
                  <SelectItem value="executive">{tsd('person.category.executive')}</SelectItem>
                  <SelectItem value="key_position">{tsd('personForm.importKeyPosition')}</SelectItem>
                  <SelectItem value="none">{tsd('personForm.importNoTag')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" onClick={resetContactFilters}>{tc('reset')}</Button>
          </div>
          <span className="text-sm text-muted-foreground">{tsd('personForm.importSelected', { n: selectedContactCount })}</span>
        </div>

        <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
          {contactsQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{tsd('personForm.importEmpty')}</p>
          ) : (
            <div className="divide-y divide-border">
              {contacts.map((contact) => {
                const selected = Boolean(selectedContacts[contact.id]);
                const disabledReason = contactDisabledReason(contact, selected);
                const derivedCategory = deriveSpoofCategoryFromJobTitle(contact.job_title);
                return (
                  <label
                    key={contact.id}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2.5 text-sm transition-colors',
                      disabledReason ? 'cursor-not-allowed bg-muted/30 text-muted-foreground' : 'cursor-pointer hover:bg-accent/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={Boolean(disabledReason && !selected)}
                      onChange={(e) => toggleContact(contact, e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-border"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-foreground">{displayNameFromContact(contact)}</span>
                        <span className="text-muted-foreground">· {contact.job_title || '—'}</span>
                        <Badge variant="outline" className="text-[10px]">{tsd(`person.category.${derivedCategory}`)}</Badge>
                        {contact.status !== 'active' ? <Badge variant="outline" className="text-[10px]">{contact.status_label || contact.status}</Badge> : null}
                        {disabledReason ? <Badge variant="secondary" className="ml-auto text-[10px]">{disabledReason}</Badge> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="truncate font-mono">{contact.email || '—'}</span>
                        <span className="truncate">· {contact.department_path || '—'}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{tc('total', { count: total })}</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                aria-label={tc('prev')}
                disabled={contactPage <= 1} onClick={() => setContactPage((page) => Math.max(1, page - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>{tc('pageOf', { current: contactPage, total: totalPages })}</span>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                aria-label={tc('next')}
                disabled={contactPage >= totalPages} onClick={() => setContactPage((page) => Math.min(totalPages, page + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {selectedContactItems.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedContactItems.map((contact) => (
              <button key={contact.id} type="button" onClick={() => toggleContact(contact, false)}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30"
                title={tsd('personForm.importRemoveSelected')}>
                <span className="max-w-40 truncate font-medium">{displayNameFromContact(contact)}</span>
                <span className="max-w-44 truncate font-mono">· {contact.email}</span>
                <Trash2 className="h-3 w-3" />
              </button>
            ))}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">* {tsd('personForm.importLimitHint')}</p>
      </div>
    );
  }

  function ImportIdentityFields() {
    if (selectedContactCount > 1) {
      return (
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          {tsd('personForm.importBatchIdentity', { n: selectedContactCount })}
        </div>
      );
    }

    const contact = selectedContactItems[0];
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{tsd('personForm.name')} <span className="text-destructive">*</span></Label>
            <Input value={contact ? displayNameFromContact(contact) : ''} placeholder={tsd('personForm.namePlaceholder')} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>{tsd('personForm.email')} <span className="text-destructive">*</span></Label>
            <Input value={contact?.email ?? ''} placeholder={tsd('personForm.emailPlaceholder')} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>{tsd('personForm.importJobTitle')}</Label>
            <Input value={contact?.job_title ?? ''} placeholder={tsd('personForm.jobTitlePlaceholder')} disabled />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{tsd('personForm.importIdentityHint')}</p>
      </div>
    );
  }

  function DispositionSection(index: number) {
    const modeCards = [
      { key: 'observe' as SpoofDispositionMode, titleKey: 'personForm.modeObserve', descKey: 'personForm.modeObserveDesc' },
      { key: 'standard' as SpoofDispositionMode, titleKey: 'personForm.modeStandard', descKey: 'personForm.modeStandardDesc' },
      { key: 'strict' as SpoofDispositionMode, titleKey: 'personForm.modeStrict', descKey: 'personForm.modeStrictDesc' },
    ];

    return (
      <SectionCard index={index} title={tsd('personForm.disposition')}>
        {sensWarn ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{tsd('personForm.warnSensThreshold')}</span>
          </div>
        ) : null}

        {/* Mode cards */}
        <div className="grid grid-cols-3 gap-3">
          {modeCards.map((m) => (
            <button key={m.key} type="button" onClick={() => onModeChange(m.key)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                mode === m.key
                  ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20"
                  : "border-border opacity-70 hover:opacity-100 hover:bg-accent"
              )}>
              <div className="text-sm font-medium">{tsd(m.titleKey)}</div>
              <div className="text-xs text-muted-foreground mt-1">{tsd(m.descKey)}</div>
            </button>
          ))}
        </div>

        {/* Observe sub-panel */}
        {mode === 'observe' ? (
          <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="space-y-2">
              <Label>{tsd('personForm.markStyle')}</Label>
              <RadioGroup
                value={markPos}
                onValueChange={(v) => setMarkStyle([v as SpoofMarkPosition])}
                className="flex flex-col gap-2"
              >
                {MARK_POSITIONS.map((p) => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer text-sm">
                    <RadioGroupItem value={p} id={`mark-${p}`} />
                    {tsd(`personForm.mark${p.charAt(0).toUpperCase()}${p.slice(1)}`)}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Input value={markText} onChange={(e) => setMarkText(e.target.value)} placeholder="[Spoof Alert]" />
            </div>
            {/* Mark preview */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{tsd('personForm.markPreview')}</p>
              <div className="grid grid-cols-3 gap-2">
                {MARK_POSITIONS.map((p) => (
                  <div key={p} className={cn(
                    "rounded border p-2 space-y-1.5 text-[10px] transition-opacity",
                    markPos === p
                      ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                      : "border-border opacity-40"
                  )}>
                    <p className="font-medium uppercase tracking-wide text-muted-foreground">
                      {tsd(`personForm.mark${p.charAt(0).toUpperCase()}${p.slice(1)}`)}
                    </p>
                    {p === 'subject' && (
                      <p className="truncate">
                        <span className="text-blue-600 dark:text-blue-400">{markText || '[Alert]'}</span>
                        {' '}Re: Meeting
                      </p>
                    )}
                    {p === 'header' && (
                      <p className="font-mono text-amber-700 dark:text-amber-400 truncate">
                        X-Spoof: detected
                      </p>
                    )}
                    {p === 'banner' && (
                      <div className="inline-flex items-center gap-1 rounded bg-rose-100 px-1 py-0.5 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                        <AlertTriangle className="h-3 w-3" />
                        {tsd('personForm.modeObserve')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Standard sub-panel */}
        {mode === 'standard' ? (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="flex items-center gap-3 rounded-lg border border-blue-500 bg-blue-50/60 dark:bg-blue-950/20 p-3">
              <Shield className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-medium">{tsd('disposition.quarantine')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tsd('personForm.actionQuarantineDesc')}</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Strict sub-panel */}
        {mode === 'strict' ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
            {(['reject', 'discard'] as SpoofDispositionAction[]).map((a) => (
              <button key={a} type="button" onClick={() => setAction(a)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors flex items-start gap-3",
                  action === a
                    ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20"
                    : "border-border hover:bg-accent"
                )}>
                <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-rose-500" />
                <div>
                  <p className="text-sm font-medium">{tsd(`disposition.${a}`)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tsd(`personForm.action${a.charAt(0).toUpperCase()}${a.slice(1)}Desc`)}
                  </p>
                </div>
              </button>
            ))}
            <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{tsd('personForm.actionRejectWarn')}</span>
            </div>
            {discardNeedsAlert ? (
              <div className="flex items-start gap-2 rounded-md border border-rose-300/60 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{tsd('personForm.errDiscardNeedsAlert')}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
    );
  }

  function NotifySection(index: number) {
    return (
      <SectionCard index={index} title={tsd('personForm.sectionNotify')}>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={notify} onCheckedChange={setNotify} />
          {tsd('personForm.notify')}
        </label>
        {notify ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{tsd('personForm.adminEmails')}</Label>
              <Textarea
                value={adminEmails}
                onChange={(e) => setAdminEmails(e.target.value)}
                placeholder={tsd('personForm.adminEmailsPlaceholder')}
                className="min-h-[72px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{tsd('personForm.adminEmailsHint')}</p>
            </div>
            <Button type="button" variant="outline" size="sm"
              disabled={previewDisabled || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <Eye className="mr-1.5 h-3.5 w-3.5" />}
              {tsd('personForm.previewNotify')}
            </Button>
            <p className="text-xs text-muted-foreground">{tsd('personForm.previewNotifyHint')}</p>
          </div>
        ) : null}
      </SectionCard>
    );
  }

}
