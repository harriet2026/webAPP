'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { deliveryStatusLabel, workflowOutcomeLabel } from './status-labels';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InvestigationCreateDialog, InvestigationDetailDialog } from '@/components/investigations/investigation-dialogs';
import { getInvestigations } from '@/lib/api/investigations';
import { useApiRequest } from '@/lib/api/client';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { getEmailLog, getEmailLogEvents } from '@/lib/api/logs';
import { formatDate } from '@/lib/utils';
import { ArrowUpRight, CheckCircle, Sparkles, XCircle, Paperclip, Link as LinkIcon, Loader2, Shield, Truck, Clock, AlertTriangle } from 'lucide-react';
import type { InvestigationStatus, InvestigationTask } from '@/types/investigation';
import type { DeliveryRecipientSummary } from '@/types/log';
import { actionToVariant, actionExtraClass, actionLabel, summarizeFinalActions } from '@/lib/email-log-action';
import { cn } from '@/lib/utils';
import { EmailAIInterpretDrawer } from '@/components/logs/email-ai-interpret-drawer';

function parseDeliveryRecipientsSummary(value: DeliveryRecipientSummary[] | string | undefined): DeliveryRecipientSummary[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '' || value.trim() === '{}') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return Object.values(parsed) as DeliveryRecipientSummary[];
    return [];
  } catch {
    return [];
  }
}

interface EmailDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailId: number | null;
}

