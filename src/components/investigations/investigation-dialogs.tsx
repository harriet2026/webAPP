'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, Copy, Globe, Loader2, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRouter } from '@/i18n/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cancelInvestigation, createInvestigation, getInvestigation } from '@/lib/api/investigations';
import { useApiRequest } from '@/lib/api/client';
import { createRulePrefillKey, storeRulePrefill } from '@/lib/rule-prefill';
import { getUnifiedRules } from '@/lib/api/unified-rules';
import { formatDate } from '@/lib/utils';
import type {
  CreateInvestigationRequest,
  InvestigationAction,
  InvestigationDetailResponse,
  InvestigationEvidence,
  InvestigationRecommendedAction,
  InvestigationRelatedObjects,
  InvestigationRiskLevel,
  InvestigationStatus,
  InvestigationStep,
  InvestigationTask,
  InvestigationTargetType,
  InvestigationType,
} from '@/types/investigation';
import type { CreateRuleRequest, Rule, RuleNode } from '@/types/unified-rules';
import { genericAgentTypes } from './investigation-types';

const STRUCTURED_DETAIL_KEYS = [
  'mail_log_id',
  'sender',
  'subject',
  'cac_tag',
  'cac_tid',
  'cac_suspicious_urls',
  'similar_mail_count',
  'similar_search_methods',
  'used_eml',
  'storage_kind',
  'target_action',
  'target_status',
  'target_cac_tag',
  'target_suspicious_url_cnt',
  'action_counts',
  'status_counts',
  'analyzed_urls',
  'fetched_urls',
  'skipped_urls',
  'top_suspicious_urls',
  'ranked_urls',
  'candidate_rules',
  'candidate_rule_analysis',
  'recall_candidates',
  'top_similar_messages',
  'similar_matches',
] as const;

