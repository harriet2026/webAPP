import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import zh from '../../messages/zh.json';
import { AssessmentReportView } from '@/components/agent-center/assessment-report';
import { InvestigationAssessment } from '@/components/phishing-detection/investigation-assessment';
import { cliReportPropsZh, serviceMail7Zh, serviceMail8Zh } from '../fixtures/phish-ui-real-data/zh';
import rawCli from '../fixtures/phish-ui-real-data/raw/cli-mail8-success.report-props.json';
import rawMail7 from '../fixtures/phish-ui-real-data/raw/service-mail7-budget-exceeded.detail.json';
import rawMail8 from '../fixtures/phish-ui-real-data/raw/service-mail8-reference-invalid.detail.json';
import type { AssessmentResultFields } from '@/types/agent-assessment';
import type { ReactNode } from 'react';

function show(content: ReactNode) {
  return render(<NextIntlClientProvider locale="zh" messages={zh}>{content}</NextIntlClientProvider>);
}

describe('phishing assessment with independent real captures', () => {
  it('preserves every original factor and reference in its original order', () => {
    show(<AssessmentReportView {...cliReportPropsZh} layout="findings" />);
    const cards = screen.getAllByTestId('assessment-factor');
    const factors = cliReportPropsZh.result.assessment_report!.factors!;
    expect(cards).toHaveLength(11);
    factors.forEach((factor, index) => {
      const card = within(cards[index]);
      expect(card.getByRole('heading', { level: 5 })).toHaveTextContent(factor.observation!);
      expect(card.getByTestId('assessment-strength')).toHaveTextContent(zh.assessment.strengths[factor.strength as keyof typeof zh.assessment.strengths]);
      const sources = card.getByTestId('assessment-factor-sources');
      expect(sources).not.toHaveAttribute('open');
      expect(within(sources).getAllByTestId('assessment-source')).toHaveLength(factor.source_refs.length);
      factor.source_refs.forEach((ref, sourceIndex) => {
        const source = cliReportPropsZh.result.assessment_report!.sources!.find((item) => item.id === ref)!;
        expect(within(sources).getAllByTestId('assessment-source-content')[sourceIndex].textContent).toBe(source.content);
      });
    });
    expect(screen.getAllByText(zh.assessment.findings.directions.supports_threat)).toHaveLength(6);
    expect(screen.getAllByText(zh.assessment.findings.directions.limits_certainty)).toHaveLength(5);
    expect(screen.queryByText(zh.assessment.findings.directions.supports_legitimate)).not.toBeInTheDocument();
    expect(screen.queryByText('本次调查邮件')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('assessment-uncited-sources')).getAllByTestId('assessment-source')).toHaveLength(2);
    const gaps = screen.getByTestId('assessment-gaps');
    expect(gaps).toHaveTextContent(zh.assessment.omittedSources.replace('{count}', '7'));
    expect(gaps).toHaveTextContent(zh.assessment.omittedGaps.replace('{count}', '2'));
    cliReportPropsZh.result.assessment_report!.gaps!.forEach((gap) => expect(gaps).toHaveTextContent(gap.detail!));
  });

  it.each([serviceMail7Zh, serviceMail8Zh])('keeps the tenant grade and failure reason alongside the expanded model summary', (detail) => {
    show(<><InvestigationAssessment summary={detail.summary} investigation={detail.investigation!} /><AssessmentReportView result={detail.investigation!.result} layout="findings" /></>);
    expect(screen.getByTestId('phishing-policy-risk')).toHaveTextContent(zh.phishingDetection.riskLevel.medium);
    expect(screen.getByTestId('phishing-policy-assessment')).toHaveTextContent(zh.phishingDetection.policyDisposition.quarantine);
    expect(screen.getByTestId('phishing-model-summary').closest('details')).toBeNull();
    expect(screen.getByTestId('phishing-model-summary')).toHaveTextContent(detail.investigation!.result!.summary!);
    expect(screen.getByTestId('phishing-model-verdict')).not.toHaveAttribute('open');
    expect(screen.getByText(zh.assessment.reasons[detail.investigation!.result!.assessment_report_reason as keyof typeof zh.assessment.reasons])).toBeInTheDocument();
    expect(screen.queryByTestId('assessment-factor')).not.toBeInTheDocument();
  });

  it('does not infer a missing tenant grade or strategy from the model verdict', () => {
    const summary = { ...serviceMail8Zh.summary, risk_level: null, policy_disposition: null, confidence: NaN };
    show(<InvestigationAssessment summary={summary} investigation={serviceMail8Zh.investigation!} />);
    expect(screen.getByTestId('phishing-policy-risk')).toHaveTextContent(zh.assessment.presentation.undecided);
    expect(screen.getByTestId('phishing-policy-assessment')).toHaveTextContent(zh.phishingDetection.policyDisposition.undecided);
    expect(screen.getByTestId('phishing-policy-assessment')).not.toHaveTextContent('NaN');
  });

  it('limits translations to display text and preserves each run’s non-text data', () => {
    for (const [translated, original] of [[serviceMail7Zh, rawMail7], [serviceMail8Zh, rawMail8]] as const) {
      const restored = structuredClone(translated);
      restored.investigation!.summary = original.investigation.summary;
      restored.investigation!.result!.summary = original.investigation.result.summary;
      expect(restored).toEqual(original);
    }
    const restored = structuredClone(cliReportPropsZh);
    const report = restored.result.assessment_report!;
    const raw = rawCli.result.assessment_report;
    report.subjects![0].label = raw.subjects[0].label;
    report.factors!.forEach((factor, index) => {
      const { observation, relevance, limitation } = raw.factors[index];
      Object.assign(factor, { observation, relevance, limitation });
    });
    report.gaps!.forEach((gap, index) => { gap.detail = raw.gaps[index].detail; });
    expect(restored).toEqual(rawCli);
  });

  it('preserves subject identity, unknown targets and retained ranges in synthetic edge cases', () => {
    const result: AssessmentResultFields = structuredClone(cliReportPropsZh.result);
    const report = result.assessment_report!;
    report.subjects!.push({ id: 'second', kind: 'url', label: 'Second subject' });
    report.factors![0].direction = 'supports_legitimate';
    const source = report.sources!.find((item) => item.id === report.factors![0].source_refs[0])!;
    Object.assign(source, { kind: 'future_source', target: 'subject', truncated: true, retained_bytes: 12, original_bytes: 9000, content: '<script>unsafe()</script>' });
    const { container } = show(<AssessmentReportView result={result} layout="findings" />);
    expect(screen.getByRole('heading', { name: '本次调查邮件' })).toBeInTheDocument();
    expect(screen.getByText('Second subject')).toBeInTheDocument();
    expect(screen.getByText(zh.assessment.findings.directions.supports_legitimate)).toBeInTheDocument();
    expect(screen.getAllByTestId('assessment-retained-range')[0]).toHaveTextContent('9000');
    expect(screen.getByText(zh.assessment.source.replace('{target}', 'subject'))).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('gates unsupported reports before rendering new factor cards', () => {
    show(<AssessmentReportView result={{ assessment_report_status: 'available', assessment_report: { schema_version: 99 } }} layout="findings" />);
    expect(screen.getByTestId('assessment-state')).toHaveTextContent(zh.assessment.states.unsupported);
    expect(screen.queryByTestId('assessment-factor')).not.toBeInTheDocument();
  });
});
