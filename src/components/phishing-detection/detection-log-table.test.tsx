import { fireEvent, render, screen, within } from '@testing-library/react';
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
  it.each(['audit_pending', 'delivered'] as const)('GT-14345: distinguishes the quarantine policy from actual audit with status %s', (status) => {
    renderTable({ ...base, direction: 'outbound', policy_disposition: 'quarantine', disposition: 'audit',
      disposition_actions: ['audit'],
      recipient_dispositions: [{ recipient: 'outside@example.com', final_action: 'audit', status: status === 'delivered' ? 'delivered' : 'pending_review', object_kind: 'outbound_audit' }],
      display_statuses: [{ status, count: 1 }],
    });
    const action = screen.getByTestId('phishing-log-disposition-sideline-12743');
    expect(action).toHaveTextContent('审核');
    expect(action).not.toHaveTextContent('隔离');
    expect(screen.getByText('策略动作：隔离')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-log-cell-sideline-12743-mail_status')).toHaveTextContent(status === 'delivered' ? '投递成功' : '待审核');
  });

  it('GT-14345: preserves different actual actions for mixed recipients', () => {
    renderTable({ ...base, policy_disposition: 'quarantine', disposition_actions: ['audit', 'quarantine'],
      recipient_dispositions: [
        { recipient: 'inside@example.com', final_action: 'quarantine', status: 'quarantined' },
        { recipient: 'outside@example.com', final_action: 'audit', status: 'pending_review' },
      ],
    });
    const action = within(screen.getByTestId('phishing-log-disposition-sideline-12743'));
    expect(action.getByText('审核')).toBeInTheDocument();
    expect(action.getByText('隔离')).toBeInTheDocument();
  });

  it('GT-14345: never presents an observe policy as an executed quarantine', () => {
    renderTable({ ...base, detection_mode: 'observe', policy_disposition: 'quarantine', disposition: 'pass',
      disposition_actions: ['accept'], recipient_dispositions: [{ recipient: 'a@example.com', final_action: 'accept', status: 'delivered' }],
    });
    expect(screen.getByTestId('phishing-log-disposition-sideline-12743')).toHaveTextContent('投递');
    expect(screen.getByText('策略动作：隔离')).toBeInTheDocument();
  });

  it('GT-14345: displays unknown when execution facts are absent, without falling back to policy', () => {
    renderTable({ ...base, policy_disposition: 'quarantine', disposition_actions: [], recipient_dispositions: [] });
    expect(screen.getByTestId('phishing-log-disposition-sideline-12743')).toHaveTextContent('未知');
  });

  it('GT-14345: uses aggregate execution facts for historical rows without recipient details', () => {
    renderTable({ ...base, policy_disposition: 'quarantine', disposition_actions: ['audit'], recipient_dispositions: [] });
    expect(screen.getByTestId('phishing-log-disposition-sideline-12743')).toHaveTextContent('审核');
  });

  it('exposes a stable loading state instead of the empty state', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><NextIntlClientProvider locale="zh" messages={zh as never}><DetectionLogTable data={[]} isLoading onOpenDetail={vi.fn()} /></NextIntlClientProvider></QueryClientProvider>);
    expect(screen.getByTestId('phishing-log-loading')).toBeInTheDocument();
    expect(screen.queryByText('暂无检测记录')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '详情' })).not.toBeInTheDocument();
  });

  it('renders actual dispositions separately from policy and the authoritative mail status', () => {
    const open = renderTable(base);
    expect(screen.getByTestId('phishing-log-table')).toHaveClass('shadow-sm');
    expect(screen.getByTestId('phishing-log-table').className).not.toContain('rgba(');
    expect(screen.getByTestId('phishing-log-row-sideline-12743')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-log-cell-sideline-12743-mail_status')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-log-detail-sideline-12743')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '执行动作' })).toBeInTheDocument();
    expect(screen.getByText('策略动作：审核')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-log-disposition-sideline-12743')).toHaveTextContent('投递隔离');
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
    expect(screen.getByText('未判定')).toBeInTheDocument();
    expect(screen.getByText('策略动作：未判定')).toBeInTheDocument();
  });

  it('GT-13539: keeps undecided risk and unknown execution neutral', () => {
    renderTable({ ...base, risk_level: null, policy_disposition: null, recipient_dispositions: [], disposition_actions: [] });
    const risk = screen.getByTestId('phishing-log-risk-sideline-12743');
    const disposition = within(screen.getByTestId('phishing-log-disposition-sideline-12743')).getByText('未知');
    expect(risk).toHaveTextContent('未判定');
    expect(risk).not.toHaveClass('bg-primary');
    expect(risk).toHaveClass('bg-muted/40', 'text-muted-foreground');
    expect(disposition).toHaveClass('bg-muted/40', 'text-muted-foreground');
  });

  it('GT-13539: keeps the decided risk colour', () => {
    renderTable({ ...base, risk_level: 'high' });
    expect(screen.getByTestId('phishing-log-risk-sideline-12743')).toHaveClass('bg-rose-500/15');
  });

  it('marks a historical aggregate without claiming validated categories', () => {
    renderTable({ ...base, url_summary: { total: 4, phishing: 3, suspicious: 1, normal: 0 } });
    expect(screen.getByText('4 链接')).toBeInTheDocument();
    expect(screen.getByText('历史摘要（分类未校验）')).toBeInTheDocument();
    expect(screen.queryByTitle('钓鱼')).not.toBeInTheDocument();
    expect(screen.queryByTitle('可疑')).not.toBeInTheDocument();
    expect(screen.queryByTitle('正常')).not.toBeInTheDocument();
  });
});

it('shows all five categories and both quality buckets, including safe alongside threats', () => {
 renderTable({...base,url_summary:{version:2,legacy:false,total:7,phishing:1,malicious:1,suspicious:1,safe:1,normal:1,needs_review:1,invalid:1,unvalidated:1},result_truncated:true});
 for (const label of ['钓鱼','恶意','可疑','安全','需要复核','结果异常','未校验']) expect(screen.getByTitle(label)).toHaveTextContent('1');
 expect(screen.getByText('7 链接')).toBeInTheDocument();
 expect(screen.getByText('仅统计已保留的 URL 结果')).toBeInTheDocument();
});
