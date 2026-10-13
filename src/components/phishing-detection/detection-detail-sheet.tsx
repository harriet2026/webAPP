'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RecipientStatus } from '@/components/email-disposal/components/recipient-status';
import { SendReceiveContextCard } from '@/components/email-disposal/sections/overview/send-receive-context-card';
import { SingleRecipientActions } from '@/components/email-disposal/sections/overview/single-recipient-actions';
import { MailOriginalCard } from '@/components/email-disposal/sections/overview/MailOriginalCard';
import { getMailLogDetail } from '@/components/email-disposal/lib/disposal-detail-api';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getDetectionLogDetail } from '@/lib/api/phishing-detection';
import { useApiRequest } from '@/lib/api/client';
import { JsonBlock } from './json-block';
import { UrlFindingsTable } from './url-findings-table';
import { usePhishingAccess } from './access';
import { phishingQueryKeys } from './phishing-query-keys';
import { formatDate } from '@/lib/utils';
import { AssessmentReportView } from '@/components/agent-center/assessment-report';
import { phishFailureReasonKey } from './failure-reason';
import { InvestigationAssessment } from './investigation-assessment';
import { DetectionDisposition } from './DetectionDisposition';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';

const LIVE_TASKS = new Set(['submitting', 'pending', 'processing']);
const DetailModal = dynamic(() => import('@/components/email-disposal/detail-modal').then((module) => module.DetailModal), { ssr: false });

function DisposalHistory({ open, onOpenChange, mailLogId }: { open: boolean; onOpenChange: (open: boolean) => void; mailLogId: number }) {
  const { isSystemAdmin } = useAuth();
  return <DetailModal open={open} onOpenChange={onOpenChange} mailLogId={mailLogId} readOnly isTenantAdmin={!isSystemAdmin} />;
}

function Field({ label, value, full = false, testId }: { label: string; value?: string; full?: boolean; testId?: string }) {
  return <div className={full ? 'md:col-span-2' : ''}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm" data-testid={testId}>{value || '—'}</p></div>;
}

