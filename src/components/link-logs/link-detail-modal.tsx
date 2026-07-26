'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, ShieldAlert, ShieldCheck, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';
import { type LinkClickLog } from '@/lib/api/link-clicks';
import { STAGE_ORDER, stageMeta, verdictMeta, resultMeta, actionMeta, deepInspectStateMeta, SOURCE_LABEL_KEY } from './meta';

interface LinkDetailModalProps {
  log: LinkClickLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Map a trigger_stage to the timeline index of STAGE_ORDER (none => beyond the
// end so every stage shows "checked · no hit"; spec §5.1 UNKNOWN renders all
// three as checked·no-hit).
function triggerIndex(stage?: string): number {
  const i = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  return i === -1 ? STAGE_ORDER.length : i;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value}</span>
    </div>
  );
}

export function LinkDetailModal({ log, open, onOpenChange }: LinkDetailModalProps) {
  const t = useTranslations();
  if (!log) return null;

  const tIdx = triggerIndex(log.trigger_stage);
  const alerted = log.final_result === 'alerted';
  const rm = resultMeta(log.final_result);
  const am = actionMeta(log.user_action);
  const vm = verdictMeta(log.verdict);
  const sm = stageMeta(log.trigger_stage);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="link-logs-detail-modal" className="max-w-[1100px] w-[95vw] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 border-b border-border">
          <div className="text-xs text-muted-foreground mb-1">{t('linkLogs.detail.breadcrumb')}</div>
          <DialogTitle data-testid="link-logs-detail-title" className="text-lg font-semibold truncate">{log.original_url}</DialogTitle>
          <DialogDescription className="sr-only">{t('linkLogs.detail.disposition')}</DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Final disposition banner */}
          <div data-testid="link-logs-detail-banner" className={`rounded-lg p-4 border flex items-center gap-3 ${alerted ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            {alerted ? <ShieldAlert className="h-6 w-6 text-red-600" /> : <ShieldCheck className="h-6 w-6 text-green-600" />}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{t('linkLogs.detail.disposition')}</span>
              <span data-testid="link-logs-detail-result" className={`px-2 py-1 rounded text-xs font-medium ${rm.color}`}>{t(rm.labelKey)}</span>
              <span data-testid="link-logs-detail-stage" className={`px-2 py-1 rounded text-xs font-medium ${sm.color}`}>{t(sm.labelKey)}</span>
              {log.user_action && log.user_action !== 'none' && <span data-testid="link-logs-detail-action" className={`px-2 py-1 rounded text-xs font-medium ${am.color}`}>{t(am.labelKey)}</span>}
            </div>
          </div>

          {/* Sequential detection timeline (three stages) */}
          <div className="bg-muted/40 rounded-lg p-6 border border-border">
            <h3 className="text-base font-semibold mb-2">{t('linkLogs.detail.timeline')}</h3>
            <p className="text-xs text-muted-foreground mb-5">{t('linkLogs.detail.timelineHint')}</p>
            <div className="space-y-3" data-testid="detection-timeline">
              {STAGE_ORDER.map((stage, idx) => {
                const isHit = idx === tIdx;
                const isPassed = idx < tIdx;
                const isDeepInspect = stage === 'phishing_agent';
                let statusLabel = t('linkLogs.detail.checkedPassed');
                let statusClass = 'text-green-700';
                let Icon = CheckCircle2;
                let iconClass = 'text-green-600';
                let cardClass = 'bg-background border-border';
                if (isHit) {
                  statusLabel = t('linkLogs.detail.hit'); statusClass = 'text-red-700 font-semibold';
                  Icon = AlertTriangle; iconClass = 'text-red-600'; cardClass = 'bg-red-50 border-red-200';
                } else if (!isPassed) {
                  statusLabel = t('linkLogs.detail.skipped'); statusClass = 'text-gray-400';
                  Icon = MinusCircle; iconClass = 'text-gray-300'; cardClass = 'bg-muted/40 border-border opacity-70';
                }
                const dim = isDeepInspect && log.deep_inspect_state ? deepInspectStateMeta(log.deep_inspect_state) : null;
                return (
                  <div key={stage} data-stage={stage} className={`flex items-start gap-4 rounded-lg border p-4 ${cardClass}`}>
                    <div className="flex flex-col items-center shrink-0">
                      <span className="text-xs font-semibold text-muted-foreground">{idx + 1}</span>
                      <Icon className={`h-5 w-5 mt-1 ${iconClass}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{t(stageMeta(stage).labelKey)}</span>
                        <span className={`text-xs ${statusClass}`}>{statusLabel}</span>
                      </div>
                      {dim && (
                        <div className="mt-2">
                          <span data-testid={`link-logs-deep-state-${stage}`} className={`px-2 py-1 rounded text-xs font-medium ${dim.color}`}>{t(dim.labelKey)}</span>
                        </div>
                      )}
                      {isHit && log.detail && <p className="text-sm text-red-700 mt-2 break-all">{log.detail}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Link info */}
          <div data-testid="link-logs-detail-link-info" className="rounded-lg border border-border p-4">
            <h3 className="text-base font-semibold mb-3">{t('linkLogs.detail.linkInfo')}</h3>
            <div className="flex items-center gap-2 text-sm break-all mb-3">
              <span className="text-blue-600">{log.original_url}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{log.rewritten_url || '-'}</span>
            </div>
            <InfoRow label={t('linkLogs.columns.verdict')} value={<span className={`px-2 py-1 rounded text-xs font-medium ${vm.color}`}>{t(vm.labelKey)}</span>} />
            <InfoRow label={t('linkLogs.detail.clickSource')} value={log.click_source ? t(SOURCE_LABEL_KEY[log.click_source as 'body' | 'attachment'] ?? 'linkLogs.sources.body') : '-'} />
          </div>

          {/* Mail & click context */}
          <div data-testid="link-logs-detail-context" className="rounded-lg border border-border p-4">
            <h3 className="text-base font-semibold mb-3">{t('linkLogs.detail.context')}</h3>
            <InfoRow label={t('linkLogs.columns.tid')} value={log.message_id} />
            <InfoRow label={t('linkLogs.detail.subject')} value={log.subject || '-'} />
            <InfoRow label={t('linkLogs.columns.sender')} value={log.sender || '-'} />
            <InfoRow label={t('linkLogs.columns.clicker')} value={log.clicker} />
            <InfoRow label={t('linkLogs.columns.clickTime')} value={formatDate(log.occurred_at)} />
            <InfoRow label={t('linkLogs.detail.clientIp')} value={log.client_ip || '-'} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
