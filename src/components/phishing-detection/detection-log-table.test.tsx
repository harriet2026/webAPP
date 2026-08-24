import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { DetectionLogItem } from '@/types/phishing-detection';
import { DetectionLogTable } from './detection-log-table';

const apiRequest = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest, effectiveTenantId: 7 }),
}));

const base: DetectionLogItem = {
  sideline_id: 'sideline-12743', message_id: 'message-12743', sender: 'sender@example.com', subject: 'GT-12743 regression',
  recipients: ['a@example.com', 'b@example.com'], direction: 'inbound', status: 'reinjected', sidelined_at: '2026-08-03T09:40:18+08:00',
  risk_level: 'medium', policy_disposition: 'audit', task_status: 'completed', failure_reason: null, confidence: 0.55,
  recalls: [], disposition_actions: [], mail_log_id: 42, display_statuses: [{ status: 'delivered', count: 1 }, { status: 'quarantine_pending', count: 1 }],
  recipient_dispositions: [
    { recipient: 'a@example.com', final_action: 'accept', status: 'delivered' },
    { recipient: 'b@example.com', final_action: 'quarantine', status: 'quarantined', object_id: 'q-1' },
  ],
  disposition: 'audit', detection_mode: 'realtime', recall_status: 'none', agent_rounds: 5,
  url_summary: { total: 0, phishing: 0, suspicious: 0, normal: 0 }, result_truncated: false,
};

function renderTable(item: DetectionLogItem, onOpenDetail = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><NextIntlClientProvider locale="zh" messages={zh as never}><DetectionLogTable data={[item]} onOpenDetail={onOpenDetail} /></NextIntlClientProvider></QueryClientProvider>);
  return onOpenDetail;
}

describe('DetectionLogTable policy read model', () => {
  it('renders policy disposition and the authoritative display-status badge with one detail action', () => {
    const open = renderTable(base);
    expect(screen.getByTestId('phishing-log-table')).toHaveClass('shadow-sm');
    expect(screen.getByTestId('phishing-log-table').className).not.toContain('rgba(');
    expect(screen.getByTestId('phishing-log-row-sideline-12743')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-log-cell-sideline-12743-mail_status')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-log-detail-sideline-12743')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '执行动作' })).toBeInTheDocument();
    expect(screen.getByText('审核')).toBeInTheDocument();
    expect(screen.getByText(/隔离中 1/)).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByText(/投递成功/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '拦截' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '豁免' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(open).toHaveBeenCalledWith('sideline-12743');
  });

  it('exposes both URL disclosure controls and semantic expanded styling', () => {
    renderTable({ ...base, url_summary: { total: 2, phishing: 1, suspicious: 0, normal: 1 } });
    const summary = screen.getByTestId('phishing-log-url-summary-sideline-12743');
    expect(screen.getByTestId('phishing-log-expand-sideline-12743')).toHaveAttribute('aria-expanded', 'false');
    expect(summary).toHaveAccessibleName();
    fireEvent.click(summary);
    const expandedSummary = screen.getByTestId('phishing-log-url-summary-sideline-12743');
    expect(expandedSummary).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('phishing-log-expand-sideline-12743')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('phishing-log-expanded-sideline-12743')).toHaveClass('bg-muted/30');
    expect(screen.getByTestId('phishing-log-expanded-sideline-12743')).not.toHaveClass('bg-[#fbfcff]');
    fireEvent.click(expandedSummary);
    expect(screen.getByTestId('phishing-log-url-summary-sideline-12743')).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders null policy facts as undecided instead of inferring a risk', () => {
    renderTable({ ...base, risk_level: null, policy_disposition: null });
    expect(screen.getAllByText('未判定')).toHaveLength(2);
  });

  it('renders URL totals and risk counts from the URL summary DTO', () => {
    renderTable({ ...base, url_summary: { total: 4, phishing: 3, suspicious: 1, normal: 0 } });
    expect(screen.getByText('4 链接')).toBeInTheDocument();
    expect(screen.getByTitle('钓鱼')).toHaveTextContent('3');
    expect(screen.getByTitle('可疑')).toHaveTextContent('1');
    expect(screen.queryByTitle('正常')).not.toBeInTheDocument();
  });
});