export function DetectionDetailSheet({ open, onOpenChange, detailId }: { open: boolean; onOpenChange: (open: boolean) => void; detailId: string | null }) {
  const t = useTranslations('phishingDetection');
  const ta = useTranslations('assessment');
  const tc = useTranslations('common');
  const te = useTranslations('emailDisposal.detail.overview');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { canEdit } = usePhishingAccess();
  const [disposalTarget, setDisposalTarget] = useState<string | null>(null);
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
  const screenshots = investigation?.result?.details?.screenshots ?? [];
  const screenshotsOmittedCount = investigation?.result?.details?.screenshots_omitted_count ?? 0;
  const urlCount = new Set([...findings.map((finding) => finding.url || finding.final_url || ''), ...screenshots.map((capture) => capture.url)]).size;
  const liveTask = summary ? LIVE_TASKS.has(summary.task_status) : false;
  const mailLogId = summary?.mail_log_id ?? null;
  // 收发信上下文/邮件原文复用处置中心组件，数据源是处置中心的 mail-log 详情。
  const mailLogQuery = useQuery({
    queryKey: [...phishingQueryKeys.detail(effectiveTenantId, detailId), 'mail-log', mailLogId],
    queryFn: () => getMailLogDetail(mailLogId!, apiRequest),
    enabled: open && mailLogId != null,
    retry: false,
  });
  // The API owns the mail-log association. Validate returned identity when
  // available; sender/subject are not unique identifiers for a message.
  const mailDetail = useMemo(() => {
    const detail = mailLogQuery.data;
    if (!detail || !summary) return null;
    return detail.id === summary.mail_log_id && (!summary.message_uuid || detail.message_uuid === summary.message_uuid) ? detail : null;
  }, [mailLogQuery.data, summary]);
  const mailContextLoading = mailLogId != null && mailLogQuery.isPending;
  const disposalKey = `${effectiveTenantId}:${detailId}:${mailLogId}`;
  const headerSummary = useMemo(() => {
    if (!summary) return '';
    const parts = [
      summary.risk_level ? t(`riskLevel.${summary.risk_level}`) : null,
      summary.policy_disposition ? t('policyAction', { action: t(`policyDisposition.${summary.policy_disposition}`) }) : null,
      typeof summary.confidence === 'number' && Number.isFinite(summary.confidence) && summary.confidence >= 0 && summary.confidence <= 1 ? ta('presentation.threatScore', { score: Math.round(summary.confidence * 100) }) : null,
    ].filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(' · ') : (summary.subject || t('detail.noSubject'));
  }, [summary, t, ta]);
  const anchors = useMemo(() => {
    if (!summary) return [];
    return [
      ...(mailDetail
        ? [
            { id: 'phishing-detail-context', label: te('context.title'), show: true },
            { id: 'phishing-detail-original', label: te('emailContent'), show: true },
          ]
        : [
            { id: 'phishing-detail-recipients', label: t('detail.recipientDetail'), show: true },
            { id: 'phishing-detail-context', label: t('detail.mailContext'), show: true },
          ]),
      { id: 'phishing-detail-assessment', label: ta('presentation.title'), show: Boolean(investigation) },
      { id: 'phishing-detail-report', label: ta('title'), show: true },
      { id: 'phishing-detail-urls', label: t('table.urlFindings'), show: urlCount > 0 || screenshotsOmittedCount > 0 },
      { id: 'phishing-detail-logs', label: t('detail.runLog'), show: true },
    ].filter((item) => item.show);
  }, [summary, mailDetail, investigation, urlCount, screenshotsOmittedCount, t, ta, te]);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: phishingQueryKeys.detail(effectiveTenantId, detailId) });
    queryClient.invalidateQueries({ queryKey: phishingQueryKeys.logsRoot(effectiveTenantId) });
    queryClient.invalidateQueries({ queryKey: phishingQueryKeys.statsRoot(effectiveTenantId) });
  };
  return <Sheet open={open} onOpenChange={(next) => { if (!next) setDisposalTarget(null); onOpenChange(next); }}><SheetContent side="right" showCloseButton={false} className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl" data-testid="phishing-detail-sheet">
    <SheetHeader className="shrink-0 border-b border-border px-6 py-4"><div className="min-w-0"><SheetTitle>{t('detail.title')}</SheetTitle><SheetDescription className="break-words">{headerSummary || (query.isLoading ? tc('loading') : t('detail.noSubject'))}</SheetDescription></div></SheetHeader>
    <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">{query.isError ? <AssessmentReportView error /> : query.isLoading || !summary ? <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div> : <>
      {summary.result_truncated ? <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning">{t('detail.resultTruncatedHint')}</div> : null}
      <nav aria-label={t('detail.title')} className="flex flex-wrap gap-1.5" data-testid="phishing-detail-anchor-nav">{anchors.map((item) => <button key={item.id} type="button" className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{item.label}</button>)}</nav>
      <section className="space-y-2" data-testid="phishing-detail-disposition">
        <h3 className="text-sm font-semibold">{t('table.disposition')}</h3>
        <DetectionDisposition item={summary} testId="phishing-detail-actual-disposition" />
        {mailDetail ? <Button variant="outline" size="sm" onClick={() => setDisposalTarget(disposalKey)}>{t('detail.viewDisposalHistory')}</Button> : null}
      </section>
      {mailContextLoading ? <div className="flex justify-center py-6" data-testid="phishing-mail-context-loading"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> : mailDetail ? <>
        <section id="phishing-detail-context" className="space-y-3" data-testid="phishing-mail-context">
          {liveTask ? <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning" data-testid="phishing-live-task-hint">{t('detail.liveStateHint')}</div> : null}
          <SendReceiveContextCard detail={mailDetail} apiRequest={apiRequest} onDisposed={invalidate} readOnly={!canEdit || liveTask} />
          {(mailDetail.recipient_dispositions?.length ?? 0) === 1 ? <SingleRecipientActions recipient_dispositions={mailDetail.recipient_dispositions} mailLogId={mailDetail.id} sender={mailDetail.sender} apiRequest={apiRequest} onDisposed={invalidate} readOnly={!canEdit || liveTask} redeliverAvailable={mailDetail.redeliver_available === true} redeliverUnavailableReason={mailDetail.redeliver_unavailable_reason} /> : null}
          {summary.failure_reason ? <p className="text-xs text-destructive" data-testid="phishing-failure-reason">{t('detail.failureReason')}: {t(`detail.failureReasonValue.${phishFailureReasonKey(summary.failure_reason)}`)}</p> : null}
        </section>
        <section id="phishing-detail-original" className="overflow-hidden rounded-2xl border border-border/60" data-testid="phishing-mail-original"><MailOriginalCard key={`${effectiveTenantId}:${mailDetail.id}`} detail={mailDetail} requestFn={apiRequest} /></section>
      </> : <>
        <section id="phishing-detail-recipients" className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-recipient-actions"><h3 className="text-sm font-semibold">{t('detail.recipientDetail')}</h3>{liveTask ? <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning" data-testid="phishing-live-task-hint">{t('detail.liveStateHint')}</div> : null}{summary.mail_log_id != null ? <RecipientStatus recipient_dispositions={summary.recipient_dispositions} mailLogId={summary.mail_log_id} sender={summary.sender} apiRequest={apiRequest} onDisposed={invalidate} readOnly={!canEdit || liveTask} showHeaderActions /> : <p className="text-sm text-muted-foreground">{t('detail.noDisposalTarget')}</p>}</section>
        <section id="phishing-detail-context" className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-mail-context"><h3 className="text-sm font-semibold">{t('detail.mailContext')}</h3><div className="grid gap-3 md:grid-cols-2"><Field label={t('detail.sender')} value={summary.sender} /><Field label={t('detail.recipients')} value={(summary.recipients ?? []).join(', ')} testId="phishing-mail-context-recipients" /><Field label={t('detail.subject')} value={summary.subject} full /><Field label={t('detail.sidelinedAt')} value={formatDate(summary.sidelined_at)} /><Field label={t('detail.direction')} value={t(`directionValue.${['inbound', 'outbound', 'internal'].includes(summary.direction ?? '') ? summary.direction : 'unknown'}`)} /></div>{summary.failure_reason ? <p className="text-xs text-destructive" data-testid="phishing-failure-reason">{t('detail.failureReason')}: {t(`detail.failureReasonValue.${phishFailureReasonKey(summary.failure_reason)}`)}</p> : null}</section>
      </>}
      {investigation ? <InvestigationAssessment summary={summary} investigation={investigation} /> : null}
      <AssessmentReportView result={investigation?.result} layout="findings" anchorId="phishing-detail-report" />
      {urlCount || screenshotsOmittedCount ? <section id="phishing-detail-urls" className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-url-findings"><h3 className="text-sm font-semibold">{t('table.urlFindingsTitle', { count: urlCount })}</h3><UrlFindingsTable key={`${effectiveTenantId}:${detailId}`} findings={findings} screenshots={screenshots} screenshotsOmittedCount={screenshotsOmittedCount} assessmentResult={investigation?.result} /></section> : null}
      <section id="phishing-detail-logs"><Collapsible open={logOpen} onOpenChange={setLogOpen}><CollapsibleTrigger data-testid="phishing-detail-run-log" className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-sm font-medium"><span>{t('detail.runLog')}</span><ChevronDown className={logOpen ? 'size-4 rotate-180' : 'size-4'} /></CollapsibleTrigger><CollapsibleContent data-testid="phishing-detail-run-log-body" className="space-y-2 pt-2"><p className="text-xs text-muted-foreground">{t('detail.runLogRawNote')}</p>{investigation?.error_message || summary.failure_reason ? <p className="break-words rounded-lg border border-border p-2 font-mono text-xs text-muted-foreground" data-testid="phishing-detail-diagnostic">{t('detail.diagnostic')}: {[investigation?.error_message, summary.failure_reason].filter(Boolean).join(' · ')}</p> : null}<div className="relative"><Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input data-testid="phishing-detail-log-search" value={stepSearch} onChange={(event) => setStepSearch(event.target.value)} placeholder={t('detail.searchSteps')} className="h-8 pl-7" /></div>{filteredSteps.length ? filteredSteps.map((step, index) => <div key={`${step.name}-${index}`} data-testid={`phishing-detail-step-${index}`} className="rounded-lg border border-border p-2 text-xs"><div className="flex gap-2"><span className="font-medium">{step.name}</span>{['pending', 'processing', 'running', 'completed', 'failed', 'partial', 'cancelled'].includes(step.status) ? <Badge variant="outline" className="text-xs">{t(`taskStatus.${step.status}`)}</Badge> : <Badge variant="outline" className="text-xs" title={t('detail.stepStatusNotRecordedHint')}>{t('detail.stepStatusNotRecorded')}</Badge>}</div>{step.message ? <p className="mt-1 text-muted-foreground">{step.message}</p> : null}</div>) : <p className="text-sm text-muted-foreground">{t('detail.noSteps')}</p>}</CollapsibleContent></Collapsible></section>
      <Collapsible open={configOpen} onOpenChange={setConfigOpen}><CollapsibleTrigger data-testid="phishing-detail-config-snapshot" className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-sm font-medium"><span>{t('detail.configSnapshot')}</span><ChevronDown className={configOpen ? 'size-4 rotate-180' : 'size-4'} /></CollapsibleTrigger><CollapsibleContent data-testid="phishing-detail-config-snapshot-body" className="pt-2">{query.data?.config_snapshot ? <JsonBlock value={query.data.config_snapshot} /> : <p className="text-sm text-muted-foreground">{t('detail.configPlaceholder')}</p>}</CollapsibleContent></Collapsible>
    </>}</div>
  </SheetContent>{mailDetail && disposalTarget === disposalKey ? <DisposalHistory key={disposalKey} open={open} onOpenChange={(next) => { if (!next) setDisposalTarget(null); }} mailLogId={mailDetail.id} /> : null}</Sheet>;
}
