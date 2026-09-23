import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import zh from '@/../messages/zh.json';
import { InvestigationAssessment } from './investigation-assessment';
import { UrlFindingsTable } from './url-findings-table';
import { cliMockDetail } from '../../../tests/fixtures/phish-ui-real-data/mock-detail';

const cases = [
  ['phishing_suspected', '疑似钓鱼', 'standard'],
  ['suspicious', '可疑', 'standard'],
  ['safe', '安全', 'standard'],
  ['needs_review', '需要复核', 'standard'],
  ['phishing', '疑似钓鱼', 'legacy'],
  ['benign', '安全', 'legacy'],
  ['normal', '安全', 'legacy'],
  ['malicious', '历史结果未映射', 'unmapped'],
  ['observed', '缺少有效判定', 'observed'],
  ['', '未返回判断', 'missing'],
  [undefined, '未返回判断', 'missing'],
  ['future_verdict', '结果无法识别', 'invalid'],
  ['SAFE', '结果无法识别', 'invalid'],
] as const;

describe('mail verdict compatibility and unvalidated historical URLs', () => {
  it.each(cases)('keeps mail %s as %s while historical URL findings remain unvalidated', (verdict, label, state) => {
    const investigation = { ...cliMockDetail.investigation!, result: { ...cliMockDetail.investigation!.result, verdict } };
    render(<NextIntlClientProvider locale="zh" messages={zh}>
      <InvestigationAssessment summary={cliMockDetail.summary} investigation={investigation} />
      <UrlFindingsTable findings={[{ url: 'https://example.test/', agent: { verdict, risk_level: 'high' } }]} />
    </NextIntlClientProvider>);
    const displays = screen.getAllByTestId('phishing-verdict-display');
    expect(displays).toHaveLength(1);
    for (const display of displays) {
      expect(display).toHaveAttribute('data-verdict-state', state);
      expect(within(display).getByText(label, { exact: true })).toBeInTheDocument();
      if (state === 'legacy') expect(display).toHaveTextContent('历史兼容转换');
      if (label === '安全') expect(display).toHaveTextContent('仅限本次检查范围');
      if (['legacy', 'unmapped', 'observed', 'invalid'].includes(state)) {
        fireEvent.click(within(display).getByText('查看原值'));
        expect(within(display).getByText(verdict!, { exact: true })).toBeInTheDocument();
      }
    }
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent(/^—$/);
    expect(within(cells[1]).getByTestId('url-verdict')).toHaveTextContent('未校验');
    expect(cells[1]).toHaveTextContent(`原始输出：${verdict || '∅'} / high`);
    // A safe verdict must not rewrite the authoritative tenant policy.
    expect(screen.getByTestId('phishing-policy-risk')).toHaveTextContent('中危');
    expect(screen.getByTestId('phishing-policy-assessment')).toHaveTextContent('隔离');
  });

  it('keeps an unknown original value as text without executing markup', () => {
    const verdict = '<img src=x onerror=alert(1)>';
    const { container } = render(<NextIntlClientProvider locale="zh" messages={zh}>
      <UrlFindingsTable findings={[{ url: 'https://example.test/', agent: { verdict } }]} />
    </NextIntlClientProvider>);
    expect(screen.getByText(`原始输出：${verdict} / ∅`)).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
  });
});
