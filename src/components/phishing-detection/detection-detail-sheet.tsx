'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RecipientStatus } from '@/components/email-disposal/components/recipient-status';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getDetectionLogDetail } from '@/lib/api/phishing-detection';
import { useApiRequest } from '@/lib/api/client';
import { JsonBlock } from './json-block';
import { UrlFindingsTable } from './url-findings-table';
import { policyDispositionBadgeClass, riskBadgeClass } from './badge-styles';
import { usePhishingAccess } from './access';
import { phishingQueryKeys } from './phishing-query-keys';
import { formatDate } from '@/lib/utils';

const LIVE_TASKS = new Set(['submitting', 'pending', 'processing']);

function Field({ label, value, full = false }: { label: string; value?: string; full?: boolean }) {
  return <div className={full ? 'md:col-span-2' : ''}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm">{value || '—'}</p></div>;
}

export function DetectionDetailSheet({ open, onOpenChange, detailId }: { open: boolean; onOpenChange: (open: boolean) => void; detailId: string | null }) {
  const t = useTranslations('phishingDetection');
  const tc = useTranslations('common');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { canEdit } = usePhishingAccess();
  const queryClient = useQueryClient();
  const [stepSearch, setStepSearch] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const query = useQuery({ queryKey: phishingQueryKeys.detail(effectiveTenantId, detailId), queryFn: () => getDetectionLogDetail(detailId!, apiRequest), enabled: open && Boolean(detailId) });
  const summary = query.data?.summary;
  const investigation = query.data?.investigation;
  const steps = useMemo(() => investigation?.steps ?? [], [investigation?.steps]);
  const filteredSteps = useMemo(() => { const needle = stepSearch.trim().toLowerCase(); return needle ? steps.filter((step) => `${step.name} ${step.message ?? ''}`.toLowerCase().includes(needle)) : steps; }, [stepSearch, steps]);
  const findings = investigation?.result?.details?.url_findings ?? [];
  const evidence = investigation?.result?.evidence ?? [];
  const liveTask = summary ? LIVE_TASKS.has(summary.task_status) : false;
  const exportData = () => {
    if (!query.data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(query.data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = t('detail.exportFilename', { id: detailId ?? 'detail' }); anchor.click(); URL.revokeObjectURL(url);
  };
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: phishingQueryKeys.detail(effectiveTenantId, detailId) });
    queryClient.invalidateQueries({ queryKey: phishingQueryKeys.logsRoot(effectiveTenantId) });
    queryClient.invalidateQueries({ queryKey: phishingQueryKeys.statsRoot(effectiveTenantId) });
  };
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl" data-testid="phishing-detail-sheet">
    <SheetHeader className="shrink-0 border-b border-border px-6 py-4"><SheetTitle>{t('detail.title')}</SheetTitle><SheetDescription>{summary?.subject || (query.isLoading ? tc('loading') : t('detail.noSubject'))}</SheetDescription></SheetHeader>
    <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">{query.isLoading || !summary ? <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div> : <>
      {summary.result_truncated ? <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning">{t('detail.resultTruncatedHint')}</div> : null}
      <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-mail-context"><h3 className="text-sm font-semibold">{t('detail.mailContext')}</h3><div className="grid gap-3 md:grid-cols-2"><Field label={t('detail.sender')} value={summary.sender} /><Field label={t('detail.recipients')} value={summary.recipients.join(', ')} /><Field label={t('detail.subject')} value={summary.subject} full /><Field label={t('detail.sidelinedAt')} value={formatDate(summary.sidelined_at)} /><Field label={t('detail.direction')} value={t(`directionValue.${['inbound', 'outbound', 'internal'].includes(summary.direction) ? summary.direction : 'unknown'}`)} /></div><div className="flex flex-wrap items-center gap-2 pt-1"><Badge className={policyDispositionBadgeClass(summary.policy_disposition)}>{t(`policyDisposition.${summary.policy_disposition ?? 'undecided'}`)}</Badge>{summary.risk_level ? <Badge className={riskBadgeClass(summary.risk_level)}>{t(`riskLevel.${summary.risk_level}`)}</Badge> : null}{typeof summary.confidence === 'number' ? <Badge variant="outline">{t('detail.confidence')}: {Math.round(summary.confidence * 100)}%</Badge> : null}{summary.task_status ? <Badge variant="outline">{t(`taskStatus.${summary.task_status}`)}</Badge> : null}</div>{summary.failure_reason ? <p className="text-xs text-destructive">{t('detail.failureReason')}: {summary.failure_reason}</p> : null}</section>
      {investigation ? <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-investigation"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{t('detail.agentVerdict')}</h3>{investigation.status ? <Badge variant="outline">{t(`taskStatus.${['pending', 'running', 'completed', 'failed', 'needs_approval', 'cancelled'].includes(investigation.status) ? investigation.status : 'unknown'}`)}</Badge> : null}</div>{investigation.summary || investigation.result?.summary ? <p className="text-sm leading-6">{investigation.summary ?? investigation.result?.summary}</p> : null}{investigation.error_message ? <p className="text-xs text-destructive">{investigation.error_message}</p> : null}{evidence.map((item, index) => <div key={`${item.type}-${index}`} className="rounded-xl border border-border/50 bg-background/70 p-3"><div className="flex items-center gap-2"><Badge variant="outline">{t(`evidenceSeverity.${['low', 'medium', 'high', 'critical'].includes(item.severity) ? item.severity : 'unknown'}`)}</Badge><span className="text-sm font-medium">{item.title}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div>)}</section> : null}
      {findings.length ? <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-url-findings"><h3 className="text-sm font-semibold">{t('table.urlFindingsTitle', { count: findings.length })}</h3><UrlFindingsTable findings={findings} /></section> : null}
      <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-recipient-actions"><h3 className="text-sm font-semibold">{t('detail.recipientDetail')}</h3>{liveTask ? <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning" data-testid="phishing-live-task-hint">{t('detail.liveStateHint')}</div> : null}{summary.mail_log_id != null ? <RecipientStatus recipient_dispositions={summary.recipient_dispositions} mailLogId={summary.mail_log_id} sender={summary.sender} apiRequest={apiRequest} onDisposed={invalidate} readOnly={!canEdit || liveTask} showHeaderActions /> : <p className="text-sm text-muted-foreground">{t('detail.noDisposalTarget')}</p>}</section>
      <Collapsible open={configOpen} onOpenChange={setConfigOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-sm font-medium"><span>{t('detail.configSnapshot')}</span><ChevronDown className={configOpen ? 'size-4 rotate-180' : 'size-4'} /></CollapsibleTrigger><CollapsibleContent className="pt-2">{query.data?.config_snapshot ? <JsonBlock value={query.data.config_snapshot} /> : <p className="text-sm text-muted-foreground">{t('detail.configPlaceholder')}</p>}</CollapsibleContent></Collapsible>
      <Collapsible open={logOpen} onOpenChange={setLogOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-sm font-medium"><span>{t('detail.runLog')}</span><ChevronDown className={logOpen ? 'size-4 rotate-180' : 'size-4'} /></CollapsibleTrigger><CollapsibleContent className="space-y-2 pt-2"><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={stepSearch} onChange={(event) => setStepSearch(event.target.value)} placeholder={t('detail.searchSteps')} className="h-8 pl-7" /></div><Button variant="outline" size="sm" onClick={exportData}><Download className="size-3.5" />{t('detail.exportJson')}</Button></div>{filteredSteps.length ? filteredSteps.map((step, index) => <div key={`${step.name}-${index}`} className="rounded-lg border border-border p-2 text-xs"><div className="flex gap-2"><span className="font-medium">{step.name}</span><Badge variant="outline" className="text-xs">{t(`taskStatus.${['pending', 'processing', 'running', 'completed', 'failed', 'partial', 'cancelled'].includes(step.status) ? step.status : 'unknown'}`)}</Badge></div>{step.message ? <p className="mt-1 text-muted-foreground">{step.message}</p> : null}</div>) : <p className="text-sm text-muted-foreground">{t('detail.noSteps')}</p>}</CollapsibleContent></Collapsible>
    </>}</div>
  </SheetContent></Sheet>;
}