function riskBadgeVariant(risk: InvestigationRiskLevel) {
  switch (risk) {
    case 'critical':
    case 'high':
      return 'destructive' as const;
    case 'medium':
      return 'default' as const;
    case 'low':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

function statusBadgeVariant(status: InvestigationStatus) {
  switch (status) {
    case 'failed':
    case 'cancelled':
      return 'destructive' as const;
    case 'completed':
      return 'default' as const;
    case 'running':
    case 'needs_approval':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-border/60 bg-muted/20 p-4 text-xs whitespace-pre-wrap break-all">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

function isActiveTask(status: InvestigationStatus) {
  return status === 'pending' || status === 'running';
}

function getDetailObjectArray(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  if (!Array.isArray(value)) {
    return [] as Record<string, unknown>[];
  }
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
}

function getDetailScalar(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ? value : undefined;
}

function omitStructuredDetails(details: Record<string, unknown> | undefined) {
  if (!details) {
    return {} as Record<string, unknown>;
  }
  return Object.fromEntries(Object.entries(details).filter(([key]) => !STRUCTURED_DETAIL_KEYS.includes(key as typeof STRUCTURED_DETAIL_KEYS[number])));
}

function DetailList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const count = Array.isArray(children) ? children.length : undefined;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {count === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : children}
    </div>
  );
}

export function InvestigationDetailDialog({
  open,
  onOpenChange,
  taskId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { apiRequest } = useApiRequest();
  const [linkCopied, setLinkCopied] = useState(false);
  const copyResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['investigation', taskId],
    queryFn: () => getInvestigation(taskId!, apiRequest),
    enabled: open && !!taskId,
    refetchInterval: (query) => {
      const task = (query.state.data as InvestigationDetailResponse | undefined)?.task;
      if (!task) return false;
      return task.status === 'pending' || task.status === 'running' ? 3000 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelInvestigation(id, apiRequest),
    onSuccess: () => toast.success(t('investigations.cancelSuccess')),
    onError: (e) => toast.error(e instanceof Error ? e.message : t('investigations.cancelError')),
  });

  const { data: actionRules = [] } = useQuery({
    queryKey: ['investigation-action-rules'],
    queryFn: () => getUnifiedRules({ rule_class: 'action' }, apiRequest),
    enabled: open,
    staleTime: 30_000,
  });

  const task = data?.task;
  const details = task?.result.details;
  const analyzedURLs = getDetailObjectArray(details, 'analyzed_urls');
  const fetchedURLs = getDetailObjectArray(details, 'fetched_urls');
  const skippedURLs = getDetailObjectArray(details, 'skipped_urls');
  const topSuspiciousURLs = getDetailObjectArray(details, 'top_suspicious_urls');
  const rankedURLs = getDetailObjectArray(details, 'ranked_urls');
  const candidateRuleAnalysis = getDetailObjectArray(details, 'candidate_rule_analysis');
  const candidateRules = getDetailObjectArray(details, 'candidate_rules');
  const recallCandidates = getDetailObjectArray(details, 'recall_candidates');
  const topSimilarMessages = getDetailObjectArray(details, 'top_similar_messages');
  const fallbackSimilarMatches = getDetailObjectArray(details, 'similar_matches');
  const displayedSimilarMessages = topSimilarMessages.length > 0 ? topSimilarMessages : fallbackSimilarMatches;
  const extraDetails = omitStructuredDetails(details);
  const urlFetchBudget = getDetailScalar(details, 'url_fetch_budget');
  const rankedURLCount = getDetailScalar(details, 'ranked_url_count');
  const llmRankedURLCount = getDetailScalar(details, 'llm_ranked_url_count');
  const ruleReplayWindowDays = getDetailScalar(details, 'rule_replay_window_days');
  const searchMethods = readStringArray(details?.search_methods);
  const similarSearchMethods = readStringArray(details?.similar_search_methods);
  const similarMatchCount = readNumber(details?.similar_match_count);
  const clusterMatchCount = readNumber(details?.cluster_match_count);
  const recallCandidateCount = readNumber(details?.recall_candidate_count);
  const sameSubjectCount = readNumber(details?.same_subject_count);
  const detailMailLogId = readString(details?.mail_log_id) || String(readNumber(details?.mail_log_id) ?? '');
  const detailSender = readString(details?.sender);
  const detailSubject = readString(details?.subject);
  const detailCACTag = readString(details?.cac_tag) || readString(details?.target_cac_tag);
  const detailCACTID = readString(details?.cac_tid);
  const detailStorageKind = readString(details?.storage_kind);
  const detailUsedEML = readBoolean(details?.used_eml);
  const targetResolvedBy = readString(details?.target_resolved_by);
  const targetAccount = readString(details?.target_account);
  const targetCluster = readString(details?.target_cluster);
  const targetCACTID = readString(details?.target_cac_tid);
  const targetMailLogIDs = readNumberArray(details?.target_mail_log_ids);
  const targetMailLogCount = readNumber(details?.target_mail_log_count);
  const accountID = readString(details?.account_id);
  const authAttemptCount = readNumber(details?.auth_attempt_count);
  const authFailureCount = readNumber(details?.auth_failure_count);
  const authSuccessCount = readNumber(details?.auth_success_count);
  const uniqueIPCount = readNumber(details?.unique_ip_count);
  const recentMailCount = readNumber(details?.recent_mail_count);
  const uniqueRecipientCount = readNumber(details?.unique_recipient_count);
  const recentIPs = readStringArray(details?.recent_ips);
  const failureReasons = getDetailObjectArray(details, 'failure_reasons');
  const recentActionCounts = readObjectEntries(details?.recent_action_counts);
  const sortedRecentActionCounts = sortCountEntries(recentActionCounts);
  const targetAction = readString(details?.target_action);
  const targetStatus = readString(details?.target_status);
  const targetSuspiciousURLCount = readNumber(details?.target_suspicious_url_cnt);
  const similarMailCount = readNumber(details?.similar_mail_count);
  const cacSuspiciousURLs = readStringArray(details?.cac_suspicious_urls);
  const actionCounts = readObjectEntries(details?.action_counts);
  const statusCounts = readObjectEntries(details?.status_counts);

  const handleOpenMailLog = useCallback((mailLogId: string) => {
    const trimmed = mailLogId.trim();
    if (!trimmed) {
      return;
    }
    onOpenChange(false);
    router.push(`/logs/email?mail_log_id=${encodeURIComponent(trimmed)}`);
  }, [onOpenChange, router]);
  const sameSenderCount = readNumber(details?.same_sender_count);

  const handleCopyLink = useCallback(async () => {
    if (!taskId || typeof window === 'undefined') {
      return;
    }
    const url = new URL(`/${locale}/investigations`, window.location.origin);
    url.searchParams.set('task_id', taskId);
    try {
      await navigator.clipboard.writeText(url.toString());
      setLinkCopied(true);
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setLinkCopied(false);
        copyResetTimeoutRef.current = null;
      }, 2000);
      toast.success(t('investigations.copyLinkSuccess'));
    } catch {
      toast.error(t('investigations.copyLinkFailed'));
    }
  }, [locale, t, taskId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-6xl flex-col overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle>{t('investigations.detailTitle')}</DialogTitle>
              <DialogDescription>
                {taskId ? t('investigations.detailDescription', { id: taskId }) : t('common.loading')}
              </DialogDescription>
            </div>
            {task ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void handleCopyLink()}>
                  {linkCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {linkCopied ? t('investigations.copiedLink') : t('investigations.copyLink')}
                </Button>
                <Badge variant={statusBadgeVariant(task.status)} className={isActiveTask(task.status) ? 'animate-pulse' : ''}>
                  {t(`investigations.statuses.${task.status}`)}
                </Badge>
                {isActiveTask(task.status) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(task.id)}
                  >
                    {cancelMutation.isPending ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : null}
                    {t('investigations.cancelTask')}
                  </Button>
                ) : null}
                {isFetching ? (
                  <Badge variant="outline">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    {t('investigations.refreshing')}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : task ? (
          <Tabs defaultValue="overview" className="min-h-0 flex-1 px-6 py-5">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">{t('investigations.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="steps">{t('investigations.tabs.steps')}</TabsTrigger>
              <TabsTrigger value="actions">{t('investigations.tabs.actions')}</TabsTrigger>
              <TabsTrigger value="raw">{t('investigations.tabs.raw')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="min-h-0 overflow-y-auto pr-2">
              <div className="grid grid-cols-1 gap-4 pb-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusBadgeVariant(task.status)}>{t(`investigations.statuses.${task.status}`)}</Badge>
                    <Badge variant={riskBadgeVariant(task.risk_level)}>{task.risk_level ? t(`investigations.risks.${task.risk_level}`) : t('investigations.notAvailable')}</Badge>
                    <Badge variant="outline">{t(`investigations.types.${task.type}`)}</Badge>
                    {isActiveTask(task.status) ? <Badge variant="outline">{t('investigations.autoRefreshing')}</Badge> : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    <h3 className="text-base font-semibold">{task.summary || t('investigations.pendingSummary')}</h3>
                    {task.result?.summary ? <p className="text-sm text-muted-foreground">{task.result.summary}</p> : null}
                  </div>
                </div>

                <InfoCard label={t('investigations.fields.taskId')} value={task.id} mono />
                <InfoCard label={t('investigations.fields.createdBy')} value={task.created_by || '-'} />
                <InfoCard label={t('investigations.fields.targetType')} value={formatTargetType(task.target_type, t)} />
                <InfoCard label={t('investigations.fields.targetIds')} value={task.target_ids.join(', ') || '-'} mono />
                <InfoCard label={t('investigations.fields.confidence')} value={formatConfidence(task.confidence)} />
                <InfoCard label={t('investigations.fields.updatedAt')} value={formatDate(task.updated_at)} />

                {task.prompt ? (
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                    <Label className="text-muted-foreground">{t('investigations.fields.prompt')}</Label>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{task.prompt}</p>
                  </div>
                ) : null}

                {(detailMailLogId || detailSender || detailSubject || detailCACTag || detailCACTID || detailStorageKind || typeof detailUsedEML === 'boolean' || targetResolvedBy || targetAccount || targetCluster || targetCACTID || targetMailLogIDs.length > 0 || typeof targetMailLogCount === 'number' || accountID || typeof authAttemptCount === 'number' || typeof authFailureCount === 'number' || typeof authSuccessCount === 'number' || typeof uniqueIPCount === 'number' || typeof recentMailCount === 'number' || typeof uniqueRecipientCount === 'number' || recentIPs.length > 0 || failureReasons.length > 0 || recentActionCounts.length > 0 || targetAction || targetStatus || typeof targetSuspiciousURLCount === 'number' || typeof similarMailCount === 'number' || similarSearchMethods.length > 0 || cacSuspiciousURLs.length > 0 || actionCounts.length > 0 || statusCounts.length > 0) ? (
                  <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">{t('investigations.sections.targetSummary')}</h3>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {detailMailLogId ? <InfoCard label={t('investigations.fields.mailLogId')} value={detailMailLogId} mono /> : null}
                        {detailSender ? <InfoCard label={t('investigations.fields.sender')} value={detailSender} /> : null}
                        {detailSubject ? <InfoCard label={t('investigations.fields.subject')} value={detailSubject} /> : null}
                        {detailCACTag ? <InfoCard label={t('investigations.fields.cacTag')} value={detailCACTag} /> : null}
                        {detailCACTID ? <InfoCard label={t('investigations.fields.cacTid')} value={detailCACTID} mono /> : null}
                        {accountID ? <InfoCard label={t('investigations.fields.accountId')} value={accountID} /> : null}
                        {targetAccount ? <InfoCard label={t('investigations.fields.targetAccount')} value={targetAccount} /> : null}
                        {targetCluster ? <InfoCard label={t('investigations.fields.targetCluster')} value={targetCluster} mono /> : null}
                        {targetCACTID ? <InfoCard label={t('investigations.fields.targetCacTid')} value={targetCACTID} mono /> : null}
                        {targetMailLogIDs.length > 0 ? <InfoCard label={t('investigations.fields.targetMailLogIds')} value={targetMailLogIDs.join(', ')} mono /> : null}
                        {detailStorageKind ? <InfoCard label={t('investigations.fields.storageKind')} value={detailStorageKind} /> : null}
                      </div>

                      {(targetResolvedBy || typeof targetMailLogCount === 'number' || typeof authAttemptCount === 'number' || typeof authFailureCount === 'number' || typeof authSuccessCount === 'number' || typeof uniqueIPCount === 'number' || typeof recentMailCount === 'number' || typeof uniqueRecipientCount === 'number' || targetAction || targetStatus || typeof detailUsedEML === 'boolean' || typeof targetSuspiciousURLCount === 'number' || typeof similarMailCount === 'number') ? (
                        <div className="flex flex-wrap gap-2">
                          {targetResolvedBy ? <MetricBadge label={t('investigations.fields.targetResolvedBy')} value={formatTargetResolutionMethod(targetResolvedBy, t)} /> : null}
                          {typeof targetMailLogCount === 'number' ? <MetricBadge label={t('investigations.fields.targetMailLogCount')} value={String(targetMailLogCount)} /> : null}
                          {typeof authAttemptCount === 'number' ? <MetricBadge label={t('investigations.fields.authAttemptCount')} value={String(authAttemptCount)} /> : null}
                          {typeof authFailureCount === 'number' ? <MetricBadge label={t('investigations.fields.authFailureCount')} value={String(authFailureCount)} /> : null}
                          {typeof authSuccessCount === 'number' ? <MetricBadge label={t('investigations.fields.authSuccessCount')} value={String(authSuccessCount)} /> : null}
                          {typeof uniqueIPCount === 'number' ? <MetricBadge label={t('investigations.fields.uniqueIpCount')} value={String(uniqueIPCount)} /> : null}
                          {typeof recentMailCount === 'number' ? <MetricBadge label={t('investigations.fields.recentMailCount')} value={String(recentMailCount)} /> : null}
                          {typeof uniqueRecipientCount === 'number' ? <MetricBadge label={t('investigations.fields.uniqueRecipientCount')} value={String(uniqueRecipientCount)} /> : null}
                          {targetAction ? <MetricBadge label={t('investigations.fields.targetAction')} value={formatMailAction(targetAction, t)} /> : null}
                          {targetStatus ? <MetricBadge label={t('investigations.fields.targetStatus')} value={formatMailStatus(targetStatus, t)} /> : null}
                          {typeof detailUsedEML === 'boolean' ? <MetricBadge label={t('investigations.fields.usedEml')} value={detailUsedEML ? t('common.yes') : t('common.no')} /> : null}
                          {typeof targetSuspiciousURLCount === 'number' ? <MetricBadge label={t('investigations.fields.targetSuspiciousUrlCount')} value={String(targetSuspiciousURLCount)} /> : null}
                          {typeof similarMailCount === 'number' ? <MetricBadge label={t('investigations.fields.similarMailCount')} value={String(similarMailCount)} /> : null}
                        </div>
                      ) : null}

                      {similarSearchMethods.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t('investigations.fields.similarSearchMethods')}</span>
                          {similarSearchMethods.map((method) => <Badge key={method} variant="outline">{formatSearchMethod(method, t)}</Badge>)}
                        </div>
                      ) : null}

                      {cacSuspiciousURLs.length > 0 ? (
                        <RelatedObjectGroup label={t('investigations.fields.cacSuspiciousUrls')}>
                          {cacSuspiciousURLs.map((url) => <RelatedURLLink key={url} url={url} />)}
                        </RelatedObjectGroup>
                      ) : null}

                      {recentIPs.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">{t('investigations.fields.recentIps')}</p>
                          <div className="flex flex-wrap gap-2">
                            {recentIPs.map((ip) => <Badge key={ip} variant="outline" className="font-mono">{ip}</Badge>)}
                          </div>
                        </div>
                      ) : null}

                      {failureReasons.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">{t('investigations.fields.failureReasons')}</p>
                          <div className="flex flex-wrap gap-2">
                            {failureReasons.map((item, index) => <FailureReasonBadge key={`failure-reason-${index}`} item={item} />)}
                          </div>
                        </div>
                      ) : null}

                      {sortedRecentActionCounts.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">{t('investigations.fields.recentActionCounts')}</p>
                          <div className="flex flex-wrap gap-2">
                            {sortedRecentActionCounts.map(([key, value]) => <Badge key={key} variant="outline">{formatMailAction(key, t)}: {String(value)}</Badge>)}
                          </div>
                        </div>
                      ) : null}

                      {actionCounts.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">{t('investigations.fields.actionCounts')}</p>
                          <div className="flex flex-wrap gap-2">
                            {actionCounts.map(([key, value]) => <Badge key={key} variant="outline">{formatMailAction(key, t)}: {String(value)}</Badge>)}
                          </div>
                        </div>
                      ) : null}

                      {statusCounts.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">{t('investigations.fields.statusCounts')}</p>
                          <div className="flex flex-wrap gap-2">
                            {statusCounts.map(([key, value]) => <Badge key={key} variant="outline">{formatMailStatus(key, t)}: {String(value)}</Badge>)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {(topSuspiciousURLs.length > 0 || analyzedURLs.length > 0 || fetchedURLs.length > 0 || skippedURLs.length > 0 || rankedURLs.length > 0) ? (
                  <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-sm font-semibold text-foreground">{t('investigations.sections.urlAnalysis')}</h3>
                      {typeof urlFetchBudget !== 'undefined' ? <Badge variant="outline">{t('investigations.fields.fetchBudget')}: {String(urlFetchBudget)}</Badge> : null}
                      {typeof rankedURLCount !== 'undefined' ? <Badge variant="outline">{t('investigations.fields.rankedUrlCount')}: {String(rankedURLCount)}</Badge> : null}
                      {typeof llmRankedURLCount !== 'undefined' ? <Badge variant="outline">{t('investigations.fields.llmRankedUrlCount')}: {String(llmRankedURLCount)}</Badge> : null}
                    </div>

                    <DetailList title={t('investigations.sections.topSuspiciousUrls')} empty={t('investigations.emptyTopUrls')}>
                      {topSuspiciousURLs.map((item, index) => <URLFindingRow key={`top-${index}`} item={item} emphasized />)}
                    </DetailList>

                    <DetailList title={t('investigations.sections.analyzedUrls')} empty={t('investigations.emptyAnalyzedUrls')}>
                      {analyzedURLs.map((item, index) => <URLFindingRow key={`analyzed-${index}`} item={item} />)}
                    </DetailList>

                    <DetailList title={t('investigations.sections.fetchedUrls')} empty={t('investigations.emptyFetchedUrls')}>
                      {fetchedURLs.map((item, index) => <FetchedURLRow key={`fetched-${index}`} item={item} />)}
                    </DetailList>

                    <DetailList title={t('investigations.sections.skippedUrls')} empty={t('investigations.emptySkippedUrls')}>
                      {skippedURLs.map((item, index) => <SkippedURLRow key={`skipped-${index}`} item={item} />)}
                    </DetailList>

                    <DetailList title={t('investigations.sections.rankedUrls')} empty={t('investigations.emptyRankedUrls')}>
                      {rankedURLs.map((item, index) => <RankedURLRow key={`ranked-${index}`} item={item} />)}
                    </DetailList>
                  </div>
                ) : null}

                {(candidateRules.length > 0 || candidateRuleAnalysis.length > 0 || recallCandidates.length > 0 || displayedSimilarMessages.length > 0 || searchMethods.length > 0 || typeof similarMatchCount === 'number' || typeof clusterMatchCount === 'number' || typeof recallCandidateCount === 'number' || typeof sameSubjectCount === 'number' || typeof sameSenderCount === 'number') ? (
                  <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                    {(searchMethods.length > 0 || typeof similarMatchCount === 'number' || typeof clusterMatchCount === 'number' || typeof recallCandidateCount === 'number' || typeof sameSubjectCount === 'number' || typeof sameSenderCount === 'number') ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">{t('investigations.sections.similaritySummary')}</h3>
                        <div className="flex flex-wrap gap-2">
                          {typeof similarMatchCount === 'number' ? <MetricBadge label={t('investigations.fields.similarMatchCount')} value={String(similarMatchCount)} /> : null}
                          {typeof clusterMatchCount === 'number' ? <MetricBadge label={t('investigations.fields.clusterMatchCount')} value={String(clusterMatchCount)} /> : null}
                          {typeof recallCandidateCount === 'number' ? <MetricBadge label={t('investigations.fields.recallCandidateCount')} value={String(recallCandidateCount)} /> : null}
                          {typeof sameSenderCount === 'number' ? <MetricBadge label={t('investigations.fields.sameSenderCount')} value={String(sameSenderCount)} /> : null}
                          {typeof sameSubjectCount === 'number' ? <MetricBadge label={t('investigations.fields.sameSubjectCount')} value={String(sameSubjectCount)} /> : null}
                        </div>
                        {searchMethods.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">{t('investigations.fields.searchMethods')}</span>
                            {searchMethods.map((method) => <Badge key={method} variant="outline">{formatSearchMethod(method, t)}</Badge>)}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {candidateRules.length > 0 ? (
                      <DetailList title={t('investigations.sections.candidateRules')} empty={t('investigations.emptyCandidateRules')}>
                        {candidateRules.map((item, index) => (
                          <CandidateRuleRow
                            key={`candidate-rule-${index}`}
                            item={item}
                            rules={actionRules}
                            returnTaskId={task.id}
                            returnMailLogId={detailMailLogId || task.target_ids[0]}
                          />
                        ))}
                      </DetailList>
                    ) : null}

                    {candidateRuleAnalysis.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-sm font-semibold text-foreground">{t('investigations.sections.ruleReplay')}</h3>
                          {typeof ruleReplayWindowDays !== 'undefined' ? <Badge variant="outline">{t('investigations.fields.ruleReplayWindowDays')}: {String(ruleReplayWindowDays)}</Badge> : null}
                        </div>
                        <DetailList title={t('investigations.sections.candidateRuleAnalysis')} empty={t('investigations.emptyCandidateRuleAnalysis')}>
                          {candidateRuleAnalysis.map((item, index) => (
                            <CandidateRuleAnalysisRow
                              key={`rule-analysis-${index}`}
                              item={item}
                              rules={actionRules}
                              returnTaskId={task.id}
                              returnMailLogId={detailMailLogId || task.target_ids[0]}
                            />
                          ))}
                        </DetailList>
                      </div>
                    ) : null}

                    <DetailList title={t('investigations.sections.recallCandidates')} empty={t('investigations.emptyRecallCandidates')}>
                      {recallCandidates.map((item, index) => <SimilarMessageRow key={`recall-${index}`} item={item} emphasized onOpenMailLog={handleOpenMailLog} />)}
                    </DetailList>

                    <DetailList title={t('investigations.sections.topSimilarMessages')} empty={t('investigations.emptyTopSimilarMessages')}>
                      {displayedSimilarMessages.map((item, index) => <SimilarMessageRow key={`similar-${index}`} item={item} onOpenMailLog={handleOpenMailLog} />)}
                    </DetailList>
                  </div>
                ) : null}

                <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                  <DetailList title={t('investigations.sections.evidence')} empty={t('investigations.emptyEvidence')}>
                    {(task.result.evidence ?? []).map((item, index) => (
                      <EvidenceRow key={`${item.type}-${index}`} item={item} />
                    ))}
                  </DetailList>

                  <DetailList title={t('investigations.sections.recommendedActions')} empty={t('investigations.emptyActions')}>
                    {(task.result.recommended_actions ?? []).map((item, index) => (
                      <RecommendedActionRow key={`${item.type}-${index}`} item={item} />
                    ))}
                  </DetailList>

                  <RelatedObjectsSection
                    value={task.result.related_objects}
                    empty={t('investigations.emptyRelatedObjects')}
                    onOpenMailLog={handleOpenMailLog}
                  />

                  <DetailList title={t('investigations.sections.details')} empty={t('investigations.emptyDetails')}>
                    {Object.keys(extraDetails).length > 0 ? <JsonBlock value={extraDetails} /> : []}
                  </DetailList>

                  {task.error_message ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                      <Label className="text-destructive">{t('investigations.fields.error')}</Label>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-destructive">{task.error_message}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="steps" className="min-h-0 overflow-y-auto pr-2">
              <div className="space-y-3 pb-4">
                {task.steps.length ? task.steps.map((step, index) => <StepRow key={`${step.name}-${index}`} step={step} />) : (
                  <p className="text-sm text-muted-foreground">{t('investigations.emptySteps')}</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="actions" className="min-h-0 overflow-y-auto pr-2">
              <div className="space-y-3 pb-4">
                {data?.actions.length ? data.actions.map((action) => <ActionRow key={action.id} action={action} />) : (
                  <p className="text-sm text-muted-foreground">{t('investigations.emptyActionHistory')}</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="raw" className="min-h-0 overflow-y-auto pr-2">
              <JsonBlock value={data} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('common.noData')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function InvestigationCreateDialog({
  open,
  onOpenChange,
  initialTargetId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTargetId?: string;
  onCreated: (taskId: string) => void;
}) {
  const t = useTranslations();
  const { apiRequest } = useApiRequest();
  const [type, setType] = useState<InvestigationType>('phish_analysis');
  const [targetType, setTargetType] = useState<InvestigationTargetType>('mail');
  const [targetId, setTargetId] = useState(initialTargetId ?? '');
  const [prompt, setPrompt] = useState('');

  const mutation = useMutation({
    mutationFn: (body: CreateInvestigationRequest) => createInvestigation(body, apiRequest),
    onSuccess: (result) => {
      toast.success(t('investigations.createSuccess'));
      onOpenChange(false);
      setPrompt('');
      onCreated(result.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    },
  });

  const handleSubmit = useCallback(() => {
    const parsedTargetIDs = parseInvestigationTargetIDs(targetId, targetType);
    if (parsedTargetIDs.length === 0) {
      toast.error(t('investigations.targetIdRequired'));
      return;
    }

    mutation.mutate({
      type,
      target_type: targetType,
      target_ids: parsedTargetIDs,
      prompt: prompt.trim() || undefined,
    });
  }, [mutation, prompt, t, targetId, targetType, type]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('investigations.createTitle')}</DialogTitle>
          <DialogDescription>{t('investigations.createDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('investigations.fields.agentType')}</Label>
            <Select value={type} onValueChange={(value) => setType(value as InvestigationType)}>
              <SelectTrigger className="w-full">
                <SelectValue>{t(genericAgentTypes.find(i => i.value === type)?.labelKey ?? 'investigations.types.phish_analysis')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {genericAgentTypes.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {t(genericAgentTypes.find((item) => item.value === type)?.descriptionKey || 'investigations.typeDescriptions.phish_analysis')}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t('investigations.fields.targetType')}</Label>
            <Select value={targetType} onValueChange={(value) => setTargetType(value as InvestigationTargetType)}>
              <SelectTrigger className="w-full">
                <SelectValue>{formatTargetType(targetType, t)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(['mail', 'mail_batch', 'account', 'cluster'] as InvestigationTargetType[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatTargetType(value, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-mail-log-id">{getInvestigationTargetLabel(targetType, t)}</Label>
            <Input
              id="target-mail-log-id"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              placeholder={getInvestigationTargetPlaceholder(targetType, t)}
            />
            <p className="text-xs leading-5 text-muted-foreground">{getInvestigationTargetHelp(targetType, t)}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="investigation-prompt">{t('investigations.fields.prompt')}</Label>
            <Textarea
              id="investigation-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('investigations.promptPlaceholder')}
              className="min-h-28"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {t('investigations.launch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatConfidence(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value * 100)}%`;
}

function parseInvestigationTargetIDs(value: string, targetType: InvestigationTargetType) {
  if (targetType === 'mail_batch') {
    return value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const trimmed = value.trim();
  return trimmed ? [trimmed] : [];
}

function getInvestigationTargetLabel(targetType: InvestigationTargetType, t: ReturnType<typeof useTranslations>) {
  return targetType === 'mail' ? t('investigations.fields.targetMailLogId') : t('investigations.fields.targetIds');
}

function getInvestigationTargetPlaceholder(targetType: InvestigationTargetType, t: ReturnType<typeof useTranslations>) {
  switch (targetType) {
    case 'mail_batch':
      return t('investigations.targetMailBatchPlaceholder');
    case 'account':
      return t('investigations.targetAccountPlaceholder');
    case 'cluster':
      return t('investigations.targetClusterPlaceholder');
    case 'mail':
    default:
      return t('investigations.targetMailLogPlaceholder');
  }
}

function getInvestigationTargetHelp(targetType: InvestigationTargetType, t: ReturnType<typeof useTranslations>) {
  switch (targetType) {
    case 'mail_batch':
      return t('investigations.targetMailBatchHelp');
    case 'account':
      return t('investigations.targetAccountHelp');
    case 'cluster':
      return t('investigations.targetClusterHelp');
    case 'mail':
    default:
      return t('investigations.targetMailHelp');
  }
}

function hasRelatedObjects(value?: InvestigationTask['result']['related_objects']) {
  return !!value && Object.values(value).some((item) => Array.isArray(item) ? item.length > 0 : !!item);
}

function InfoCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <Label className="text-muted-foreground">{label}</Label>
      <p className={`mt-2 break-all text-sm ${mono ? 'font-mono' : ''}`}>{value || '-'}</p>
    </div>
  );
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return <Badge variant="outline">{label}: {value}</Badge>;
}

function EvidenceRow({ item }: { item: InvestigationEvidence }) {
  const t = useTranslations();
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{formatEvidenceType(item.type, t)}</Badge>
        <Badge variant={item.severity === 'high' ? 'destructive' : item.severity === 'medium' ? 'default' : 'secondary'}>
          {formatSeverity(item.severity, t)}
        </Badge>
      </div>
      <div className="mt-2 font-medium">{item.title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
      {item.data && Object.keys(item.data).length > 0 ? <div className="mt-3"><JsonBlock value={item.data} /></div> : null}
    </div>
  );
}

function RecommendedActionRow({ item }: { item: InvestigationRecommendedAction }) {
  const t = useTranslations();
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{formatActionType(item.type, t)}</Badge>
        {item.scope ? <Badge variant="outline">{formatActionScope(item.scope, t)}</Badge> : null}
        {item.target_count ? <Badge variant="secondary">{t('investigations.labels.targetCount', { count: item.target_count })}</Badge> : null}
      </div>
      {item.reason ? <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p> : null}
      {item.data && Object.keys(item.data).length > 0 ? <div className="mt-3"><JsonBlock value={item.data} /></div> : null}
    </div>
  );
}

function FailureReasonBadge({ item }: { item: Record<string, unknown> }) {
  const label = readString(item.label);
  const count = readNumber(item.count);
  if (!label) {
    return null;
  }
  return <Badge variant="outline">{label}: {typeof count === 'number' ? String(count) : '0'}</Badge>;
}

function StepRow({ step }: { step: InvestigationStep }) {
  const t = useTranslations();
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{formatStepName(step.name, t)}</Badge>
        <Badge variant={step.status === 'completed' ? 'default' : step.status === 'skipped' ? 'secondary' : 'outline'}>
          {formatStepStatus(step.status, t)}
        </Badge>
      </div>
      {step.message ? <p className="mt-2 text-sm text-muted-foreground">{step.message}</p> : null}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {step.started_at ? <span>{t('investigations.labels.startedAt')}: {formatDate(step.started_at)}</span> : null}
        {step.finished_at ? <span>{t('investigations.labels.finishedAt')}: {formatDate(step.finished_at)}</span> : null}
      </div>
      {step.data && Object.keys(step.data).length > 0 ? <div className="mt-3"><JsonBlock value={step.data} /></div> : null}
    </div>
  );
}

function RelatedObjectsSection({
  value,
  empty,
  onOpenMailLog,
}: {
  value?: InvestigationRelatedObjects;
  empty: string;
  onOpenMailLog?: (mailLogId: string) => void;
}) {
  const t = useTranslations();

  if (!hasRelatedObjects(value)) {
    return <DetailList title={t('investigations.sections.relatedObjects')} empty={empty}>{[]}</DetailList>;
  }

  const mailLogIDs = Array.isArray(value?.mail_log_ids) ? value.mail_log_ids : [];
  const domains = Array.isArray(value?.domains) ? value.domains : [];
  const urls = Array.isArray(value?.urls) ? value.urls : [];
  const attachments = Array.isArray(value?.attachments) ? value.attachments : [];
  const accounts = Array.isArray(value?.accounts) ? value.accounts : [];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{t('investigations.sections.relatedObjects')}</h3>
      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-3">
        {mailLogIDs.length > 0 ? (
          <RelatedObjectGroup label={t('investigations.relatedObjectLabels.mailLogIds')}>
            {mailLogIDs.map((item) => {
              const mailLogId = String(item);
              return (
                <button
                  key={mailLogId}
                  type="button"
                  onClick={() => onOpenMailLog?.(mailLogId)}
                  className="rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                >
                  #{mailLogId}
                </button>
              );
            })}
          </RelatedObjectGroup>
        ) : null}

        {domains.length > 0 ? (
          <RelatedObjectGroup label={t('investigations.relatedObjectLabels.domains')}>
            {domains.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}
          </RelatedObjectGroup>
        ) : null}

        {urls.length > 0 ? (
          <RelatedObjectGroup label={t('investigations.relatedObjectLabels.urls')}>
            {urls.map((item) => <RelatedURLLink key={item} url={item} />)}
          </RelatedObjectGroup>
        ) : null}

        {attachments.length > 0 ? (
          <RelatedObjectGroup label={t('investigations.relatedObjectLabels.attachments')}>
            {attachments.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
          </RelatedObjectGroup>
        ) : null}

        {accounts.length > 0 ? (
          <RelatedObjectGroup label={t('investigations.relatedObjectLabels.accounts')}>
            {accounts.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}
          </RelatedObjectGroup>
        ) : null}
      </div>
    </div>
  );
}

function RelatedObjectGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function RelatedURLLink({ url }: { url: string }) {
  const normalized = normalizeExternalURL(url);

  if (!normalized) {
    return <span className="font-mono text-xs break-all text-muted-foreground">{url}</span>;
  }

  return (
    <a
      href={normalized}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs break-all text-primary underline-offset-4 hover:underline"
    >
      {url}
    </a>
  );
}

function ActionRow({ action }: { action: InvestigationAction }) {
  const t = useTranslations();
  const [requestOpen, setRequestOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const requestScope = readString(action.request.scope);
  const requestReason = readString(action.request.reason);
  const requestConfirm = readBoolean(action.request.confirm);
  const resultMatched = readNumber(action.result.matched);
  const resultEligible = readNumber(action.result.eligible);
  const resultSubmitted = readNumber(action.result.submitted);
  const resultSkipped = readNumber(action.result.skipped);
  const resultWarnings = readStringArray(action.result.warnings);
  const skippedItems = Array.isArray(action.result.skipped) ? action.result.skipped : [];

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{formatActionRecordType(action.action_type, t)}</Badge>
        <Badge variant={action.status === 'completed' ? 'default' : action.status === 'failed' ? 'destructive' : 'secondary'}>
          {formatActionRecordStatus(action.status, t)}
        </Badge>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {action.created_by || '-'} · {formatDate(action.created_at)}
      </div>
      {(requestScope || requestReason || typeof requestConfirm === 'boolean' || typeof resultMatched === 'number' || typeof resultEligible === 'number' || typeof resultSubmitted === 'number' || typeof resultSkipped === 'number' || resultWarnings.length > 0 || skippedItems.length > 0) ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-border/60 bg-background/70 p-3">
          {(requestScope || requestReason || typeof requestConfirm === 'boolean') ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('investigations.sections.actionRequestSummary')}</p>
              <div className="flex flex-wrap gap-2">
                {requestScope ? <Badge variant="outline">{t('investigations.fields.scope')}: {formatActionScope(requestScope, t)}</Badge> : null}
                {typeof requestConfirm === 'boolean' ? <Badge variant="outline">{t('investigations.fields.confirm')}: {requestConfirm ? t('common.yes') : t('common.no')}</Badge> : null}
              </div>
              {requestReason ? <p className="text-sm text-muted-foreground">{requestReason}</p> : null}
            </div>
          ) : null}

          {(typeof resultMatched === 'number' || typeof resultEligible === 'number' || typeof resultSubmitted === 'number' || typeof resultSkipped === 'number' || resultWarnings.length > 0 || skippedItems.length > 0) ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('investigations.sections.actionResultSummary')}</p>
              <div className="flex flex-wrap gap-2">
                {typeof resultMatched === 'number' ? <MetricBadge label={t('investigations.fields.matched')} value={String(resultMatched)} /> : null}
                {typeof resultEligible === 'number' ? <MetricBadge label={t('investigations.fields.eligible')} value={String(resultEligible)} /> : null}
                {typeof resultSubmitted === 'number' ? <MetricBadge label={t('investigations.fields.submitted')} value={String(resultSubmitted)} /> : null}
                {typeof resultSkipped === 'number' ? <MetricBadge label={t('investigations.fields.skipped')} value={String(resultSkipped)} /> : null}
              </div>
              {resultWarnings.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{t('investigations.fields.warnings')}</p>
                  <div className="space-y-1">
                    {resultWarnings.map((warning, index) => <p key={`${warning}-${index}`} className="text-sm text-muted-foreground">{warning}</p>)}
                  </div>
                </div>
              ) : null}
              {skippedItems.length > 0 ? <JsonBlock value={skippedItems} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Collapsible open={requestOpen} onOpenChange={setRequestOpen}>
          <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
            <CollapsibleTrigger className="flex w-full items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronRight className={`h-4 w-4 transition-transform ${requestOpen ? 'rotate-90' : ''}`} />
              {t('investigations.labels.rawRequest')}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2">
                <JsonBlock value={action.request} />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
        <Collapsible open={resultOpen} onOpenChange={setResultOpen}>
          <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
            <CollapsibleTrigger className="flex w-full items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronRight className={`h-4 w-4 transition-transform ${resultOpen ? 'rotate-90' : ''}`} />
              {t('investigations.labels.rawResult')}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2">
                <JsonBlock value={action.result} />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>
      {action.error_message ? <p className="mt-3 text-sm text-destructive">{action.error_message}</p> : null}
    </div>
  );
}

function URLFindingRow({ item, emphasized = false }: { item: Record<string, unknown>; emphasized?: boolean }) {
  const t = useTranslations();
  const url = readString(item.url);
  const verdict = readString(item.verdict);
  const riskLevel = readString(item.risk_level);
  const rationale = readString(item.rationale);
  const usedFetch = item.used_fetch === true;

  return (
    <div className={`rounded-2xl border p-3 ${emphasized ? 'border-violet-300/60 bg-violet-500/5' : 'border-border/60 bg-background/70'}`}>
      <div className="flex flex-wrap items-start gap-2">
        <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="font-mono text-xs break-all">{url || '-'}</div>
          <div className="flex flex-wrap items-center gap-2">
            {verdict ? <Badge variant={verdict === 'phishing_suspected' ? 'destructive' : verdict === 'suspicious' ? 'default' : 'outline'}>{verdict}</Badge> : null}
            {riskLevel ? <Badge variant={riskBadgeVariant(riskLevel as InvestigationRiskLevel)}>{riskLevel}</Badge> : null}
            {usedFetch ? <Badge variant="secondary">{t('investigations.labels.fetch')}</Badge> : null}
          </div>
          {rationale ? <p className="text-sm text-muted-foreground">{rationale}</p> : null}
        </div>
      </div>
    </div>
  );
}

function FetchedURLRow({ item }: { item: Record<string, unknown> }) {
  const t = useTranslations();
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
      <div className="space-y-2">
        <div className="font-mono text-xs break-all">{readString(item.url) || '-'}</div>
        <div className="flex flex-wrap items-center gap-2">
          {readString(item.outcome) ? <Badge>{readString(item.outcome)}</Badge> : null}
          {readString(item.title) ? <Badge variant="outline">{readString(item.title)}</Badge> : null}
        </div>
        {readString(item.final_url) ? <p className="text-xs text-muted-foreground break-all">{t('investigations.labels.finalUrl')}: {readString(item.final_url)}</p> : null}
        {readString(item.inconclusive_reason) ? <p className="text-sm text-muted-foreground">{readString(item.inconclusive_reason)}</p> : null}
      </div>
    </div>
  );
}

function SkippedURLRow({ item }: { item: Record<string, unknown> }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
      <div className="font-mono text-xs break-all">{readString(item.url) || '-'}</div>
      {readString(item.reason) ? <p className="mt-2 text-sm text-muted-foreground">{readString(item.reason)}</p> : null}
    </div>
  );
}

function RankedURLRow({ item }: { item: Record<string, unknown> }) {
  const t = useTranslations();
  const url = readString(item.input_url) || readString(item.normalized_url);
  const host = readString(item.host);
  const riskScore = readNumber(item.url_risk_score);
  const riskLevel = readString(item.url_risk_level);
  const trusted = item.trusted_domain_match === true;
  const matchedTrustedDomain = readString(item.matched_trusted_domain);
  const indicators = readStringArray(item.suspicious_indicators);

  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
      <div className="space-y-2">
        <div className="font-mono text-xs break-all">{url || '-'}</div>
        <div className="flex flex-wrap items-center gap-2">
          {host ? <Badge variant="outline">{host}</Badge> : null}
          {typeof riskScore === 'number' ? <Badge>{formatMetricNumber(riskScore)}</Badge> : null}
          {riskLevel ? <Badge variant={riskBadgeVariant(riskLevel as InvestigationRiskLevel)}>{riskLevel}</Badge> : null}
          {trusted ? <Badge variant="secondary">{t('investigations.labels.trusted')}</Badge> : null}
        </div>
        {matchedTrustedDomain ? <p className="text-xs text-muted-foreground break-all">{t('investigations.labels.allowlist')}: {matchedTrustedDomain}</p> : null}
        {indicators.length > 0 ? <p className="text-sm text-muted-foreground">{indicators.join(', ')}</p> : null}
      </div>
    </div>
  );
}

function CandidateRuleRow({
  item,
  rules,
  returnTaskId,
  returnMailLogId,
}: {
  item: Record<string, unknown>;
  rules: Rule[];
  returnTaskId?: string;
  returnMailLogId?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [requestOpen, setRequestOpen] = useState(false);
  const type = readString(item.type);
  const pattern = readString(item.pattern);
  const matchedMessages = readNumber(item.matched_messages);
  const reason = readString(item.reason);
  const field = readString(item.field);
  const operator = readString(item.operator);
  const stage = readString(item.stage);
  const action = readString(item.action);
  const priority = readNumber(item.priority);
  const name = readString(item.name);
  const description = readString(item.description);
  const conditionTree = readRuleNode(item.condition_tree);
  const createRuleRequest = readObject(item.create_rule_request);
  const requestRuleClass = readString(createRuleRequest.rule_class);
  const requestStage = readString(createRuleRequest.stage);
  const requestAction = readString(createRuleRequest.action);
  const requestPriority = readNumber(createRuleRequest.priority);
  const requestActive = readBoolean(createRuleRequest.is_active);
  const matchResult = findMatchingRule(createRuleRequest, rules);
  const matchedRule = matchResult.matchedRule;

  const handleOpenRuleBuilder = () => {
    if (!stage || Object.keys(createRuleRequest).length === 0) {
      return;
    }

    if (matchedRule) {
      const params = new URLSearchParams({ edit_rule_id: String(matchedRule.id) });
      if (returnTaskId) {
        params.set('return_task_id', returnTaskId);
      }
      if (returnMailLogId) {
        params.set('return_mail_log_id', returnMailLogId);
      }
      router.push(`/${locale}/rules/${stage}?${params.toString()}`);
      return;
    }

    const prefillKey = createRulePrefillKey();
    const stored = storeRulePrefill(prefillKey, createRuleRequest as unknown as CreateRuleRequest);
    const params = new URLSearchParams(stored
      ? { prefill_key: prefillKey }
      : { prefill_rule: JSON.stringify(createRuleRequest) });
    if (returnTaskId) {
      params.set('return_task_id', returnTaskId);
    }
    if (returnMailLogId) {
      params.set('return_mail_log_id', returnMailLogId);
    }
    router.push(`/${locale}/rules/${stage}?${params.toString()}`);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {type ? <Badge>{formatCandidateRuleType(type, t)}</Badge> : null}
          {typeof matchedMessages === 'number' ? <Badge variant="outline">{t('investigations.labels.hitCount', { count: matchedMessages })}</Badge> : null}
          {matchedRule ? <Badge variant="secondary">{t('investigations.labels.ruleAlreadyCreated')}</Badge> : null}
          {!matchedRule && matchResult.similarRuleCount > 0 ? <Badge variant="outline">{t('investigations.labels.similarRulesFound', { count: matchResult.similarRuleCount })}</Badge> : null}
        </div>
        {(field || operator || stage || action || typeof priority === 'number') ? (
          <CandidateRuleSchemaSummary
            field={field}
            operator={operator}
            stage={stage}
            action={action}
            priority={priority}
          />
        ) : null}
        {matchedRule ? <MatchedRuleSummary rule={matchedRule} /> : null}
        {!matchedRule && matchResult.similarRuleCount > 0 ? <SimilarRuleHint count={matchResult.similarRuleCount} /> : null}
        {conditionTree ? <ConditionTreeSummary tree={conditionTree} /> : null}
        {name ? <div className="text-sm font-medium break-all">{name}</div> : null}
        {pattern ? <div className="font-mono text-xs break-all">{pattern}</div> : null}
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
        {stage && Object.keys(createRuleRequest).length > 0 ? (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={handleOpenRuleBuilder}>
              {matchedRule ? t('investigations.labels.openMatchingRule') : t('investigations.labels.openRuleBuilder')}
            </Button>
          </div>
        ) : null}

        {Object.keys(createRuleRequest).length > 0 ? (
          <Collapsible open={requestOpen} onOpenChange={setRequestOpen}>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
              <CollapsibleTrigger className="flex w-full items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight className={`h-4 w-4 transition-transform ${requestOpen ? 'rotate-90' : ''}`} />
                {t('investigations.labels.prefilledRuleRequest')}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 space-y-3">
                  {(requestRuleClass || requestStage || requestAction || typeof requestPriority === 'number' || typeof requestActive === 'boolean') ? (
                    <div className="flex flex-wrap gap-2">
                      {requestRuleClass ? <Badge variant="outline">{t('investigations.fields.ruleClass')}: {formatRuleClass(requestRuleClass, t)}</Badge> : null}
                      {requestStage ? <Badge variant="outline">{t('rules.stage')}: {formatRuleStage(requestStage, t)}</Badge> : null}
                      {requestAction ? <Badge variant="outline">{t('rules.action')}: {formatRuleAction(requestAction, t)}</Badge> : null}
                      {typeof requestPriority === 'number' ? <Badge variant="outline">{t('rules.priority')}: {String(requestPriority)}</Badge> : null}
                      {typeof requestActive === 'boolean' ? <Badge variant="outline">{t('investigations.fields.isActive')}: {requestActive ? t('common.yes') : t('common.no')}</Badge> : null}
                    </div>
                  ) : null}
                  <JsonBlock value={createRuleRequest} />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ) : null}
      </div>
    </div>
  );
}

function CandidateRuleAnalysisRow({
  item,
  rules,
  returnTaskId,
  returnMailLogId,
}: {
  item: Record<string, unknown>;
  rules: Rule[];
  returnTaskId?: string;
  returnMailLogId?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const type = readString(item.type);
  const pattern = readString(item.pattern);
  const field = readString(item.field);
  const operator = readString(item.operator);
  const stage = readString(item.stage);
  const action = readString(item.action);
  const conditionTree = readRuleNode(item.condition_tree);
  const createRuleRequest = readObject(item.create_rule_request);
  const matchedTotal = readNumber(item.matched_total);
  const deliveredTotal = readNumber(item.delivered_total);
  const blockedTotal = readNumber(item.blocked_total);
  const recommended = item.recommended === true;
  const reason = readString(item.reason);
  const dailyCounts = Array.isArray(item.daily_counts) ? item.daily_counts : [];
  const lastMatchedAt = readString(item.last_matched_at);
  const actionCounts = readObjectEntries(item.action_counts);
  const matchResult = findMatchingRule(createRuleRequest, rules);
  const matchedRule = matchResult.matchedRule;

  const handleOpenRuleBuilder = () => {
    if (!stage || Object.keys(createRuleRequest).length === 0) {
      return;
    }

    if (matchedRule) {
      const params = new URLSearchParams({ edit_rule_id: String(matchedRule.id) });
      if (returnTaskId) {
        params.set('return_task_id', returnTaskId);
      }
      if (returnMailLogId) {
        params.set('return_mail_log_id', returnMailLogId);
      }
      router.push(`/${locale}/rules/${stage}?${params.toString()}`);
      return;
    }

    const prefillKey = createRulePrefillKey();
    const stored = storeRulePrefill(prefillKey, createRuleRequest as unknown as CreateRuleRequest);
    const params = new URLSearchParams(stored
      ? { prefill_key: prefillKey }
      : { prefill_rule: JSON.stringify(createRuleRequest) });
    if (returnTaskId) {
      params.set('return_task_id', returnTaskId);
    }
    if (returnMailLogId) {
      params.set('return_mail_log_id', returnMailLogId);
    }
    router.push(`/${locale}/rules/${stage}?${params.toString()}`);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {type ? <Badge>{formatCandidateRuleType(type, t)}</Badge> : null}
          {typeof matchedTotal === 'number' ? <Badge variant="outline">{t('investigations.labels.hitCount', { count: matchedTotal })}</Badge> : null}
          {typeof deliveredTotal === 'number' ? <Badge variant="secondary">{t('investigations.labels.deliveredCount', { count: deliveredTotal })}</Badge> : null}
          {typeof blockedTotal === 'number' ? <Badge variant="secondary">{t('investigations.labels.blockedCount', { count: blockedTotal })}</Badge> : null}
          <Badge variant={recommended ? 'default' : 'secondary'}>{recommended ? t('investigations.labels.recommended') : t('investigations.labels.watch')}</Badge>
          {matchedRule ? <Badge variant="secondary">{t('investigations.labels.ruleAlreadyCreated')}</Badge> : null}
          {!matchedRule && matchResult.similarRuleCount > 0 ? <Badge variant="outline">{t('investigations.labels.similarRulesFound', { count: matchResult.similarRuleCount })}</Badge> : null}
        </div>
        {(field || operator || stage || action) ? (
          <CandidateRuleSchemaSummary
            field={field}
            operator={operator}
            stage={stage}
            action={action}
          />
        ) : null}
        {matchedRule ? <MatchedRuleSummary rule={matchedRule} /> : null}
        {!matchedRule && matchResult.similarRuleCount > 0 ? <SimilarRuleHint count={matchResult.similarRuleCount} /> : null}
        {conditionTree ? <ConditionTreeSummary tree={conditionTree} /> : null}
        {pattern ? <div className="font-mono text-xs break-all">{pattern}</div> : null}
        {reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
        {stage && Object.keys(createRuleRequest).length > 0 ? (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={handleOpenRuleBuilder}>
              {matchedRule ? t('investigations.labels.openMatchingRule') : t('investigations.labels.openRuleBuilder')}
            </Button>
          </div>
        ) : null}
        {actionCounts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actionCounts.map(([key, value]) => <Badge key={key} variant="outline">{formatMailAction(key, t)}: {String(value)}</Badge>)}
          </div>
        ) : null}
        {dailyCounts.length > 0 ? <DailyCountSummary items={dailyCounts} /> : null}
        {lastMatchedAt ? <p className="text-xs text-muted-foreground">{t('investigations.labels.lastMatch')}: {formatDate(lastMatchedAt)}</p> : null}
      </div>
    </div>
  );
}

function CandidateRuleSchemaSummary({
  field,
  operator,
  stage,
  action,
  priority,
}: {
  field?: string;
  operator?: string;
  stage?: string;
  action?: string;
  priority?: number;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap gap-2">
      {field ? <Badge variant="outline">{t('tagRules.field')}: {formatRuleField(field, t)}</Badge> : null}
      {operator ? <Badge variant="outline">{t('tagRules.operator')}: {formatRuleOperator(operator, t)}</Badge> : null}
      {stage ? <Badge variant="outline">{t('rules.stage')}: {formatRuleStage(stage, t)}</Badge> : null}
      {action ? <Badge variant="outline">{t('rules.action')}: {formatRuleAction(action, t)}</Badge> : null}
      {typeof priority === 'number' ? <Badge variant="outline">{t('rules.priority')}: {String(priority)}</Badge> : null}
    </div>
  );
}

function MatchedRuleSummary({ rule }: { rule: Rule }) {
  const t = useTranslations();

  return (
    <div className="space-y-2 rounded-2xl border border-emerald-300/40 bg-emerald-500/5 p-3">
      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{t('investigations.labels.matchedRule')}</p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{t('common.id')}: {String(rule.id)}</Badge>
        <Badge variant="outline">{t('advancedRules.name')}: {rule.name}</Badge>
        <Badge variant="outline">{t('investigations.fields.updatedAt')}: {formatDate(rule.updated_at)}</Badge>
        <Badge variant="outline">{rule.is_active ? t('common.enabled') : t('common.disabled')}</Badge>
      </div>
      {rule.description ? <p className="text-sm text-muted-foreground">{rule.description}</p> : null}
    </div>
  );
}

function SimilarRuleHint({ count }: { count: number }) {
  const t = useTranslations();

  return (
    <div className="rounded-2xl border border-amber-300/40 bg-amber-500/5 p-3">
      <p className="text-sm text-muted-foreground">{t('investigations.labels.similarRuleHint', { count })}</p>
    </div>
  );
}

function ConditionTreeSummary({ tree }: { tree: RuleNode }) {
  const t = useTranslations();
  const summary = formatConditionNodeSummary(tree, t);

  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{t('advancedRules.conditionTree')}</p>
      <p className="text-sm text-foreground break-words">{summary}</p>
    </div>
  );
}

function SimilarMessageRow({ item, emphasized = false, onOpenMailLog }: { item: Record<string, unknown>; emphasized?: boolean; onOpenMailLog?: (mailLogId: string) => void }) {
  const t = useTranslations();
  const mailLogID = readString(item.mail_log_id) || String(readNumber(item.mail_log_id) ?? '');
  const score = readNumber(item.score);
  const sender = readString(item.sender);
  const subject = readString(item.subject);
  const action = readString(item.action);
  const status = readString(item.status);
  const cacTid = readString(item.cac_tid);
  const receivedAt = readString(item.received_at);
  const matchReasons = readStringArray(item.match_reasons);
  const sharedURLHosts = readStringArray(item.shared_url_hosts);

  const clickable = !!mailLogID && !!onOpenMailLog;

  return (
    <button
      type="button"
      onClick={() => {
        if (clickable) {
          onOpenMailLog(mailLogID);
        }
      }}
      className={`w-full rounded-2xl border p-3 text-left ${emphasized ? 'border-violet-300/60 bg-violet-500/5' : 'border-border/60 bg-background/70'} ${clickable ? 'transition-colors hover:bg-muted/40' : ''}`}
      disabled={!clickable}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {mailLogID ? <Badge variant="outline">#{mailLogID}</Badge> : null}
          {typeof score === 'number' ? <Badge>{formatMetricNumber(score)}</Badge> : null}
          {action ? <Badge variant={isBlockingActionValue(action) ? 'destructive' : 'secondary'}>{formatMailAction(action, t)}</Badge> : null}
          {status ? <Badge variant="outline">{formatMailStatus(status, t)}</Badge> : null}
          {cacTid ? <Badge variant="secondary">{t('investigations.labels.cacTid')}: {cacTid}</Badge> : null}
        </div>
        {sender ? <div className="text-sm break-all">{sender}</div> : null}
        {subject ? <div className="text-sm text-muted-foreground break-all">{subject}</div> : null}
        {matchReasons.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {matchReasons.map((reason) => <Badge key={reason} variant="outline">{formatSimilarityReason(reason, t)}</Badge>)}
          </div>
        ) : null}
        {sharedURLHosts.length > 0 ? <p className="text-xs text-muted-foreground">{t('investigations.labels.hosts')}: {sharedURLHosts.join(', ')}</p> : null}
        {receivedAt ? <p className="text-xs text-muted-foreground">{t('investigations.labels.received')}: {formatDate(receivedAt)}</p> : null}
        {clickable ? <p className="text-xs font-medium text-primary">{t('investigations.labels.openMailDetail')}</p> : null}
      </div>
    </button>
  );
}

function formatSimilarityReason(reason: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.similarityReasons.${reason}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return reason.replaceAll('_', ' ');
}

function formatSearchMethod(method: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.searchMethodLabels.${method}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return method.replaceAll('_', ' ');
}

function formatStepName(name: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.stepNames.${name}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return name.replaceAll('_', ' ');
}

function formatEvidenceType(type: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.evidenceTypes.${type}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return type.replaceAll('_', ' ');
}

function formatActionType(type: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.actionTypes.${type}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return type.replaceAll('_', ' ');
}

function formatActionRecordType(type: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.actionRecordTypes.${type}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return formatActionType(type, t);
}

function formatActionRecordStatus(status: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.actionRecordStatuses.${status}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return status.replaceAll('_', ' ');
}

function formatActionScope(scope: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.actionScopes.${scope}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return scope.replaceAll('_', ' ');
}

function formatSeverity(severity: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.severities.${severity}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return severity.replaceAll('_', ' ');
}

function formatStepStatus(status: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.stepStatuses.${status}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return status.replaceAll('_', ' ');
}

function formatTargetType(type: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.targetTypes.${type}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return type.replaceAll('_', ' ');
}

function formatTargetResolutionMethod(value: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.targetResolution.${value}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return value.replaceAll('_', ' ');
}

function formatCandidateRuleType(ruleType: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.ruleTypes.${ruleType}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return ruleType.replaceAll('_', ' ');
}

function formatRuleField(field: string, t: ReturnType<typeof useTranslations>) {
  const key = `advancedRules.fields.${toRuleFieldTranslationKey(field)}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return field.replaceAll('_', ' ');
}

function formatRuleOperator(operator: string, t: ReturnType<typeof useTranslations>) {
  const key = `advancedRules.operators.${toRuleOperatorTranslationKey(operator)}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return operator.replaceAll('_', ' ');
}

function formatRuleStage(stage: string, t: ReturnType<typeof useTranslations>) {
  const key = `sidebar.${toRuleStageTranslationKey(stage)}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return stage.replaceAll('_', ' ');
}

function formatRuleAction(action: string, t: ReturnType<typeof useTranslations>) {
  const key = `rules.${action}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return formatMailAction(action, t);
}

function formatConditionNodeSummary(node: RuleNode, t: ReturnType<typeof useTranslations>): string {
  if (node.type === 'condition') {
    const field = node.field ? formatRuleField(node.field, t) : '';
    const operator = node.operator ? formatRuleOperator(node.operator, t) : '';
    const value = typeof node.value === 'string' ? node.value : '';
    const parts = [field, operator, value].filter(Boolean);
    return parts.join(' ');
  }

  if (node.type === 'NOT' && node.children?.[0]) {
    const child = formatConditionNodeSummary(node.children[0], t);
    return child ? `NOT (${child})` : '';
  }

  if ((node.type === 'AND' || node.type === 'OR') && Array.isArray(node.children) && node.children.length > 0) {
    const rendered = node.children
      .map((child) => formatConditionNodeSummary(child, t))
      .filter(Boolean);
    if (rendered.length === 0) {
      return '';
    }
    return rendered.length === 1 ? rendered[0] : `(${rendered.join(` ${node.type} `)})`;
  }

  return '';
}

function formatRuleClass(ruleClass: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.ruleClasses.${ruleClass}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return ruleClass.replaceAll('_', ' ');
}

function formatMailAction(action: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.mailActions.${action}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return action.replaceAll('_', ' ');
}

function formatMailStatus(status: string, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.mailStatuses.${status}`;
  const translated = t.has(key) ? t(key) : '';
  if (translated) {
    return translated;
  }
  return status.replaceAll('_', ' ');
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined;
}

function readNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[];
  }
  return value.filter((item): item is number => typeof item === 'number');
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function readObjectEntries(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [] as Array<[string, string | number | boolean]>;
  }
  return Object.entries(value).filter((entry): entry is [string, string | number | boolean] => {
    const item = entry[1];
    return typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean';
  });
}

function sortCountEntries(entries: Array<[string, string | number | boolean]>) {
  return [...entries].sort((left, right) => {
    const leftValue = typeof left[1] === 'number' ? left[1] : Number(left[1]) || 0;
    const rightValue = typeof right[1] === 'number' ? right[1] : Number(right[1]) || 0;
    if (leftValue === rightValue) {
      return left[0].localeCompare(right[0]);
    }
    return rightValue - leftValue;
  });
}

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function readRuleNode(value: unknown): RuleNode | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const node = value as Record<string, unknown>;
  if (typeof node.type !== 'string') {
    return undefined;
  }
  return node as unknown as RuleNode;
}

function findMatchingRule(value: Record<string, unknown>, rules: Rule[]) {
  if (rules.length === 0) {
    return { matchedRule: undefined, similarRuleCount: 0 };
  }

  const request = value as Partial<CreateRuleRequest>;
  if (!request.stage || !request.condition_tree) {
    return { matchedRule: undefined, similarRuleCount: 0 };
  }

  const normalizedRequestTree = normalizeComparableValue(request.condition_tree);
  const normalizedRequestMetadata = typeof request.metadata === 'undefined'
    ? undefined
    : normalizeComparableValue(request.metadata);
  const structuralMatches = rules.filter((rule) => {
    if (rule.stage !== request.stage) {
      return false;
    }

    if ((request.rule_class || 'action') !== rule.rule_class) {
      return false;
    }

    if (request.action && request.action !== rule.action) {
      return false;
    }

    const ruleTree = parseJSONRecord(rule.condition_tree);
    if (!ruleTree || normalizeComparableValue(ruleTree) !== normalizedRequestTree) {
      return false;
    }

    if (typeof normalizedRequestMetadata !== 'undefined') {
      const ruleMetadata = rule.metadata ? parseJSONRecord(rule.metadata) : null;
      if (normalizeComparableValue(ruleMetadata) !== normalizedRequestMetadata) {
        return false;
      }
    }

    return true;
  });

  let matches = structuralMatches;

  if (matches.length <= 1) {
    return { matchedRule: matches[0], similarRuleCount: 0 };
  }

  if (typeof request.priority === 'number') {
    const priorityMatches = matches.filter((rule) => rule.priority === request.priority);
    if (priorityMatches.length === 1) {
      return { matchedRule: priorityMatches[0], similarRuleCount: 0 };
    }
    if (priorityMatches.length > 1) {
      matches = priorityMatches;
    }
  }

  const normalizedRequestName = normalizeComparableString(request.name);
  if (normalizedRequestName) {
    const nameMatches = matches.filter((rule) => normalizeComparableString(rule.name) === normalizedRequestName);
    if (nameMatches.length === 1) {
      return { matchedRule: nameMatches[0], similarRuleCount: 0 };
    }
    if (nameMatches.length > 1) {
      matches = nameMatches;
    }
  }

  const normalizedRequestDescription = normalizeComparableString(request.description);
  if (normalizedRequestDescription) {
    const descriptionMatches = matches.filter((rule) => normalizeComparableString(rule.description) === normalizedRequestDescription);
    if (descriptionMatches.length === 1) {
      return { matchedRule: descriptionMatches[0], similarRuleCount: 0 };
    }
    if (descriptionMatches.length > 1) {
      matches = descriptionMatches;
    }
  }

  if (typeof request.is_active === 'boolean') {
    const activeMatches = matches.filter((rule) => rule.is_active === request.is_active);
    if (activeMatches.length === 1) {
      return { matchedRule: activeMatches[0], similarRuleCount: 0 };
    }
    if (activeMatches.length > 1) {
      matches = activeMatches;
    }
  }

  return {
    matchedRule: matches.length === 1 ? matches[0] : undefined,
    similarRuleCount: matches.length === 1 ? 0 : structuralMatches.length,
  };
}

function parseJSONRecord(value: unknown) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function normalizeComparableValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => normalizeComparableValue(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${normalizeComparableValue(item)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value ?? null);
}

function normalizeComparableString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isBlockingActionValue(action: string) {
  return action === 'reject' || action === 'quarantine' || action === 'sideline';
}

function normalizeExternalURL(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function toRuleFieldTranslationKey(field: string) {
  switch (field) {
    case 'client_ip':
      return 'clientIp';
    case 'text_body':
      return 'textBody';
    case 'html_body':
      return 'htmlBody';
    case 'message_id':
      return 'messageId';
    case 'attachment_names':
      return 'attachmentNames';
    case 'attachment_types':
      return 'attachmentTypes';
    case 'auth_user':
      return 'authUser';
    case 'email_size':
      return 'emailSize';
    case 'attachment_count':
      return 'attachmentCount';
    case 'spf_valid':
      return 'spfValid';
    case 'dkim_valid':
      return 'dkimValid';
    case 'dmarc_valid':
      return 'dmarcValid';
    case 'ptr_valid':
      return 'ptrValid';
    case 'ptr_domain':
      return 'ptrDomain';
    case 'cac_rules':
      return 'cacRules';
    case 'cac_result_code':
      return 'cacResultCode';
    case 'cac_tag':
      return 'cacTag';
    case 'cac_int_tag':
      return 'cacIntTag';
    case 'cac_tid':
      return 'cacTid';
    case 'cac_description':
      return 'cacDescription';
    case 'cac_prob':
      return 'cacProb';
    case 'cac_suspicious_urls':
      return 'cacSuspiciousUrls';
    case 'cac_repeat_count':
      return 'cacRepeatCount';
    case 'is_outbound':
      return 'isOutbound';
    default:
      return field;
  }
}

function toRuleOperatorTranslationKey(operator: string) {
  switch (operator) {
    case 'eq':
      return 'equal';
    case 'ne':
      return 'notEqual';
    case 'gt':
      return 'greaterThan';
    case 'lt':
      return 'lessThan';
    case 'ge':
      return 'greaterEqual';
    case 'le':
      return 'lessEqual';
    case 'not_contain':
      return 'notContain';
    default:
      return operator;
  }
}

function toRuleStageTranslationKey(stage: string) {
  switch (stage) {
    case 'onconnect':
      return 'stageOnconnect';
    case 'mail':
      return 'stageMail';
    case 'rcpt':
      return 'stageRcpt';
    case 'header':
      return 'stageHeader';
    case 'data':
      return 'stageData';
    default:
      return stage;
  }
}

function DailyCountSummary({ items }: { items: unknown[] }) {
  const t = useTranslations();
  const normalized = items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({ date: readString(item.date), count: readNumber(item.count) }))
    .filter((item): item is { date: string; count: number } => !!item.date && typeof item.count === 'number');

  if (normalized.length === 0) {
    return null;
  }

  const maxCount = Math.max(...normalized.map((item) => item.count), 1);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t('investigations.labels.dailyTrend')}</p>
      <div className="space-y-1.5">
        {normalized.map((item) => (
          <div key={item.date} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">{item.date.slice(5)}</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }}
              />
            </div>
            <span className="text-right text-muted-foreground">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMetricNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
