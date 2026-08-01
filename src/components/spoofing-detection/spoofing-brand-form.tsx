'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Bell, Eye, FileText, Loader2, Plus, Search, Shield, Trash2, AlertTriangle, X, type LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useApiRequest } from '@/lib/api/client';
import { createSpoofBrand, previewSpoofBrandNotification, updateSpoofBrand } from '@/lib/api/spoofing-detection';
import type {
  SpoofBrandConfig, SpoofBrandDTO, SpoofProtectedDomain,
  SpoofDispositionMode, SpoofDispositionAction, SpoofMarkPosition,
  SpoofNotificationPreviewResponse,
} from '@/types/spoofing-detection';
import { SpoofingNotificationPreviewDialog } from './spoofing-notification-preview-dialog';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const ACTIONS: SpoofDispositionAction[] = ['mark', 'quarantine', 'reject', 'discard'];
const MARK_POSITIONS: SpoofMarkPosition[] = ['subject', 'header', 'banner'];
const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LEN = 30;
const MAX_BRAND_LEN = 30;

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function initFromEditing(e: SpoofBrandDTO | null) {
  return {
    brandName: e?.brand_name ?? '',
    keywords: e?.keywords ? [...e.keywords] : ([] as string[]),
    protectedDomains: e?.protected_domains?.length
      ? e.protected_domains.map((d) => ({ ...d }))
      : ([{ domain: '', edit_distance_threshold: 3 }] as SpoofProtectedDomain[]),
    mode: (e?.disposition?.mode ?? 'standard') as SpoofDispositionMode,
    action: (e?.disposition?.action ?? 'quarantine') as SpoofDispositionAction,
    markStyle: (e?.disposition?.mark_style ?? (['subject'] as SpoofMarkPosition[])),
    markText: e?.disposition?.mark_text ?? '',
    notify: e?.disposition?.notify ?? false,
    adminEmails: (e?.disposition?.admin_emails ?? []).join(', '),
    confidenceThreshold: e?.confidence_threshold ?? 80,
  };
}

