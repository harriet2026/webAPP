import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '@/../messages/en.json';
import zh from '@/../messages/zh.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';
import phish from '../../../../internal/api/testdata/assessment-responses/phish-available.json';
import empty from '../../../../internal/api/testdata/assessment-responses/phish-empty.json';
import pending from '../../../../internal/api/testdata/assessment-responses/phish-pending.json';
import legacy from '../../../../internal/api/testdata/assessment-responses/phish-legacy.json';
import unsupported from '../../../../internal/api/testdata/assessment-responses/phish-unsupported.json';
import failed from '../../../../internal/api/testdata/assessment-responses/phish-failed.json';
import spoof from '../../../../internal/api/testdata/assessment-responses/spoof-available.json';
import { AssessmentReportView } from './assessment-report';
import type { AssessmentResultFields } from '@/types/agent-assessment';

describe('retained assessment report', () => {
  it('opens the actual API source as text beside its observation and interpretation', () => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en}>
      <AssessmentReportView result={phish.investigation.result} />
    </NextIntlClientProvider>);
    expect(screen.getByRole('heading', { name: 'Synthetic invoice email' })).toBeInTheDocument();
    expect(screen.getByText('Supports threat')).toBeInTheDocument();
    expect(screen.getByText('Strength: Moderate')).toBeInTheDocument();
    expect(screen.getByText('The email requests urgent payment')).toBeInTheDocument();
    expect(screen.getByText('Urgency warrants checking the request')).toBeInTheDocument();
    expect(screen.getByText('Urgency alone does not prove fraud')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Source: body'));
    expect(screen.getByText(phish.investigation.result.assessment_report.sources[0].content)).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('No external reputation lookup was performed in this synthetic fixture.')).toBeInTheDocument();
  });

  it.each([
    [empty, 'No citable assessment factors were formed. This does not establish that the email is safe.'],
    [pending, 'Assessment report pending. No final report has been published.'],
    [legacy, 'Earlier result without a structured report.'],
    [unsupported, 'This report version is not supported. Its contents cannot be displayed.'],
    [failed, 'Investigation execution failed.'],
  ])('keeps actual API absence and valid-empty meanings distinct %#', (fixture, message) => {
    render(<NextIntlClientProvider locale="en" messages={en}>
      <AssessmentReportView result={fixture.investigation.result} />
    </NextIntlClientProvider>);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByTestId('assessment-factor')).not.toBeInTheDocument();
  });

  it('keeps uncited sources accessible with extraction, incomplete capture and omission limits', () => {
    // Presentation scenario derived from the actual zero-factor response.
    // These extra ranges/outcomes are not a claim of a real provider execution.
    const scenario: AssessmentResultFields = structuredClone(empty.investigation.result);
    const report = scenario.assessment_report!;
    report.sources = [{ ...report.sources![0], captured_truncated: true, extraction: {
      parent_key: 'captured-page', parent_bytes: 4096, parent_truncated: true,
      start_byte: 20, end_byte: 152, parent_outcome: 'partial',
    } }, { id: 'successful-empty', target: 'reputation', kind: 'tool_observation', outcome: 'empty' }];
    report.omitted_sources = 2;
    render(<NextIntlClientProvider locale="en" messages={en}><AssessmentReportView result={scenario} /></NextIntlClientProvider>);
    fireEvent.click(screen.getByText('Source: body'));
    expect(screen.getByText('Captured byte range [20, 152) of 4096 bytes')).toBeVisible();
    expect(screen.getByText('The parent capture was incomplete.')).toBeVisible();
    expect(screen.getByText('The captured source was already incomplete.')).toBeVisible();
    fireEvent.click(screen.getByText('Source: reputation'));
    expect(screen.getByText('Successful, empty result')).toBeVisible();
    expect(screen.getByText('Sources omitted: 2')).toBeInTheDocument();
  });

  it.each([
    ['en', en, 'Supports legitimate', 'Strength: Strong', 'Assessment subject', 'Subject label not recorded'],
    ['zh', zh, '支持正常', '强度：强', '判断对象', '未记录对象名称'],
    ['ru', ru, 'В пользу легитимности', 'Сила: Сильная', 'Объект оценки', 'Название объекта не записано'],
    ['th', th, 'สนับสนุนความถูกต้อง', 'น้ำหนัก: สูง', 'วัตถุที่ประเมิน', 'ไม่ได้บันทึกชื่อวัตถุ'],
  ] as const)('groups multiple subjects independently and safely labels unfamiliar metadata in %s', (locale, messages, direction, strength, kind, missingLabel) => {
    // UI stress scenario: affirmative strong legitimate factor plus long text.
    // The base multi-subject/shared-source shape is the actual AA-07 response.
    const scenario: AssessmentResultFields = structuredClone(spoof.investigation.result);
    const report = scenario.assessment_report!;
    report.factors![1] = { ...report.factors![1], direction: 'supports_legitimate', strength: 'strong' };
    report.subjects![2] = { ...report.subjects![2], kind: 'future_kind', label: '' };
    report.sources![0].content = 'x'.repeat(16000) + '<img src=x onerror=alert(1)>末尾';
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <AssessmentReportView result={scenario} />
    </NextIntlClientProvider>);
    const subjects = screen.getAllByTestId('assessment-subject');
    expect(subjects).toHaveLength(3);
    expect(within(subjects[1]).getByText(direction)).toBeInTheDocument();
    expect(within(subjects[1]).getByText(strength)).toBeInTheDocument();
    expect(within(subjects[0]).queryByText(direction)).not.toBeInTheDocument();
    expect(within(subjects[2]).getByText(kind)).toBeInTheDocument();
    expect(within(subjects[2]).getByText(missingLabel)).toBeInTheDocument();
    for (const source of screen.getAllByTestId('assessment-source')) {
      fireEvent.click(source.querySelector('summary')!);
      expect(within(source).getByTestId('assessment-source-content').textContent).toBe(report.sources![0].content);
    }
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not inspect an unsupported payload and keeps unknown presence on a safe error path', () => {
    const scenario: AssessmentResultFields = structuredClone(unsupported.investigation.result);
    Object.defineProperty(scenario.assessment_report, 'sources', { get() { throw new Error('Future content must not be read'); } });
    const { rerender } = render(<NextIntlClientProvider locale="en" messages={en}><AssessmentReportView result={scenario} /></NextIntlClientProvider>);
    expect(screen.getByText('Report version 99')).toBeInTheDocument();
    rerender(<NextIntlClientProvider locale="en" messages={en}><AssessmentReportView result={{ assessment_report_status: 'unexpected_status' }} /></NextIntlClientProvider>);
    expect(screen.getByRole('alert')).toHaveTextContent('The assessment detail could not be loaded safely. Please retry.');
    expect(screen.queryByTestId('assessment-factor')).not.toBeInTheDocument();
  });
  it('shows cited schema 2 retention bounds even when the factor has no limitation', () => {
    const scenario: AssessmentResultFields = structuredClone(phish.investigation.result);
    const report = scenario.assessment_report!;
    report.schema_version = 2;
    report.factors![0].limitation = '';
    report.sources![0] = { ...report.sources![0], content: 'Retained observation', truncated: true, retained_bytes: 20, original_bytes: 9000 };
    render(<NextIntlClientProvider locale="en" messages={en}><AssessmentReportView result={scenario} /></NextIntlClientProvider>);
    fireEvent.click(screen.getByText('Source: body'));
    expect(screen.getByTestId('assessment-retained-range')).toBeVisible();
    expect(screen.getByTestId('assessment-retained-range')).toHaveTextContent('Retained byte range [0, 20) of 9000 captured source bytes');
    expect(screen.getByText('Citations cover only this retained content, excluding omitted content.')).toBeVisible();
    expect(screen.getByText('Retained observation')).toBeVisible();
    expect(screen.getByText('No specific limitation stated.')).toBeInTheDocument();
  });

  it.each(['report_draft_invalid', 'report_reference_invalid', 'report_budget_exceeded'] as const)('separates %s from legacy and analysis fallback', (reason) => {
    render(<NextIntlClientProvider locale="en" messages={en}><AssessmentReportView result={{ assessment_report_status: 'not_recorded', assessment_report_reason: reason }} /></NextIntlClientProvider>);
    expect(screen.getByText(en.assessment.reasons[reason])).toBeInTheDocument();
    expect(screen.queryByText(en.assessment.reasons.legacy_result)).not.toBeInTheDocument();
    expect(screen.queryByTestId('assessment-factor')).not.toBeInTheDocument();
  });

  it('keeps new retention and failure translations complete in all four languages', () => {
    for (const messages of [zh, ru, th]) {
      expect(Object.keys(messages.assessment).sort()).toEqual(Object.keys(en.assessment).sort());
      expect(Object.keys(messages.assessment.reasons).sort()).toEqual(Object.keys(en.assessment.reasons).sort());
      for (const key of ['retainedRange', 'retentionScope'] as const) expect(messages.assessment[key]).toBeTruthy();
    }
  });

});
