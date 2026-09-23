'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { AssessmentFactor, AssessmentReport, AssessmentResultFields, AssessmentSource } from '@/types/agent-assessment';
import { cn } from '@/lib/utils';

export function AssessmentReportView({ result, error = false, layout = 'grouped' }: { result?: AssessmentResultFields; error?: boolean; layout?: 'grouped' | 'findings' }) {
  const t = useTranslations('assessment');
  const report = result?.assessment_report;
  const label = (group: string, value?: string) => t(`${group}.${value && t.has(`${group}.${value}`) ? value : 'unknown'}`);
  const status = result?.assessment_report_status ?? 'not_recorded';
  const supported = report?.schema_version === 1 || report?.schema_version === 2;
  const version = report?.schema_version ?? result?.assessment_failure?.schema_version;
  if (error || status !== 'available' || !report || !supported) {
    const state = error || (status === 'available' && !report) ? 'error'
      : status === 'unsupported' || (report && !supported) ? 'unsupported'
      : status === 'pending' || status === 'not_recorded' ? status : 'error';
    return <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm" data-testid="assessment-report">
      <h3 className="text-base font-semibold">{t('title')}</h3>
      <p role={state === 'error' ? 'alert' : 'status'} data-testid="assessment-state">{t(`states.${state}`)}</p>
      {state !== 'error' && result?.assessment_report_reason ? <p className="text-muted-foreground">{label('reasons', result.assessment_report_reason)}</p> : null}
      {state === 'unsupported' && version ? <p className="text-muted-foreground">{t('version', { version })}</p> : null}
    </section>;
  }
  const cited = new Set(report.factors?.flatMap((factor) => factor.source_refs) ?? []);
  const uncited = report.sources?.filter((source) => !cited.has(source.id)) ?? [];
  const hasOmissions = Boolean(report.omitted_subjects || report.omitted_sources || report.omitted_gaps);
  const implicitMail = layout === 'findings' && report.subjects?.length === 1 && report.subjects[0].kind === 'mail';
  return <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 text-sm" data-testid="assessment-report">
    <h3 className="text-base font-semibold">{t('title')}</h3>
    {!report.factors?.length ? <p data-testid="assessment-state">{t('empty')}</p> : null}
    {report?.subjects?.map((subject) => <section key={subject.id} className="min-w-0 space-y-3" data-testid="assessment-subject">
      {!implicitMail ? <div className="space-y-1"><p className="text-muted-foreground">{label('subjectKinds', subject.kind)}</p><h4 className="break-words font-semibold">{subject.label || t('unknownSubject')}</h4></div> : null}
      {layout === 'findings' ? report.factors?.filter((factor) => factor.subject_ref === subject.id).map((factor) => <FindingCard key={factor.id} factor={factor} sources={report.sources ?? []} />) : ['supports_threat', 'supports_legitimate', 'limits_certainty'].map((direction) => {
        const factors = report.factors?.filter((factor) => factor.subject_ref === subject.id && factor.direction === direction) ?? [];
        if (!factors.length) return null;
        return <div key={direction} className="space-y-3" data-testid="assessment-direction">
          <h5 className="font-medium">{label('directions', direction)}</h5>
          {factors.map((factor) => <article key={factor.id} className="min-w-0 space-y-3 rounded-md border border-border p-3" data-testid="assessment-factor">
            <Badge variant="outline">{t('strength', { value: label('strengths', factor.strength) })}</Badge>
            <dl className="space-y-2">
              <div><dt className="text-muted-foreground">{t('observation')}</dt><dd className="whitespace-pre-wrap break-words">{factor.observation}</dd></div>
              <div><dt className="text-muted-foreground">{t('relevance')}</dt><dd className="whitespace-pre-wrap break-words">{factor.relevance}</dd></div>
              <div><dt className="text-muted-foreground">{t('limitation')}</dt><dd className="whitespace-pre-wrap break-words">{factor.limitation || t('noLimitation')}</dd></div>
            </dl>
            {factor.source_refs.map((ref) => {
              const source = report.sources?.find((item) => item.id === ref);
              return source ? <SourceDetail key={ref} source={source} /> : null;
            })}
          </article>)}
        </div>;
      })}
    </section>)}
    {uncited.length ? <section className="space-y-3 border-t border-border pt-4" data-testid="assessment-uncited-sources">
      <h4 className="font-semibold">{t('uncitedSources')}</h4>
      {uncited.map((source) => <SourceDetail key={source.id} source={source} localizeTarget={layout === 'findings'} />)}
    </section> : null}
    {report.gaps?.length || hasOmissions ? <section className="space-y-2 border-t border-border pt-4" data-testid="assessment-gaps">
      <h4 className="font-semibold">{t('gapsTitle')}</h4>
      {report.gaps?.map((gap, index) => <div key={index} className="space-y-1">
        <p className="break-words font-medium">{label('gapCodes', gap.code)}{gap.code && !t.has(`gapCodes.${gap.code}`) ? ` (${gap.code})` : ''}</p>
        {!(implicitMail && (!gap.subject_ref || gap.subject_ref === report.subjects?.[0].id)) ? <p className="break-words text-muted-foreground">{gap.subject_ref ? report.subjects?.find((subject) => subject.id === gap.subject_ref)?.label || t('unknownSubject') : t('allSubjects')}</p> : null}
        <p className="whitespace-pre-wrap break-words">{gap.detail}</p>
      </div>)}
      {report.omitted_subjects ? <p>{t('omittedSubjects', { count: report.omitted_subjects })}</p> : null}
      {report.omitted_sources ? <p>{t('omittedSources', { count: report.omitted_sources })}</p> : null}
      {report.omitted_gaps ? <p>{t('omittedGaps', { count: report.omitted_gaps })}</p> : null}
    </section> : null}
  </section>;
}