export function EmailDetailModal({ open, onOpenChange, emailId }: EmailDetailModalProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { features } = useAuth();
  const { capabilities } = useProductForm();
  const aiOk = (capabilities?.ai ?? false) && features.aiInterpret;
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const { data: email, isLoading } = useQuery({
    queryKey: ['email-log', emailId],
    queryFn: () => getEmailLog(emailId!),
    enabled: !!emailId,
  });

  const { data: deliveryEvents, isLoading: deliveryEventsLoading } = useQuery({
    queryKey: ['email-log-events', emailId],
    queryFn: () => getEmailLogEvents(emailId!),
    enabled: open && !!emailId,
  });

  const { data: recentInvestigations, isLoading: investigationsLoading, isFetching: investigationsFetching } = useQuery({
    queryKey: ['investigations', 'mail-log', emailId],
    queryFn: () => getInvestigations({ page: 1, limit: 5, target_id: String(emailId) }, apiRequest),
    enabled: open && !!emailId,
    refetchInterval: (query) => {
      const items = (query.state.data as { items?: InvestigationTask[] } | undefined)?.items ?? [];
      return items.some((item) => isActiveTask(item.status)) ? 5000 : false;
    },
  });

  const latestInvestigationTaskId = recentInvestigations?.items?.[0]?.id;

  const handleCreated = useCallback((taskId: string) => {
    queryClient.invalidateQueries({ queryKey: ['investigations'] });
    setSelectedTaskId(taskId);
    setDetailOpen(true);
  }, [queryClient]);

  const openInvestigationPage = useCallback((taskId?: string) => {
    if (!emailId) return;
    onOpenChange(false);
    const params = new URLSearchParams({ mail_log_id: String(emailId) });
    if (taskId) {
      params.set('task_id', taskId);
    }
    router.push(`/investigations?${params.toString()}`);
  }, [emailId, onOpenChange, router]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="email-log-detail-modal" className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden p-0 sm:max-w-[96vw] lg:h-[94vh] lg:w-[92vw] lg:max-w-[92vw] 2xl:w-[88rem] 2xl:max-w-[88rem]">
          <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-5">
            <DialogTitle>{t('logs.emailDetail')}</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : email ? (
            <Tabs defaultValue="info" className="min-h-0 flex-1 px-6 py-5">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="info">{t('logs.basicInfo')}</TabsTrigger>
                <TabsTrigger value="rules" data-testid="email-log-detail-tab-rules">{t('logs.ruleMatches')}</TabsTrigger>
                <TabsTrigger value="content">{t('logs.content')}</TabsTrigger>
                <TabsTrigger value="attachments">{t('logs.attachments')}</TabsTrigger>
                <TabsTrigger value="delivery">{t('logs.delivery')}</TabsTrigger>
                <TabsTrigger value="raw">{t('logs.rawLog')}</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="min-h-0">
                <ScrollArea className="h-[calc(92vh-13rem)] pr-2">
                <div className="grid grid-cols-1 gap-4 pb-1 lg:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">{t('investigations.mailDetailTitle')}</h3>
                        <p className="text-sm text-muted-foreground">{t('investigations.mailDetailDescription')}</p>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                        <Button
                          variant="outline"
                          onClick={() => {
                            openInvestigationPage(latestInvestigationTaskId);
                          }}
                          className="w-full sm:w-auto"
                        >
                          <ArrowUpRight className="mr-2 h-4 w-4" />
                          {t('investigations.openFullPage')}
                        </Button>
                        <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
                          <Sparkles className="mr-2 h-4 w-4" />
                          {t('investigations.launch')}
                        </Button>
                        {aiOk && (
                          <Button
                            variant="outline"
                            onClick={() => setAiOpen(true)}
                            disabled={isLoading || !email}
                            className="w-full sm:w-auto"
                          >
                            <Sparkles className="mr-2 h-4 w-4" />
                            {t('logs.email.aiInterpret.button')}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t('investigations.recentForMail')}</span>
                        {investigationsFetching ? <Badge variant="outline">{t('investigations.refreshing')}</Badge> : null}
                      </div>

                      {investigationsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('common.loading')}
                        </div>
                      ) : recentInvestigations?.items.length ? (
                        <div className="space-y-2">
                          {recentInvestigations.items.map((task, index) => (
                            <div
                              key={task.id}
                              className="rounded-2xl border border-border/60 bg-background/70 p-3"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTaskId(task.id);
                                  setDetailOpen(true);
                                }}
                                className="w-full text-left transition-colors hover:bg-muted/40 rounded-xl p-0"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline">{t(`investigations.types.${task.type}`)}</Badge>
                                  {index === 0 ? <Badge>{t('investigations.latest')}</Badge> : null}
                                  <Badge variant={statusBadgeVariant(task.status)}>{t(`investigations.statuses.${task.status}`)}</Badge>
                                  {task.risk_level ? <Badge variant={riskBadgeVariant(task.risk_level)}>{t(`investigations.risks.${task.risk_level}`)}</Badge> : null}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  <span className="font-mono">{task.id}</span>
                                  <span>{formatDate(task.updated_at)}</span>
                                </div>
                                <p className="mt-2 line-clamp-2 text-sm">
                                  {task.summary || t('investigations.pendingSummary')}
                                </p>
                              </button>
                              <div className="mt-3 flex justify-end">
                                <Button variant="ghost" size="sm" onClick={() => openInvestigationPage(task.id)}>
                                  <ArrowUpRight className="mr-2 h-4 w-4" />
                                  {t('investigations.openFullInvestigation')}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('investigations.recentForMailEmpty')}</p>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <label className="text-sm text-muted-foreground">Message-ID</label>
                    <p className="mt-1 overflow-hidden font-mono text-sm break-all">{email.message_id || '-'}</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <label className="text-sm text-muted-foreground">{t('logs.timestamp')}</label>
                  <p className="mt-1 break-words">{formatDate(email.received_at || email.created_at)}</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <label className="text-sm text-muted-foreground">{t('logs.sender')}</label>
                  <p className="mt-1 break-all">{email.sender}</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <label className="text-sm text-muted-foreground">{t('logs.recipient')}</label>
                  <p className="mt-1 break-all">{email.recipients?.join(', ') || '-'}</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                  <label className="text-sm text-muted-foreground">{t('logs.subject')}</label>
                  <p className="mt-1 break-words">{email.subject || '-'}</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <label className="text-sm text-muted-foreground">{t('logs.clientIp')}</label>
                  <p className="mt-1 font-mono break-all">{email.client_ip}</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <label className="text-sm text-muted-foreground">{t('logs.action')}</label>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="email-log-detail-action">
                    {(() => {
                      const a = email.action || '';
                      if (a.toLowerCase() !== 'mixed') {
                        return (
                          <Badge variant={actionToVariant(a)} className={cn(actionExtraClass(a))}>
                            {actionLabel(a, t)}
                          </Badge>
                        );
                      }
                      const summary = summarizeFinalActions(email.final_action_rule);
                      if (summary.length === 0) {
                        return (
                          <Badge variant={actionToVariant(a)} className={cn(actionExtraClass(a))}>
                            {actionLabel(a, t)}
                          </Badge>
                        );
                      }
                      return summary.map((s) => (
                        <Badge
                          key={s.action}
                          variant={actionToVariant(s.action)}
                          className={cn(actionExtraClass(s.action))}
                        >
                          {actionLabel(s.action, t)} × {s.count}
                        </Badge>
                      ));
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <label className="text-sm text-muted-foreground shrink-0">SPF</label>
                  {email.spf_valid === 'pass' ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <label className="text-sm text-muted-foreground shrink-0">DKIM</label>
                  {email.dkim_valid === 'pass' ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                </div>
                {email.dkim_outbound_signed !== undefined && email.dkim_outbound_signed !== null && (
                  <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                    <label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5" /> {t('logs.dkimSigning.title')}
                    </label>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {email.dkim_outbound_signed ? (
                        <>
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="h-3 w-3" /> {t('logs.dkimSigning.signed')}
                          </Badge>
                          {email.dkim_outbound_selector && (
                            <span className="text-sm">
                              {t('logs.dkimSigning.selector')}: <span className="font-mono">{email.dkim_outbound_selector}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Badge variant="secondary" className="gap-1">
                            <XCircle className="h-3 w-3" /> {t('logs.dkimSigning.notSigned')}
                          </Badge>
                          {email.dkim_outbound_skip_reason && (
                            <span className="text-sm text-muted-foreground">
                              {t('logs.dkimSigning.skipReason')}: <span className="font-mono">{email.dkim_outbound_skip_reason}</span>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
                {email.final_action_rule && Object.keys(email.final_action_rule).length > 0 && (
                  <div className="mt-1 rounded-2xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                    <label className="text-sm text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5" /> {t('logs.finalActionRule')}
                    </label>
                    <div className="mt-1 space-y-1">
                      {Object.entries(email.final_action_rule).map(([rcpt, d]) => (
                        <div key={rcpt} className="flex flex-wrap items-center gap-2">
                          {rcpt && <Badge variant="secondary" className="text-xs">{rcpt}</Badge>}
                          <Badge variant="outline">#{d.rule_id}</Badge>
                          <Badge variant={actionToVariant(d.action)} className={cn(actionExtraClass(d.action))}>
                            {actionLabel(d.action, t)}
                          </Badge>
                          {d.metadata && (
                            <span className="text-sm text-muted-foreground break-all">{d.metadata}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="rules" className="min-h-0">
                <ScrollArea className="h-[calc(92vh-13rem)] pr-2">
                <div className="space-y-4 pb-1" data-testid="email-log-detail-rules">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('logs.matchedTagRules')}</label>
                  {email.matched_tag_rules && Object.keys(email.matched_tag_rules).length > 0 ? (
                    <div className="mt-1 space-y-1">
                      {Object.entries(email.matched_tag_rules).map(([stage, rcpts]) =>
                        Object.entries(rcpts).map(([rcpt, ids]) => (
                          <div key={`${stage}-${rcpt}`} className="flex flex-wrap items-center gap-2 text-sm rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                            <Badge variant="outline" className="text-xs">{stage}</Badge>
                            {rcpt && <Badge variant="secondary" className="text-xs">{rcpt}</Badge>}
                            <span className="break-all">[{ids.join(', ')}]</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">-</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('logs.matchedActionRules')}</label>
                  {email.matched_action_rules && Object.keys(email.matched_action_rules).length > 0 ? (
                    <div className="mt-1 space-y-1">
                      {Object.entries(email.matched_action_rules).map(([stage, rcpts]) =>
                        Object.entries(rcpts).map(([rcpt, ids]) => (
                          <div key={`${stage}-${rcpt}`} className="flex flex-wrap items-center gap-2 text-sm rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                            <Badge variant="outline" className="text-xs">{stage}</Badge>
                            {rcpt && <Badge variant="secondary" className="text-xs">{rcpt}</Badge>}
                            <span className="break-all">[{ids.join(', ')}]</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">-</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('logs.matchedRouteRules')}</label>
                  {email.matched_route_rules && Object.keys(email.matched_route_rules).length > 0 ? (
                    <div className="mt-1 space-y-1">
                      {Object.entries(email.matched_route_rules).map(([stage, rcpts]) =>
                        Object.entries(rcpts).map(([rcpt, ids]) => (
                          <div key={`${stage}-${rcpt}`} className="flex flex-wrap items-center gap-2 text-sm rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                            <Badge variant="outline" className="text-xs">{stage}</Badge>
                            {rcpt && <Badge variant="secondary" className="text-xs">{rcpt}</Badge>}
                            <span className="break-all">[{ids.join(', ')}]</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">-</p>
                  )}
                </div>
                </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="content">
                <ScrollArea className="h-[calc(92vh-13rem)] pr-2">
                  <div className="space-y-4 pb-1">
                  {email.content && (
                    <div>
                      <h4 className="font-medium mb-2">{t('logs.textBody')}</h4>
                      <pre className="overflow-x-auto text-sm bg-muted p-4 rounded whitespace-pre-wrap break-words">{email.content}</pre>
                    </div>
                  )}
                  {email.urls && email.urls.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <LinkIcon className="h-4 w-4" />{t('logs.urlList')}
                      </h4>
                      <ul className="text-sm space-y-1">
                        {email.urls.map((url, i) => (
                          <li key={i} className="font-mono text-blue-600 break-all">{url}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="attachments">
                <ScrollArea className="h-[calc(92vh-13rem)] pr-2">
                <div className="space-y-2 pb-1">
                {email.attachments?.length ? (
                  email.attachments.map((att, i) => (
                    <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        <span className="break-all">{att.filename}</span>
                      </div>
                      <div className="text-sm text-muted-foreground break-all">
                        {att.content_type} - {(att.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">{t('logs.noAttachments')}</p>
                )}
                </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="delivery">
                <ScrollArea className="h-[calc(92vh-13rem)] pr-2">
                  <div className="space-y-4 pb-1">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                        <label className="text-sm text-muted-foreground">Queue ID</label>
                        <p className="mt-1 overflow-hidden font-mono text-sm break-all">{email.queue_id || '-'}</p>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                        <label className="text-sm text-muted-foreground">{t('logs.deliveryStatusSummary')}</label>
                        <div className="mt-2">
                          <DeliveryStatusBadge status={email.delivery_status_summary} action={email.action} t={t} />
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                        <label className="text-sm text-muted-foreground">{t('logs.workflowOutcomeSummary')}</label>
                        <div className="mt-2">
                          <WorkflowOutcomeBadge outcome={email.workflow_outcome_summary} t={t} />
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                        <label className="text-sm text-muted-foreground">{t('logs.deliveryAttempts')}</label>
                        <p className="mt-1 text-sm">{email.delivery_attempts ?? 0}</p>
                      </div>
                      {email.last_delivery_event_at && (
                        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                          <label className="text-sm text-muted-foreground">{t('logs.lastDeliveryEventAt')}</label>
                          <p className="mt-1 text-sm">{formatDate(email.last_delivery_event_at)}</p>
                        </div>
                      )}
                    </div>

                    {email.delivery_error_summary && (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-50/50 p-4 dark:bg-amber-950/20">
                        <label className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" /> {t('logs.deliveryErrorSummary')}
                        </label>
                        <p className="mt-1 text-sm break-all">{email.delivery_error_summary}</p>
                      </div>
                    )}

                    {(() => {
                      const summary = parseDeliveryRecipientsSummary(email.delivery_recipients_summary);
                      return summary.length > 0 && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground mb-2 block">{t('logs.deliveryRecipientsSummary')}</label>
                          <div className="space-y-2">
                            {summary.map((r: DeliveryRecipientSummary, i: number) => (
                            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                              <Badge variant="secondary" className="text-xs font-mono">{r.recipient}</Badge>
                              <DeliveryStatusBadge status={r.status} t={t} />
                              <Badge variant="outline" className="text-xs">{t('logs.attemptCount', { count: r.attempts ?? r.count ?? 0 })}</Badge>
                              {r.last_event_at && (
                                <span className="text-xs text-muted-foreground">{formatDate(r.last_event_at)}</span>
                              )}
                              {(r.error || r.dsn) && (
                                <span className="text-xs text-muted-foreground break-all">{r.error || r.dsn}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      );
                    })()}

                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">{t('logs.deliveryEvents')}</label>
                      {deliveryEventsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
                        </div>
                      ) : deliveryEvents?.items?.length ? (
                        <div className="space-y-2">
                          {deliveryEvents.items.map((event) => (
                            <div key={event.id} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="text-xs">{event.event_source}</Badge>
                                <Badge variant="secondary" className="text-xs">{event.event_result}</Badge>
                                <span className="font-mono text-xs text-muted-foreground">{event.queue_id}</span>
                                <span className="text-xs text-muted-foreground">{formatDate(event.event_time)}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {event.recipient && <span className="break-all">to={event.recipient}</span>}
                                {event.relay && <span className="break-all">relay={event.relay}</span>}
                                {event.dsn && <span>dsn={event.dsn}</span>}
                                {event.smtp_status_code && <span>smtp={event.smtp_status_code}</span>}
                              </div>
                              {event.raw_line && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{event.raw_line}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('logs.noDeliveryEvents')}</p>
                      )}
                    </div>

                    {!email.queue_id && !email.delivery_status_summary && (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Truck className="h-8 w-8 mb-2 opacity-40" />
                        <p className="text-sm">{t('logs.noDeliveryInfo')}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="raw">
                <ScrollArea className="h-[calc(92vh-13rem)] pr-2">
                  <pre className="overflow-x-auto text-xs bg-muted p-4 rounded whitespace-pre-wrap break-all">{JSON.stringify(email, null, 2)}</pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      <InvestigationCreateDialog
        key={emailId ? `mail-${emailId}` : 'mail-none'}
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialTargetId={emailId ? String(emailId) : ''}
        onCreated={handleCreated}
      />

      <InvestigationDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        taskId={selectedTaskId}
      />

      {aiOk && (
        <EmailAIInterpretDrawer
          open={aiOpen}
          onOpenChange={setAiOpen}
          emailId={emailId}
        />
      )}
    </>
  );
}

function isActiveTask(status: InvestigationStatus) {
  return status === 'pending' || status === 'running';
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

function riskBadgeVariant(risk: InvestigationTask['risk_level']) {
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

// GT-12610：中文环境不得裸渲染英文枚举——标签走 status-labels 的本地化映射，
// 未知枚举值原文透出。t 缺省时退回原文（防御，不臆造译文）。
function DeliveryStatusBadge({ status, action, t }: { status?: string; action?: string; t?: (key: string) => string }) {
  if (!status || status === 'unknown') {
    if (action === 'quarantine' && t) return <Badge variant="outline">{t('logs.deliveryStatusQuarantined')}</Badge>;
    if (action === 'sideline' && t) return <Badge variant="secondary">{t('logs.deliveryStatusProcessing')}</Badge>;
    return <Badge variant="outline">{t ? t('logs.deliveryStatusValue.unknown') : 'unknown'}</Badge>;
  }
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon?: React.ReactNode }> = {
    delivered: { variant: 'default' },
    in_delivery: { variant: 'secondary', icon: <Clock className="h-3 w-3 mr-1" /> },
    failed: { variant: 'destructive' },
    cancelled: { variant: 'outline' },
    partial_delivered: { variant: 'secondary' },
  };
  const c = config[status] || { variant: 'outline' as const };
  return <Badge variant={c.variant}>{c.icon}{t ? deliveryStatusLabel(status, t) : status}</Badge>;
}

function WorkflowOutcomeBadge({ outcome, t }: { outcome?: string; t?: (key: string) => string }) {
  if (!outcome || outcome === 'none') return <span className="text-sm text-muted-foreground">-</span>;
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    approved: { variant: 'default' },
    rejected: { variant: 'destructive' },
    released: { variant: 'default' },
    expired: { variant: 'secondary' },
    bounced: { variant: 'destructive' },
  };
  const c = config[outcome] || { variant: 'outline' as const };
  return <Badge variant={c.variant}>{t ? workflowOutcomeLabel(outcome, t) : outcome}</Badge>;
}
