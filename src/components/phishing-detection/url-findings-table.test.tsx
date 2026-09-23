import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import zh from '@/../messages/zh.json';
import { UrlFindingsTable } from './url-findings-table';
import { cliMockDetail } from '../../../tests/fixtures/phish-ui-real-data/mock-detail';
import { serviceMail7Zh, serviceMail8Zh } from '../../../tests/fixtures/phish-ui-real-data/zh';

describe('URL result labels', () => {
  for (const embedded of [false, true]) {
    it.each([cliMockDetail, serviceMail7Zh, serviceMail8Zh])(`keeps historical output visibly unvalidated (embedded=${embedded})`, (detail) => {
      render(<NextIntlClientProvider locale="zh" messages={zh}>
        <UrlFindingsTable findings={detail.investigation!.result!.details!.url_findings!} embedded={embedded} />
      </NextIntlClientProvider>);
      const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell');
      expect(within(cells[1]).getByTestId('url-verdict')).toHaveTextContent(/^未校验$/);
      expect(cells[1]).toHaveTextContent('phishing_suspected');
      expect(cells[2]).toHaveTextContent('—');
    });
  }

  it.each(['phishing', 'suspicious', 'malicious', 'benign', 'safe', 'future_verdict', ''])('retains the raw historical value %s without a validation claim', (verdict) => {
    render(<NextIntlClientProvider locale="zh" messages={zh}>
      <UrlFindingsTable findings={[{ url: 'https://example.test/', agent: { verdict } }]} />
    </NextIntlClientProvider>);
    const cell = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[1];
    expect(within(cell).getByTestId('url-verdict')).toHaveTextContent(/^未校验$/);
    if (verdict) expect(cell).toHaveTextContent(verdict);
  });
});

it('keeps invalid safe output separate from a valid safe verdict and reviewable evidence', () => {
  render(<NextIntlClientProvider locale="zh" messages={zh}>
    <UrlFindingsTable findings={[
      { url: 'https://valid.test/', agent: { verdict: 'safe', risk_level: 'low' }, validation: { status: 'valid', code: '', contract_version: 'url-verdict.v1' } },
      { url: 'https://invalid.test/', agent: { verdict: 'safe', risk_level: 'high' }, validation: { status: 'invalid', code: 'verdict_risk_conflict', contract_version: 'url-verdict.v1' } },
      { url: 'https://review.test/', agent: { verdict: 'needs_review', risk_level: 'medium' }, validation: { status: 'valid', code: '', contract_version: 'url-verdict.v1' } },
      { url: 'https://old.test/', agent: { verdict: 'benign', risk_level: 'low' } },
    ]} />
  </NextIntlClientProvider>);
  const rows = screen.getAllByRole('row');
  expect(within(rows[1]).getByTestId('url-verdict')).toHaveTextContent(/^安全$/);
  expect(within(rows[2]).getByTestId('url-verdict')).toHaveTextContent(/^结果异常$/);
  expect(rows[2]).toHaveTextContent('判定与风险等级冲突');
  expect(rows[2]).toHaveTextContent('safe / high');
  expect(within(rows[3]).getByTestId('url-verdict')).toHaveTextContent(/^需要复核$/);
  expect(within(rows[4]).getByTestId('url-verdict')).toHaveTextContent(/^未校验$/);
});