function FindingCard({ factor, sources }: { factor: AssessmentFactor; sources: NonNullable<AssessmentReport['sources']> }) {
  const t = useTranslations('assessment');
  const direction = factor.direction && t.has(`findings.directions.${factor.direction}`) ? factor.direction : 'unknown';
  const strength = factor.strength && t.has(`strengths.${factor.strength}`) ? factor.strength : 'unknown';
  const strengthSteps = { weak: 1, moderate: 2, strong: 3 }[strength] ?? 0;
  return <article className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4" data-testid="assessment-factor">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Badge variant="outline" className="h-auto whitespace-normal">{t(`findings.directions.${direction}`)}</Badge>
      <span data-testid="assessment-strength" className={cn('inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium', strength === 'strong' ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
        <span aria-hidden="true" className="flex h-4 items-end gap-0.5">
          {['h-1.5', 'h-2.5', 'h-3.5'].map((height, index) => <span key={height} className={cn('w-1 rounded-sm bg-current', height, index >= strengthSteps && 'opacity-20')} />)}
        </span>
        {t('findings.strength')}<strong className="text-base font-semibold">{t(`strengths.${strength}`)}</strong>
      </span>
    </div>
    <h5 className="whitespace-pre-wrap break-words text-sm font-semibold [overflow-wrap:anywhere]">{factor.observation}</h5>
    <p className="whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere]">{factor.relevance}</p>
    {factor.limitation ? <p className="whitespace-pre-wrap break-words border-l-2 border-warning pl-3 leading-6 [overflow-wrap:anywhere]" data-testid="assessment-limitation"><span className="font-medium">{t('findings.limitation')}: </span>{factor.limitation}</p> : null}
    {factor.source_refs.length ? <details data-testid="assessment-factor-sources" className="min-w-0 border-t border-border pt-2">
      <summary className="cursor-pointer rounded-sm py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring">{t('findings.sources', { count: factor.source_refs.length })}</summary>
      <div className="min-w-0 space-y-3 pt-3">
        {factor.source_refs.map((ref) => {
          const source = sources.find((item) => item.id === ref);
          return source ? <SourceDetail key={ref} source={source} localizeTarget inline /> : null;
        })}
      </div>
    </details> : null}
  </article>;
}

// Targets are open strings. Only translate known (kind, target) pairs; a
// familiar field name from an unfamiliar source kind must retain its identity.
const mailTargets = new Set(['subject', 'from', 'envelope_from', 'header_from', 'message_id', 'spf_result', 'dkim_result', 'dmarc_result', 'ptr_result', 'direction', 'recipients', 'text_body', 'html_body', 'artifact_available']);
const toolTargets = new Set(['analyze_url', 'check_url_threat_intel', 'web_fetch', 'get_sender_history', 'search_similar_messages', 'get_attachment_findings', 'lookup_domain_age', 'inspect_tls_cert', 'dig', 'lookup_ip_geo_asn', 'check_rbl_blocklist']);

function SourceDetail({ source, localizeTarget = false, inline = false }: { source: AssessmentSource; localizeTarget?: boolean; inline?: boolean }) {
  const t = useTranslations('assessment');
  const label = (group: string, value?: string) => t(`${group}.${value && t.has(`${group}.${value}`) ? value : 'unknown'}`);
  let target = source.target || t('unknownTarget');
  if (localizeTarget && source.target) {
    if (['mail_field', 'mail_body', 'mail_range'].includes(source.kind ?? '') && mailTargets.has(source.target)) target = t(`sourceTargets.mail.${source.target}`);
    else if (['tool_observation', 'tool_range', 'tool_field'].includes(source.kind ?? '') && toolTargets.has(source.target)) target = t(`sourceTargets.tools.${source.target}`);
    else if (source.kind === 'mail_identity' && source.target === 'primary mail identity') target = t('sourceTargets.mailIdentity');
  }
  const content = <div className="min-w-0 space-y-2 border-t border-border p-3">
      <div className="flex flex-wrap gap-2"><Badge variant="outline" className="h-auto max-w-full whitespace-normal break-all">{label('sourceKinds', source.kind)}{source.kind && !t.has(`sourceKinds.${source.kind}`) ? ` (${source.kind})` : ''}</Badge><Badge variant="outline" className="h-auto max-w-full whitespace-normal">{label('outcomes', source.outcome)}</Badge></div>
      <p>{source.truncated || source.extraction ? t('excerpt') : t('complete')}</p>
      <p className="text-muted-foreground">{t('retained', { retained: source.retained_bytes ?? 0, original: source.original_bytes ?? 0 })}</p>
      {source.truncated ? <p data-testid="assessment-retained-range">{t('retainedRange', { start: 0, end: source.retained_bytes ?? 0, bytes: source.original_bytes ?? 0 })}</p> : null}
      {source.truncated ? <p>{t('retentionScope')}</p> : null}
      {source.captured_truncated ? <p>{t('captureIncomplete')}</p> : null}
      {source.extraction ? <div className="space-y-1">
        <p>{t('extractionRange', { start: source.extraction.start_byte ?? 0, end: source.extraction.end_byte ?? 0, bytes: source.extraction.parent_bytes ?? 0 })}</p>
        <p className="break-words">{t('parentSource', { key: source.extraction.parent_key || t('unknownTarget') })}</p>
        <p>{t('parentOutcome', { value: label('outcomes', source.extraction.parent_outcome) })}</p>
        {source.extraction.parent_truncated ? <p>{t('parentIncomplete')}</p> : null}
      </div> : null}
      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]" data-testid="assessment-source-content">{source.content || t('emptyContent')}</p>
    </div>;
  if (inline) return <section className="min-w-0 rounded-md border border-border bg-muted/20" data-testid="assessment-source">
    <h6 className="break-words p-3 font-medium">{t('source', { target })}</h6>
    {content}
  </section>;
  return <details className="min-w-0 rounded-md border border-border bg-muted/20" data-testid="assessment-source">
    <summary className="cursor-pointer break-words rounded-md p-3 font-medium hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">{t('source', { target })}</summary>
    {content}
  </details>;
}
