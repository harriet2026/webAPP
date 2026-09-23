'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { DetectionLogDetail } from '@/types/phishing-detection';
import { policyDispositionBadgeClass, riskBadgeClass } from './badge-styles';
import { VerdictDisplay } from './verdict-display';

export function ModelAnalysisSummary({ text, showPolicyHint = true }: { text?: string; showPolicyHint?: boolean }) {
  const t = useTranslations('assessment');
  if (!text) return null;
  return <div className="space-y-2 rounded-lg bg-muted/30 p-4" data-testid="phishing-model-summary">
    <h4 className="text-sm font-semibold">{t('presentation.summary')}</h4>
    <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{text}</p>
    {showPolicyHint ? <p className="text-xs leading-5 text-muted-foreground">{t('presentation.summaryHint')}</p> : null}
  </div>;
}

export function InvestigationAssessment({ summary, investigation }: {
  summary: DetectionLogDetail['summary'];
  investigation: NonNullable<DetectionLogDetail['investigation']>;
}) {
  const t = useTranslations('phishingDetection');
  const ta = useTranslations('assessment');
  const text = investigation.result?.summary || investigation.summary;
  const verdict = investigation.result?.verdict;
  const evidence = investigation.result?.evidence ?? [];
  const validConfidence = typeof summary.confidence === 'number' && Number.isFinite(summary.confidence) && summary.confidence >= 0 && summary.confidence <= 1;

  return <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4" data-testid="phishing-investigation">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold">{ta('presentation.title')}</h3>
      {investigation.status ? <Badge variant="outline">{t(`taskStatus.${['pending', 'running', 'completed', 'failed', 'needs_approval', 'cancelled'].includes(investigation.status) ? investigation.status : 'unknown'}`)}</Badge> : null}
    </div>
    <div className="space-y-2" data-testid="phishing-policy-assessment">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={`${riskBadgeClass(summary.risk_level)} h-auto px-3 py-1 text-base font-semibold`} data-testid="phishing-policy-risk">
          {summary.risk_level ? t(`riskLevel.${summary.risk_level}`) : ta('presentation.undecided')}
        </Badge>
        <span className="text-xs text-muted-foreground">{ta('presentation.policySource')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="inline-flex flex-wrap items-center gap-2">{ta('presentation.policyDisposition')}<Badge className={policyDispositionBadgeClass(summary.policy_disposition)}>{t(`policyDisposition.${summary.policy_disposition ?? 'undecided'}`)}</Badge></span>
        {validConfidence ? <span>{ta('presentation.threatScore', { score: Math.round(summary.confidence! * 100) })}</span> : null}
      </div>
    </div>
    <ModelAnalysisSummary text={text} />
    {investigation.error_message ? <p className="break-words text-xs text-destructive">{investigation.error_message}</p> : null}
    {evidence.length ? <p className="text-sm text-muted-foreground">{ta('legacyEvidence')}</p> : null}
    {evidence.map((item, index) => <div key={`${item.type}-${index}`} className="rounded-xl border border-border/50 bg-background/70 p-3">
      <div className="flex items-center gap-2"><Badge variant="outline">{t(`evidenceSeverity.${['low', 'medium', 'high', 'critical'].includes(item.severity) ? item.severity : 'unknown'}`)}</Badge><span className="text-sm font-medium">{item.title}</span></div>
      <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
    </div>)}
    <details className="border-t border-border pt-2 text-sm" data-testid="phishing-model-verdict">
      <summary className="cursor-pointer rounded-sm py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring">{ta('presentation.rawVerdict')}</summary>
      <div className="space-y-2 pt-3">
        <VerdictDisplay verdict={verdict} />
        <p className="text-xs leading-5 text-muted-foreground">{ta('presentation.verdictHint')}</p>
      </div>
    </details>
  </section>;
}