function BrandFormSection({ icon: Icon, title, description, children, muted = false }: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className={muted ? 'bg-muted/30 px-6 py-6' : 'bg-background px-6 py-6'}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

export function SpoofingBrandForm({ open, onOpenChange, editing, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: SpoofBrandDTO | null;
  onSaved: () => void;
}) {
  const tsd = useTranslations('spoofingDetection');
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale();
  const { apiRequest } = useApiRequest();

  const s = initFromEditing(editing);
  const [brandName, setBrandName] = useState(s.brandName);
  const [keywords, setKeywords] = useState<string[]>(s.keywords);
  const [keywordInput, setKeywordInput] = useState('');
  const [protectedDomains, setProtectedDomains] = useState<SpoofProtectedDomain[]>(s.protectedDomains);
  const [mode, setMode] = useState<SpoofDispositionMode>(s.mode);
  const [action, setAction] = useState<SpoofDispositionAction>(s.action);
  const [markStyle, setMarkStyle] = useState<SpoofMarkPosition[]>(s.markStyle);
  const [markText, setMarkText] = useState(s.markText);
  const [notify, setNotify] = useState(s.notify);
  const [adminEmails, setAdminEmails] = useState(s.adminEmails);
  const [confidenceThreshold, setConfidenceThreshold] = useState(s.confidenceThreshold);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notificationPreview, setNotificationPreview] = useState<SpoofNotificationPreviewResponse | null>(null);

  const isEdit = !!editing;
  const modeCards = [
    { key: 'observe' as const, title: tsd('brand.mode.observe'), description: tsd('brandForm.modeObserveDesc'), bar: 'bg-amber-400' },
    { key: 'standard' as const, title: tsd('brand.mode.standard'), description: tsd('brandForm.modeStandardDesc'), bar: 'bg-blue-500' },
    { key: 'strict' as const, title: tsd('brand.mode.strict'), description: tsd('brandForm.modeStrictDesc'), bar: 'bg-rose-500' },
  ];
  const availableActions = mode === 'observe' ? (['mark'] as SpoofDispositionAction[])
    : mode === 'standard' ? (['quarantine'] as SpoofDispositionAction[])
      : mode === 'strict' ? (['reject', 'discard'] as SpoofDispositionAction[])
        : ACTIONS;

  function onModeChange(next: SpoofDispositionMode) {
    setMode(next);
    if (next === 'observe') setAction('mark');
    else if (next === 'standard') setAction('quarantine');
    else if (next === 'strict') setAction('reject');
  }
  function onActionChange(next: SpoofDispositionAction) {
    setAction(next);
    const obs: SpoofDispositionAction[] = ['mark'];
    const std: SpoofDispositionAction[] = ['quarantine'];
    const strict: SpoofDispositionAction[] = ['reject', 'discard'];
    if (mode === 'observe' && !obs.includes(next)) setMode('custom');
    else if (mode === 'standard' && !std.includes(next)) setMode('custom');
    else if (mode === 'strict' && !strict.includes(next)) setMode('custom');
  }
  function toggleMark(p: SpoofMarkPosition) {
    setMarkStyle((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }
  function addKeyword() {
    const v = keywordInput.trim();
    if (!v) return;
    if (v.length > MAX_KEYWORD_LEN) { toast.error(tsd('brandForm.errKeywordLen')); return; }
    if (keywords.length >= MAX_KEYWORDS) { toast.error(tsd('brandForm.errKeywords')); return; }
    if (!keywords.includes(v)) setKeywords((prev) => [...prev, v]);
    setKeywordInput('');
  }

  // ---- validation ----
  const brandNameInvalid = brandName.trim().length < 1 || brandName.trim().length > MAX_BRAND_LEN;
  const keywordsOverLimit = keywords.length > MAX_KEYWORDS;
  const keywordLenInvalid = keywords.some((k) => k.length > MAX_KEYWORD_LEN);
  const noDomain = protectedDomains.length === 0;
  const emptyDomainInvalid = protectedDomains.some((d) => !d.domain.trim());
  const populatedDomainInvalid = protectedDomains.some((d) => d.domain.trim() && d.edit_distance_threshold < 1);
  const previewDomains = protectedDomains.filter((d) => d.domain.trim());
  const discardNeedsAlert = action === 'discard' && !notify;
  const saveDisabled = brandNameInvalid || keywordsOverLimit || keywordLenInvalid || noDomain || emptyDomainInvalid || populatedDomainInvalid || discardNeedsAlert;
  const previewDisabled = brandNameInvalid || keywordsOverLimit || keywordLenInvalid || previewDomains.length === 0 || populatedDomainInvalid || discardNeedsAlert;

  function buildConfig(domains = protectedDomains): SpoofBrandConfig {
    const adminList = adminEmails.split(',').map((x) => x.trim()).filter(Boolean);
    return {
      brand_name: brandName.trim(),
      protected_domains: domains.map((d) => ({ domain: d.domain.trim(), edit_distance_threshold: clamp(d.edit_distance_threshold, 1, 10) })),
      keywords,
      confidence_threshold: clamp(confidenceThreshold, 0, 100),
      disposition: {
        mode, action, mark_style: markStyle, mark_text: markText || undefined,
        notify, admin_emails: adminList.length ? adminList : undefined,
      },
      enabled: editing?.enabled ?? true,
      observe_mode: editing?.observe_mode ?? false,
    };
  }

  const saveMutation = useMutation({
    mutationFn: () => isEdit && editing
      ? updateSpoofBrand(editing.id, buildConfig(), apiRequest)
      : createSpoofBrand(buildConfig(), apiRequest),
    onSuccess: onSaved,
    onError: (e) => toast.error(apiErrorMessage(e, 'error')),
  });

  const previewMutation = useMutation({
    mutationFn: () => previewSpoofBrandNotification({
      brand: buildConfig(previewDomains),
      language: locale as 'zh' | 'en' | 'th' | 'ru',
    }, apiRequest),
    onSuccess: (preview) => {
      setNotificationPreview(preview);
      setPreviewOpen(true);
    },
    onError: (e) => toast.error(apiErrorMessage(e, tsd('notificationPreview.error'))),
  });

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex max-w-[80vw] flex-col gap-0 p-0 data-[side=right]:w-[80vw]">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{isEdit ? tsd('brandForm.editTitle') : tsd('brandForm.addTitle')}</SheetTitle>
          <SheetDescription>{isEdit ? tsd('brand.subtitle') : tsd('brandForm.addDescription')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <BrandFormSection icon={Shield} title={tsd('brandForm.sectionIdentity')} description={tsd('brandForm.sectionIdentityDescription')}>
            <div className="space-y-1.5">
              <Label>{tsd('brandForm.brandName')}</Label>
              <Input value={brandName} maxLength={MAX_BRAND_LEN}
                onChange={(e) => setBrandName(e.target.value)} placeholder={tsd('brandForm.brandNamePlaceholder')} />
              <p className="text-xs text-muted-foreground">{brandName.trim().length}/{MAX_BRAND_LEN} · {tsd('brandForm.brandNameHint')}</p>
              {brandName.trim().length > MAX_BRAND_LEN ? <p className="text-xs text-destructive">{tsd('brandForm.errBrandName')}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label>{tsd('brandForm.keywords')}</Label>
              <p className="text-xs text-muted-foreground">{tsd('brandForm.keywordsHint')}</p>
              <div className="flex items-center gap-2">
                <Input value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  maxLength={MAX_KEYWORD_LEN}
                  disabled={keywords.length >= MAX_KEYWORDS}
                  placeholder={keywords.length >= MAX_KEYWORDS ? tsd('brandForm.errKeywords') : ''} />
                <Button variant="outline" size="sm" onClick={addKeyword} disabled={keywords.length >= MAX_KEYWORDS}>
                  <Plus className="mr-1 h-3.5 w-3.5" />{tsd('brandForm.addKeyword')}
                </Button>
              </div>
              {keywords.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((k) => (
                    <Badge key={k} variant="secondary" className="gap-1">
                      {k}
                      <button type="button" onClick={() => setKeywords((prev) => prev.filter((x) => x !== k))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] gap-2 text-xs text-muted-foreground">
                <span>{tsd('brandForm.protectedDomains')}</span>
                <span>{tsd('brandForm.editDistance')}</span>
                <span />
              </div>
              {protectedDomains.map((d, idx) => (
                <div key={idx} className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-2">
                  <Input value={d.domain} placeholder={idx === 0 ? 'cacter.com' : 'example.com'}
                    onChange={(e) => setProtectedDomains((prev) => prev.map((x, i) => i === idx ? { ...x, domain: e.target.value } : x))}
                    className="min-w-0" />
                  <Input type="number" min={1} value={d.edit_distance_threshold}
                    onChange={(e) => setProtectedDomains((prev) => prev.map((x, i) => i === idx ? { ...x, edit_distance_threshold: Number(e.target.value) } : x))}
                    className="w-full" />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500"
                    onClick={() => setProtectedDomains((prev) => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm"
                onClick={() => setProtectedDomains((prev) => [...prev, { domain: '', edit_distance_threshold: 3 }])}>
                <Plus className="mr-1 h-3.5 w-3.5" />{tsd('brandForm.addDomain')}
              </Button>
              {noDomain ? <p className="text-xs text-destructive">{tsd('brandForm.errNoDomain')}</p> : null}
              {emptyDomainInvalid ? <p className="text-xs text-destructive">{tsd('brandForm.errEmptyDomain')}</p> : null}
              {populatedDomainInvalid ? <p className="text-xs text-destructive">{tsd('brandForm.errDomainThreshold')}</p> : null}
            </div>
          </BrandFormSection>

          <BrandFormSection icon={Search} title={tsd('brandForm.sectionDetection')} description={tsd('brandForm.sectionDetectionDescription')} muted>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
              <Label className="min-w-32">{tsd('brandForm.confidenceThreshold')}</Label>
              <Input type="number" min={0} max={100} value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(clamp(Number(e.target.value), 0, 100))} className="h-8 w-28" />
              <span className="text-xs text-muted-foreground">{tsd('brandForm.confidenceThresholdHint')}</span>
              </div>
            </div>
          </BrandFormSection>

          <BrandFormSection icon={Shield} title={tsd('brandForm.sectionDisposition')} description={tsd('brandForm.sectionDispositionDescription')}>
            {discardNeedsAlert ? (
              <div className="flex items-start gap-2 rounded-md border border-rose-300/60 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{tsd('personForm.errDiscardNeedsAlert')}</span>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>{tsd('personForm.disposition')}</Label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {modeCards.map((card) => {
                  const active = mode === card.key;
                  return (
                    <button key={card.key} type="button" onClick={() => onModeChange(card.key)}
                      className={active
                        ? 'relative overflow-hidden rounded-lg border border-blue-500 bg-blue-50 py-3 pl-4 pr-3 text-left dark:bg-blue-950/30'
                        : 'relative overflow-hidden rounded-lg border border-border py-3 pl-4 pr-3 text-left hover:bg-accent'}>
                      <span className={`absolute inset-y-0 left-0 w-1.5 ${active ? card.bar : 'bg-transparent'}`} />
                      <span className="block text-sm font-medium">{card.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{card.description}</span>
                    </button>
                  );
                })}
              </div>
              {mode === 'custom' ? <p className="text-xs text-muted-foreground">{tsd('brandForm.modeCustomHint')}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>{tsd('personForm.action')}</Label>
              <div className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-muted/30 p-1">
                {availableActions.map((candidate) => (
                  <Button key={candidate} type="button" size="sm"
                    variant={action === candidate ? 'default' : 'ghost'}
                    onClick={() => onActionChange(candidate)}>
                    {tsd(`disposition.${candidate}`)}
                  </Button>
                ))}
              </div>
            </div>
            {(mode === 'observe' || action === 'mark') ? (
              <div className="space-y-2">
                <Label>{tsd('personForm.markStyle')}</Label>
                <div className="flex flex-wrap gap-3">
                  {MARK_POSITIONS.map((p) => (
                    <label key={p} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <Switch checked={markStyle.includes(p)} onCheckedChange={() => toggleMark(p)} />
                      {tsd(`personForm.mark${p.charAt(0).toUpperCase()}${p.slice(1)}`)}
                    </label>
                  ))}
                </div>
                <Input value={markText} onChange={(e) => setMarkText(e.target.value)} placeholder="[Brand Spoof Alert]" />
              </div>
            ) : null}
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium text-foreground">{tsd('personForm.sectionNotify')}</h4>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="font-normal">{tsd('personForm.notify')}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">{tsd('personForm.adminEmailsHint')}</p>
                </div>
                <Switch checked={notify} onCheckedChange={setNotify} />
              </div>
              {notify ? (
                <div className="space-y-2">
                  <Label>{tsd('personForm.adminEmails')}</Label>
                  <Input value={adminEmails} onChange={(e) => setAdminEmails(e.target.value)}
                    placeholder={tsd('personForm.adminEmailsPlaceholder')} />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{tsd('personForm.previewNotifyHint')}</p>
                    <Button type="button" variant="outline" size="sm"
                      disabled={previewDisabled || previewMutation.isPending}
                      onClick={() => previewMutation.mutate()}>
                      {previewMutation.isPending
                        ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        : <Eye className="mr-1.5 h-3.5 w-3.5" />}
                      {tsd('personForm.previewNotify')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </BrandFormSection>

          <section className="mx-6 mb-6 space-y-2 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-700 dark:text-blue-300" />
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">{tsd('brandForm.previewTitle')}</h3>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{tsd('brandForm.preview')}</p>
          </section>
        </div>

        <SheetFooter className="border-t px-6 py-3">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{tsd('brandForm.cancel')}</Button>
            <Button disabled={saveDisabled || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {tsd('brandForm.save')}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    <SpoofingNotificationPreviewDialog
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      preview={notificationPreview}
    />
    </>
  );
}
