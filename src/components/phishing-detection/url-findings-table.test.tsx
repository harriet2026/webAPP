import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/api/client', async (load) => ({ ...await load<typeof import('@/lib/api/client')>(), useApiRequest: () => ({ apiRequest: vi.fn(), effectiveTenantId: 2 }) }));
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
      expect(within(cells[2]).getByRole('button')).toHaveTextContent('查看');
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


it('opens a URL detail with the same validated result and no threat type column', async () => {
  render(<NextIntlClientProvider locale="zh" messages={zh}>
    <UrlFindingsTable findings={[{ url: 'https://evil.test/', agent: { verdict: 'malicious', risk_level: 'high' }, validation: { status: 'valid', contract_version: 'url-verdict.v1' } }]} />
  </NextIntlClientProvider>);
  expect(screen.queryByRole('columnheader', { name: '威胁类型' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /查看/ }));
  const drawer = await screen.findByTestId('phishing-url-detail-sheet');
  expect(within(drawer).getByTestId('url-verdict')).toHaveTextContent(/^恶意$/);
});


it('keeps screenshot-only captures in API order inside the drawer, including failed captures', async () => {
  render(<NextIntlClientProvider locale="zh" timeZone="UTC" messages={zh}>
    <UrlFindingsTable findings={[]} screenshots={[
      { task_id: 't', attempt_id: 'a', fetch_id: '2', url: 'https://capture.test/', captured_at: '2026-09-24T12:00:00Z', screenshot_omitted: 'screenshot_save_failed' },
      { task_id: 't', attempt_id: 'a', fetch_id: '1', url: 'https://capture.test/', final_url: 'https://capture.test/landing', captured_at: '2026-09-23T12:00:00Z', screenshot_omitted: 'future_reason' },
    ]} screenshotsOmittedCount={2} />
  </NextIntlClientProvider>);
  expect(screen.getByText('仅截图记录，无 URL 判定')).toBeInTheDocument();
  expect(screen.getByText('受结果容量限制，另有 2 条截图记录未展示。')).toBeInTheDocument();
  expect(screen.queryByTestId('phishing-screenshot')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /查看/ }));
  const drawer = await screen.findByTestId('phishing-url-detail-sheet');
  expect(within(drawer).getByText('仅截图记录，无 URL 判定')).toBeInTheDocument();
  const captures = within(drawer).getAllByTestId('phishing-screenshot');
  expect(captures[0]).toHaveTextContent('截图 1');
  expect(captures[0]).toHaveTextContent('截图保存失败');
  expect(captures[0].querySelector('time')).toHaveAttribute('dateTime', '2026-09-24T12:00:00Z');
  expect(captures[1]).toHaveTextContent('截图未保存');
  expect(captures[1]).toHaveTextContent('https://capture.test/landing');
});

it('uses retained tool observations for the selected URL without borrowing another URL or guessing trust', async () => {
  const source = (id: string, tool: string, query: Record<string, unknown>, observation: Record<string, unknown>) => ({ id, kind: 'tool_observation', target: tool, outcome: 'observed', content: JSON.stringify({ tool, query, observation }) });
  render(<NextIntlClientProvider locale="zh" messages={zh}>
    <UrlFindingsTable findings={[{ url: 'https://mail.test/login' }]} assessmentResult={{ assessment_report_status: 'available', assessment_report: { schema_version: 2, sources: [
      source('wrong', 'check_url_threat_intel', { url: 'https://mail.test/other' }, { url: 'https://mail.test/other', threat_type: 'THREAT' }),
      source('dns', 'dig', { domain: 'mail.test', record_type: 'A' }, { domain: 'mail.test', addresses: ['203.0.113.8'] }),
      source('age', 'lookup_domain_age', { domain: 'mail.test' }, { domain: 'mail.test', age_days: 42, registration_date: '2026-08-01' }),
      source('tls', 'inspect_tls_cert', { url: 'https://mail.test/login' }, { url: 'https://mail.test/login', self_signed: false, host_matches_san: true, chain_trusted: false }),
      source('fetch', 'web_fetch', { url: 'https://mail.test/login' }, { url: 'https://mail.test/login', final_url: 'https://mail.test/landing', redirect_chain: [{ url: 'https://mail.test/login' }, { url: 'https://mail.test/landing' }] }),
    ] } }} />
  </NextIntlClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: /查看/ }));
  const drawer = await screen.findByTestId('phishing-url-detail-sheet');
  expect(within(drawer).getByTestId('phishing-url-detail-link')).toHaveTextContent('203.0.113.8');
  expect(within(drawer).getByTestId('phishing-url-detail-domain')).toHaveTextContent('42');
  expect(within(drawer).getByTestId('phishing-url-detail-intel')).not.toHaveTextContent('THREAT');
  expect(within(drawer).getByTestId('phishing-url-detail-cert')).not.toHaveTextContent('信任链有效');
  expect(within(drawer).getByRole('list')).toHaveTextContent('https://mail.test/landing');
});

