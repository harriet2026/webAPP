'use client';

// Product layout, backed by the main repository's URL contract and retained
// tool observations. Opening this view never rechecks a historical URL.

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ScreenshotCapture } from './screenshot-capture';
import type { ScreenshotObservation, UrlFinding } from '@/types/phishing-detection';
import type { AssessmentResultFields } from '@/types/agent-assessment';
import { AssessmentSourceDetail } from '@/components/agent-center/assessment-report';
import { urlEvidence } from './url_evidence';
import { UrlVerdictDisplay } from './url-verdict-display';

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const asBool = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;
const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-all">{children}</span>
    </div>
  );
}

type Tone = 'danger' | 'ok' | 'warning' | 'muted';
const TONE_DOT: Record<Tone, string> = {
  danger: 'bg-red-500',
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  muted: 'bg-gray-300 dark:bg-gray-600',
};

function ReputationCard({ label, tone, value, sub, testid }: {
  label: string; tone: Tone; value: string; sub?: string | null; testid: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3" data-testid={testid}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />
        {label}
      </div>
      <p className="mt-1.5 text-sm font-medium">{value}</p>
      {sub ? <p className="mt-0.5 break-all text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function UrlFindingDetailSheet({ finding, assessmentResult, screenshots = [], screenshotOnly = false, open, onOpenChange }: {
  finding: UrlFinding | null;
  assessmentResult?: AssessmentResultFields;
  screenshotOnly?: boolean;
  screenshots?: ScreenshotObservation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('phishingDetection');
  const [copied, setCopied] = useState(false);

  const evidence = useMemo(() => finding ? urlEvidence(finding, assessmentResult) : { sources: [] }, [finding, assessmentResult]);
  const view = useMemo(() => {
    if (!finding) return null;
    const analyze = evidence.analyze ?? {};
    const redirect = evidence.fetch ?? {};
    const cert = evidence.cert ?? {};
    const intel = evidence.intel ?? {};
    const rbl = evidence.rbl;

    const url = finding.url || finding.final_url || '';
    const finalUrl = asString(finding.final_url) ?? asString(redirect.final_url);
    const redirected = Boolean(finalUrl && finalUrl !== url);
    const chain = Array.isArray(redirect.redirect_chain) ? redirect.redirect_chain.flatMap((hop: unknown) => { const url = hop && typeof hop === 'object' ? asString((hop as Record<string, unknown>).url) : null; return url ? [url] : []; }) : [];
    const ips = asStringList(evidence.dns?.addresses);
    const host = asString(finding.host) ?? asString(analyze.host);

    const domainAgeDays = asNumber(evidence.domainAge?.age_days);
    const registrationDate = asString(evidence.domainAge?.registration_date);

    const intelVerdict = asString(intel.verdict) ?? asString(intel.threat_type);
    const certIssuer = asString(cert.issuer);
    const certTrusted = asBool(cert.chain_trusted);

    const rblListed = rbl ? asBool(rbl.listed) : null;

    return {
      url, finalUrl, redirected, chain, ips, host,
      domainAgeDays, registrationDate, intelVerdict, certIssuer, certTrusted, rblListed,
      hasRbl: rblListed != null, hasIntel: intelVerdict === 'SAFE' || intelVerdict === 'THREAT', hasCert: certTrusted != null,
      verdict: finding.agent?.verdict,
      riskLevel: finding.agent?.risk_level ?? asString(finding.risk_level),
    };
  }, [finding, evidence]);

  if (!finding || !view) return null;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(view.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* 剪贴板不可用时静默，URL 本身可见可选 */ }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Base UI omits nested backdrops by default; this drawer needs its own
          backdrop so a pointer dismissal closes only the URL evidence. */}
      <SheetContent side="right" forceRenderOverlay className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg" data-testid="phishing-url-detail-sheet">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle>{t('urlDetail.title')}</SheetTitle>
          <SheetDescription className="break-all">{view.host || view.url || t('table.unknownUrl')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {/* 判定 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-url-detail-verdict">
            <div className="flex flex-wrap items-center gap-2">
              {screenshotOnly ? <span>{t('urlValidation.screenshotOnly')}</span> : <UrlVerdictDisplay finding={finding} />}
              {view.riskLevel ? <Badge variant="outline">{t('urlDetail.riskLevel')}: {t.has(`riskLevel.${view.riskLevel}`) ? t(`riskLevel.${view.riskLevel}`) : view.riskLevel}</Badge> : null}
            </div>
          </section>

          {/* 链接与解析 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-url-detail-link">
            <h3 className="text-sm font-semibold">{t('urlDetail.linkSection')}</h3>
            <div className="space-y-2">
              <Row label={t('urlDetail.originalUrl')}>
                <span className="inline-flex items-center gap-1">
                  <span className="break-all text-primary">{view.url || t('table.unknownUrl')}</span>
                  {view.url ? (
                    <Button type="button" variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0" title={t('urlDetail.copy')} onClick={copyUrl} data-testid="phishing-url-detail-copy">
                      <Copy className="size-3.5" />
                      <span className="sr-only">{copied ? t('urlDetail.copied') : t('urlDetail.copy')}</span>
                    </Button>
                  ) : null}
                </span>
              </Row>
              <Row label={t('urlDetail.finalUrl')}>
                {view.finalUrl ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="break-all">{view.finalUrl}</span>
                    <Badge variant="outline" className={view.redirected ? 'border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning' : 'text-muted-foreground'}>
                      {view.redirected ? t('urlDetail.redirected') : t('urlDetail.noRedirect')}
                    </Badge>
                  </span>
                ) : '—'}
              </Row>
              {view.chain.length ? (
                <Row label={t('urlDetail.redirectChain')}>
                  <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {view.chain.map((hop, index) => <li key={`hop-${index}`} className="break-all">{hop}</li>)}
                  </ol>
                </Row>
              ) : null}
              <Row label={t('urlDetail.host')}>{view.host ?? '—'}</Row>
              <Row label={t('urlDetail.resolvedIps')}>{view.ips.length ? view.ips.join(', ') : '—'}</Row>
            </div>
          </section>

          {/* 信誉与情报 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-url-detail-reputation">
            <h3 className="text-sm font-semibold">{t('urlDetail.reputationSection')}</h3>
            <div className="grid grid-cols-2 gap-2">
              <ReputationCard
                testid="phishing-url-detail-rbl"
                label={t('urlDetail.rbl')}
                tone={!view.hasRbl ? 'muted' : view.rblListed ? 'danger' : 'ok'}
                value={!view.hasRbl ? t('urlDetail.noRetainedEvidence') : view.rblListed ? t('urlDetail.listed') : t('urlDetail.notHit')}
              />
              <ReputationCard
                testid="phishing-url-detail-intel"
                label={t('urlDetail.threatIntel')}
                tone={!view.hasIntel ? 'muted' : /safe|clean/i.test(view.intelVerdict ?? '') ? 'ok' : 'danger'}
                value={view.hasIntel ? view.intelVerdict! : t('urlDetail.noRetainedEvidence')}
              />
              <ReputationCard
                testid="phishing-url-detail-domain"
                label={t('urlDetail.domainAge')}
                tone={view.domainAgeDays == null ? 'muted' : view.domainAgeDays < 30 ? 'warning' : 'ok'}
                value={view.domainAgeDays != null ? t('urlDetail.domainAgeDays', { days: view.domainAgeDays }) : t('urlDetail.noRetainedEvidence')}
                sub={view.registrationDate ? t('urlDetail.domainRegistered', { date: view.registrationDate }) : null}
              />
              <ReputationCard
                testid="phishing-url-detail-cert"
                label={t('urlDetail.tlsCert')}
                tone={!view.hasCert ? 'muted' : view.certTrusted ? 'ok' : 'warning'}
                value={!view.hasCert ? t('urlDetail.noRetainedEvidence') : view.certTrusted ? t('urlDetail.certTrusted') : t('urlDetail.certUntrusted')}
                sub={view.certIssuer ? t('urlDetail.certIssuer', { issuer: view.certIssuer }) : null}
              />
            </div>
          </section>

          {/* 落地页截图 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4" data-testid="phishing-url-detail-screenshot">
            <h3 className="text-sm font-semibold">{t('urlDetail.screenshotSection')}</h3>
            {screenshots.length ? screenshots.map((capture, index) => <ScreenshotCapture key={`${capture.attempt_id}:${capture.fetch_id}:${index}`} capture={capture} index={index + 1} />) : <p className="text-xs text-muted-foreground">{t('urlDetail.noRetainedEvidence')}</p>}
          </section>
          {evidence.sources.length ? <section className="space-y-2" data-testid="phishing-url-detail-sources"><h3 className="text-sm font-semibold">{t('urlDetail.retainedSources')}</h3>{evidence.sources.map((source) => <AssessmentSourceDetail key={source.id} source={source} localizeTarget />)}</section> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
