'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { OverflowCell } from '@/components/shared/overflow-cell';
import { useApiRequest } from '@/lib/api/client';
import { spoofingQueryKeys } from './spoofing-query-keys';
import { formatDate } from '@/lib/utils';
import { getSpoofingLogDetail } from '@/lib/api/spoofing-detection';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detailId: string | null;
  canEdit: boolean;
  onBlock: (id: string) => void;
  onExempt: (id: string) => void;
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 break-all text-sm"><OverflowCell text={value || '-'} /></div>
    </div>
  );
}

export function SpoofingDetailSheet({ open, onOpenChange, detailId, canEdit, onBlock, onExempt }: Props) {
  const t = useTranslations();
  const tsd = useTranslations('spoofingDetection');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const [signalsOpen, setSignalsOpen] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: spoofingQueryKeys.detail(effectiveTenantId, detailId),
    queryFn: () => getSpoofingLogDetail(detailId!, apiRequest),
    enabled: open && !!detailId,
  });
  const summary = data?.summary;
  const inv = (data?.investigation ?? null) as Record<string, unknown> | null;
  const result = (inv?.result ?? {}) as Record<string, unknown>;
  const aiSummary = (inv?.summary as string) ?? (result.summary as string) ?? '';
  const evidence = (result.evidence as Array<{ severity?: string; title?: string; detail?: string }>) ?? [];
  const actionable = summary?.actionable ?? false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[680px]">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{tsd('detail.title')}</SheetTitle>
          <SheetDescription>{summary ? summary.subject || tsd('detail.noSubject') : t('common.loading')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {isLoading || !summary ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* ① 基础信息 */}
              <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold">{tsd('detail.basicInfo')}</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label={tsd('detail.sender')} value={summary.sender} />
                  <Field label={tsd('detail.recipients')} value={(summary.recipients ?? []).join(', ')} />
                  <Field label={tsd('detail.subject')} value={summary.subject} full />
                  <Field label={tsd('detail.time')} value={formatDate(summary.sidelined_at)} />
                  <Field label={tsd('detail.direction')} value={summary.direction} />
                </div>
              </section>

              {/* ② 风险研判 */}
              <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{tsd('detail.riskAssessment')}</h3>
                  <div className="flex items-center gap-2">
                    {summary.risk_level ? <Badge variant="outline">{tsd(`riskLevel.${summary.risk_level || 'none'}`)}</Badge> : null}
                    {typeof summary.confidence === 'number'
                      ? <Badge variant="outline">{tsd('detail.confidence')}: {Math.round(summary.confidence * 100)}%</Badge> : null}
                  </div>
                </div>
                {aiSummary ? <p className="text-sm leading-relaxed">{aiSummary}</p> : null}
              </section>

              {/* ③ 最终处置 + 二次处置 */}
              <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold">{tsd('detail.finalDisposition')}</h3>
                <Badge>{tsd(`disposition.${summary.disposition}`)}</Badge>
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button variant="destructive" size="sm" disabled={!actionable} onClick={() => onBlock(summary.id)}>
                      {tsd('detail.block')}
                    </Button>
                    <Button variant="outline" size="sm" disabled={!actionable} onClick={() => onExempt(summary.id)}>
                      {tsd('detail.exempt')}
                    </Button>
                    {!actionable ? <span className="text-xs text-muted-foreground">{tsd('detail.fallbackHint')}</span> : null}
                  </div>
                ) : null}
              </section>

              {/* ④ 仿冒信号（逐条展开） */}
              <Collapsible open={signalsOpen} onOpenChange={setSignalsOpen}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-sm font-medium">
                  <span>{tsd('detail.signals')}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${signalsOpen ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {evidence.length > 0 ? evidence.map((ev, i) => (
                    <div key={i} className="rounded-xl border border-border/50 bg-background/70 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={ev.severity === 'high' || ev.severity === 'critical' ? 'destructive'
                          : ev.severity === 'medium' ? 'default' : 'secondary'} className="text-xs">
                          {ev.severity ?? 'info'}
                        </Badge>
                        <span className="text-sm font-medium">{ev.title}</span>
                      </div>
                      {ev.detail ? <p className="mt-1.5 text-xs text-muted-foreground">{ev.detail}</p> : null}
                    </div>
                  )) : <p className="text-xs text-muted-foreground">{tsd('detail.noSignals')}</p>}
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