it.each(['partial', 'unavailable', 'conflict', 'unsupported'])('keeps %s evidence inconclusive and preserves original report access', async (state) => {
  const source = { id: 'intel', kind: 'tool_observation', target: 'check_url_threat_intel', outcome: state === 'partial' || state === 'unavailable' ? state : 'observed', content: JSON.stringify({ tool: 'check_url_threat_intel', query: { url: 'https://mail.test/' }, observation: { url: 'https://mail.test/', threat_type: 'SAFE' } }) };
  const sources = state === 'conflict' ? [source, { ...source, id: 'conflict', content: source.content.replace('SAFE', 'THREAT') }] : [source];
  render(<NextIntlClientProvider locale="zh" messages={zh}>
    <UrlFindingsTable findings={[{ url: 'https://mail.test/' }]} assessmentResult={{ assessment_report_status: 'available', assessment_report: { schema_version: state === 'unsupported' ? 99 : 2, sources } }} />
  </NextIntlClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: /查看/ }));
  const drawer = await screen.findByTestId('phishing-url-detail-sheet');
  expect(within(drawer).getByTestId('phishing-url-detail-intel')).toHaveTextContent('无可用留存证据');
  if (state !== 'unsupported') expect(within(drawer).getByTestId('phishing-url-detail-sources')).toHaveTextContent(source.content);
});

it.each([true, false])('interprets complete not_found only with matching negative tool facts (consistent=%s)', async (consistent) => {
  const url = 'https://mail.test/';
  const source = (id: string, tool: string, query: Record<string, unknown>, observation: Record<string, unknown>) => ({ id, kind: 'tool_observation', target: tool, outcome: 'not_found', content: JSON.stringify({ tool, query, observation }) });
  render(<NextIntlClientProvider locale="zh" messages={zh}>
    <UrlFindingsTable findings={[{ url }]} assessmentResult={{ assessment_report_status: 'available', assessment_report: { schema_version: 2, sources: [
      source('intel', 'check_url_threat_intel', { url }, { url, threat_type: consistent ? 'SAFE' : 'THREAT' }),
      source('rbl', 'check_rbl_blocklist', { domain: 'mail.test' }, { target: 'mail.test', listed: !consistent, listed_on: consistent ? [] : ['list.example'] }),
    ] } }} />
  </NextIntlClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: /查看/ }));
  const drawer = await screen.findByTestId('phishing-url-detail-sheet');
  expect(within(drawer).getByTestId('phishing-url-detail-intel')).toHaveTextContent(consistent ? 'SAFE' : '无可用留存证据');
  expect(within(drawer).getByTestId('phishing-url-detail-rbl')).toHaveTextContent(consistent ? '未命中' : '无可用留存证据');
  expect(within(drawer).getByTestId('phishing-url-detail-sources')).toHaveTextContent('查询成功，未命中');
});
