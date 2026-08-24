'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MailCheck, Plus, Search, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApiRequest } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { createAdmissionRule, deleteAdmissionRule, listAdmissionRules, setAdmissionRuleStatus } from '@/lib/api/phishing-admission-rules';
import { phishingQueryKeys } from '../phishing-query-keys';
import type { PhishAdmissionRule, PhishAdmissionRuleWrite } from '@/types/phishing-config';
import { AdmissionRuleSheet } from './admission-rule-sheet';

function copyPayload(rule: PhishAdmissionRule, suffix: string): PhishAdmissionRuleWrite {
  return {
    name: `${rule.name}${suffix}`,
    enabled: false,
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

export function AdmissionRulesSection({ readOnly = false, openCreateSignal }: { readOnly?: boolean; openCreateSignal?: number }) {
  const t = useTranslations('phishingConfig.admission');
  const tdir = useTranslations('phishingConfig.admission.direction');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PhishAdmissionRule | null>(null);
  const [deleting, setDeleting] = useState<PhishAdmissionRule | null>(null);
  const queryKey = phishingQueryKeys.admissionRules(effectiveTenantId);
  const query = useQuery({ queryKey, queryFn: () => listAdmissionRules(apiRequest) });

  const [consumedCreateSignal, setConsumedCreateSignal] = useState(0);
  if (openCreateSignal && openCreateSignal !== consumedCreateSignal) {
    setConsumedCreateSignal(openCreateSignal);
    if (!readOnly) {
      setEditing(null);
      setSheetOpen(true);
    }
  }

  // The header and configuration panel can briefly use different tenant
  // scopes while the tenant-admin view settles. Invalidate the shared root so
  // the control readiness query cannot retain an enabled-rule snapshot.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: phishingQueryKeys.admissionRulesRoot });
  const toggleMutation = useMutation({
    mutationFn: ({ rule, enabled }: { rule: PhishAdmissionRule; enabled: boolean }) => setAdmissionRuleStatus(rule.id!, enabled, apiRequest),
    onSuccess: (_, variables) => {
      // Update the shared readiness query immediately. The control header is
      // mounted alongside this panel and must see a disabled last rule before
      // the user attempts to re-enable the agent.
      queryClient.setQueryData<PhishAdmissionRule[] | undefined>(queryKey, (current) =>
        current?.map((rule) => rule.id === variables.rule.id ? { ...rule, enabled: variables.enabled } : rule),
      );
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error, t('toggleFailed'))),
  });
  const deleteMutation = useMutation({
    mutationFn: (rule: PhishAdmissionRule) => deleteAdmissionRule(rule.id!, apiRequest),
    onSuccess: () => { setDeleting(null); invalidate(); toast.success(t('deleted')); },
    onError: (error) => toast.error(apiErrorMessage(error, t('deleteFailed'))),
  });
  const copyMutation = useMutation({
    mutationFn: (rule: PhishAdmissionRule) => createAdmissionRule(copyPayload(rule, t('copySuffix')), apiRequest),
    onSuccess: () => { invalidate(); toast.success(t('copied')); },
    onError: (error) => toast.error(apiErrorMessage(error, t('copyFailed'))),
  });

  const signalText = (rule: PhishAdmissionRule) => [
    rule.sender_first_seen ? t('senderFirstSeen') : '',
    rule.require_qrcode ? t('qrcode') : '',
    rule.require_executable ? t('executable') : '',
  ].filter(Boolean).join(' · ');
  const filtered = (() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return query.data ?? [];
    return (query.data ?? []).filter((rule) => [rule.name, rule.directions.map((value) => tdir(value)).join(' '), signalText(rule)].join(' ').toLocaleLowerCase().includes(needle));
  })();

  return (
    <Card className="rounded-xl border-l-4 border-l-primary border-border shadow-sm" data-testid="admission-rules-section">
      <CardHeader><CardTitle className="flex items-center gap-2"><MailCheck className="size-4 text-primary" />{t('title')}</CardTitle><CardDescription>{t('description')}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchPlaceholder')} className="pl-9" /></div>
          <Button className="shrink-0" size="sm" onClick={() => { setEditing(null); setSheetOpen(true); }} disabled={readOnly} data-testid="admission-rule-create"><Plus className="size-3.5" />{t('create')}</Button>
        </div>
        {query.isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : query.isError ? <p className="text-sm text-destructive">{apiErrorMessage(query.error, t('loadFailed'))}</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">{search ? t('noSearchResults') : t('empty')}</p> : (
          <div className="overflow-x-auto rounded-lg border border-border"><Table><TableHeader><TableRow><TableHead>{t('colName')}</TableHead><TableHead>{t('colEnabled')}</TableHead><TableHead>{t('colScope')}</TableHead><TableHead>{t('colRecipients')}</TableHead><TableHead>{t('colRisk')}</TableHead><TableHead className="text-right">{t('colActions')}</TableHead></TableRow></TableHeader><TableBody>{filtered.map((rule) => {
            const recipients = [...(rule.recipient_groups ?? []), ...(rule.recipient_depts ?? []), ...(rule.recipient_emails ?? [])];
            return <TableRow key={rule.rule_uid ?? rule.id} data-testid="admission-rule-row"><TableCell className="font-medium">{rule.name}</TableCell><TableCell><div className="flex items-center gap-2"><Switch checked={rule.enabled} disabled={readOnly || toggleMutation.isPending} onCheckedChange={(enabled) => toggleMutation.mutate({ rule, enabled })} aria-label={t('toggleRule', { name: rule.name })} /><Badge variant={rule.enabled ? 'default' : 'secondary'}>{rule.enabled ? t('statusEnabled') : t('statusDisabled')}</Badge></div></TableCell><TableCell className="text-sm text-muted-foreground">{rule.directions.map((direction) => tdir(direction)).join(' / ')}</TableCell><TableCell className="max-w-[180px] truncate text-sm text-muted-foreground" title={recipients.join(', ') || t('allRecipients')}>{recipients.join(', ') || t('allRecipients')}</TableCell><TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{signalText(rule) || '—'}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="link" size="sm" className="h-auto p-0" disabled={readOnly} onClick={() => { setEditing(rule); setSheetOpen(true); }} aria-label={t('edit')}>{t('edit')}</Button><Button variant="ghost" size="icon-sm" disabled={readOnly || copyMutation.isPending} onClick={() => copyMutation.mutate(rule)} aria-label={t('copy')}><Copy className="size-3.5" /></Button><Button variant="ghost" size="icon-sm" disabled={readOnly} onClick={() => setDeleting(rule)} aria-label={t('delete')}><Trash2 className="size-3.5" /></Button></div></TableCell></TableRow>;
          })}</TableBody></Table></div>
        )}
      </CardContent>
      {(query.data?.length ?? 0) > 0 ? <CardFooter className="text-sm text-muted-foreground">{t('footer', { total: query.data!.length, enabled: query.data!.filter((rule) => rule.enabled).length })}</CardFooter> : null}
      <AdmissionRuleSheet open={sheetOpen} onOpenChange={setSheetOpen} rule={editing} readOnly={readOnly} onSaved={() => { setSheetOpen(false); setEditing(null); invalidate(); }} />
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null); }} title={t('deleteTitle')} description={deleting ? t('confirmDelete', { name: deleting.name }) : ''} confirmText={t('delete')} variant="destructive" onConfirm={() => deleting && deleteMutation.mutate(deleting)} />
    </Card>
  );
}
