'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Download, Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OverflowCell } from '@/components/shared/overflow-cell';
import { JsonBlock } from '@/components/phishing-detection/json-block';
import { getDetectionLogDetail } from '@/lib/api/phishing-detection';
import { useApiRequest } from '@/lib/api/client';
import { formatDate } from '@/lib/utils';
import { dispositionBadgeClass } from '@/components/phishing-detection/badge-styles';
import { UrlFindingsTable } from '@/components/phishing-detection/url-findings-table';

interface DetectionDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detailId: string | null;
  isAdmin: boolean;
  isLiveState: (disposition: string) => boolean;
  onBlock: (id: string) => void;
  onExempt: (id: string) => void;
}

export function DetectionDetailSheet({
  open,
  onOpenChange,
  detailId,
  isAdmin,
  isLiveState,
  onBlock,
  onExempt,
}: DetectionDetailSheetProps) {
  const t = useTranslations();
  const tpd = useTranslations('phishingDetection');
  const { apiRequest } = useApiRequest();
  const [stepSearch, setStepSearch] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['phish-detail', detailId],
    queryFn: () => getDetectionLogDetail(detailId!, apiRequest),
    enabled: open && !!detailId,
  });

  const summary = data?.summary;
  const investigation = data?.investigation;
  const steps = useMemo(() => investigation?.steps ?? [], [investigation?.steps]);
  const urlFindings = investigation?.result?.details?.url_findings ?? [];
  const evidence = investigation?.result?.evidence ?? [];
  const aiSummary = investigation?.summary ?? investigation?.result?.summary ?? '';
  const liveBlocked = summary ? isLiveState(summary.disposition) : false;

  const filteredSteps = useMemo(() => {
    const q = stepSearch.trim().toLowerCase();
    if (!q) return steps;
    return steps.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.message ?? '').toLowerCase().includes(q),
    );
  }, [steps, stepSearch]);

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phishing-${detailId ?? 'detail'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{tpd('detail.title')}</SheetTitle>
            <SheetDescription>
              {summary ? summary.subject || tpd('detail.noSubject') : t('common.loading')}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
            {isLoading || !summary ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {summary.result_truncated ? (
                  <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
                    {tpd('detail.resultTruncatedHint')}
                  </div>
                ) : null}
                {isAdmin ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={liveBlocked}
                      onClick={() => onBlock(summary.sideline_id)}
                    >
                      {tpd('detail.block')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={liveBlocked}
                      onClick={() => onExempt(summary.sideline_id)}
                    >
                      {tpd('detail.exempt')}
                    </Button>
                    {liveBlocked ? (
                      <span className="self-center text-xs text-muted-foreground">{tpd('detail.liveStateHint')}</span>
                    ) : null}
                  </div>
                ) : null}

                <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold">{tpd('detail.mailContext')}</h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label={tpd('detail.sender')} value={summary.sender} />
                    <Field label={tpd('detail.recipients')} value={(summary.recipients ?? []).join(', ')} />
                    <Field label={tpd('detail.subject')} value={summary.subject} spanFull />
                    <Field label={tpd('detail.sidelinedAt')} value={formatDate(summary.sidelined_at)} />
                    <Field label={tpd('detail.direction')} value={summary.direction} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge className={dispositionBadgeClass(summary.disposition)}>
                      {tpd(`disposition.${summary.disposition}`)}
                    </Badge>
                    {summary.risk_level ? (
                      <Badge variant="outline">
                        {tpd(`riskLevel.${summary.risk_level || 'none'}`)}
                      </Badge>
                    ) : null}
                    {typeof summary.confidence === 'number' ? (
                      <Badge variant="outline">
                        {tpd('detail.confidence')}: {Math.round(summary.confidence * 100)}%
                      </Badge>
                    ) : null}
                  </div>
                </section>

                {investigation ? (
                  <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{tpd('detail.agentVerdict')}</h3>
                      {investigation.status ? (
                        <Badge variant={
                          investigation.status === 'completed' ? 'secondary' :
                          investigation.status === 'failed' ? 'destructive' : 'outline'
                        } className="text-xs">
                          {invStatusLabel(investigation.status)}
                        </Badge>
                      ) : null}
                    </div>
                    {aiSummary ? (
                      <p className="text-sm text-foreground leading-relaxed">{aiSummary}</p>
                    ) : null}
                    {investigation.error_message ? (
                      <p className="text-xs text-destructive">{investigation.error_message}</p>
                    ) : null}
                    {evidence.length > 0 ? (
                      <div className="space-y-2">
                        {evidence.map((ev, index) => (
                          <div key={`ev-${index}`} className="rounded-xl border border-border/50 bg-background/70 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={
                                ev.severity === 'high' || ev.severity === 'critical' ? 'destructive' :
                                ev.severity === 'medium' ? 'default' : 'secondary'
                              } className="text-xs">
                                {evidenceSeverityLabel(ev.severity)}
                              </Badge>
                              <span className="text-sm font-medium">{ev.title}</span>
                            </div>
                            {ev.detail ? <p className="mt-1.5 text-xs text-muted-foreground">{ev.detail}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!aiSummary && !investigation.error_message && evidence.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{tpd('detail.noVerdictContent')}</p>
                    ) : null}
                  </section>
                ) : null}

                {urlFindings.length > 0 ? (
                  <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold">
                      {tpd('table.urlFindingsTitle', { count: urlFindings.length })}
                    </h3>
                    <UrlFindingsTable findings={urlFindings} />
                  </section>
                ) : null}

                {(summary.recipient_dispositions?.length > 0 || summary.recalls?.length > 0) ? (
                  <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold">{tpd('detail.recipientDetail')}</h3>
                    {(summary.recipients ?? []).map((rcpt) => {
                      const recall = summary.recalls?.find((r) => r.receiver === rcpt);
                      // recipient_dispositions is a struct array; pick this
                      // recipient's row instead of stringifying the whole array.
                      const disp = summary.recipient_dispositions?.find((d) => d.recipient === rcpt);
                      return (
                        <div key={rcpt} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="truncate font-mono text-xs">{rcpt}</span>
                          {disp ? (
                            <Badge variant="outline" title={disp.reason || undefined}>
                              {disp.final_action}
                              {disp.status ? ` (${disp.status})` : ''}
                            </Badge>
                          ) : null}
                          {recall ? (
                            <Badge variant="outline">
                              {tpd('detail.recall')}: {recall.operate_result}
                            </Badge>
                          ) : null}
                        </div>
                      );
                    })}
                  </section>
                ) : null}

                <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-sm font-medium">
                    <span>{tpd('detail.configSnapshot')}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${configOpen ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2 text-sm text-muted-foreground">
                    {data.config_snapshot ? (
                      <div className="space-y-2" data-testid="phish-config-snapshot">
                        <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                          {tpd('detail.configSnapshotStaleNotice')}
                        </div>
                        <JsonBlock value={data.config_snapshot} />
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const blob = new Blob(
                                [JSON.stringify(data.config_snapshot, null, 2)],
                                { type: 'application/json' },
                              );
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `phishing-config-${detailId ?? 'snapshot'}.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            data-testid="config-snapshot-export"
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            {tpd('detail.exportJson')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p data-testid="phish-config-snapshot-empty">
                        {tpd('detail.configPlaceholder')}
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={logOpen} onOpenChange={setLogOpen}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-sm font-medium">
                    <span>{tpd('detail.runLog')}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${logOpen ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={stepSearch}
                          onChange={(e) => setStepSearch(e.target.value)}
                          placeholder={tpd('detail.searchSteps')}
                          className="h-8 pl-7"
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        {tpd('detail.exportJson')}
                      </Button>
                    </div>
                    {filteredSteps.length > 0 ? (
                      <div className="space-y-1.5">
                        {filteredSteps.map((step, index) => (
                          <div key={`log-${step.name}-${index}`} className="rounded-lg border border-border/50 bg-background/70 p-2 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium">{step.name}</span>
                              <Badge variant="outline" className="h-4 text-[10px]">{step.status}</Badge>
                            </div>
                            {step.message ? <p className="mt-1 text-muted-foreground">{step.message}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{tpd('detail.noSteps')}</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

    </>
  );
}

function Field({ label, value, spanFull }: { label: string; value: string; spanFull?: boolean }) {
  return (
    <div className={spanFull ? 'md:col-span-2' : ''}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 text-sm break-all">
        <OverflowCell text={value || '-'} />
      </div>
    </div>
  );
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '信息',
};

function evidenceSeverityLabel(severity: string): string {
  return SEVERITY_LABELS[severity] ?? severity;
}

const INV_STATUS_LABELS: Record<string, string> = {
  completed: '已完成',
  running: '检测中',
  pending: '排队中',
  failed: '失败',
};

function invStatusLabel(status: string): string {
  return INV_STATUS_LABELS[status] ?? status;
}
