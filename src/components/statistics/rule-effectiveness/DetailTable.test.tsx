import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailTable } from './DetailTable';
import type { RuleEffectivenessRow } from '@/lib/api/rule-effectiveness-view';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === 'tenantLabel') return `租户：${values?.name}（ID ${values?.id}）`;
    if (key === 'tenantUnknown') return '未知租户';
    if (key === 'versionBadge') return `v${values?.version}`;
    if (key === 'versionHistory.hits') return `命中 ${values?.count} 次`;
    if (key === 'versionHistory.change') return `${values?.field}：${values?.before} → ${values?.after}`;
    if (key === 'versionHistory.actionField') return '执行动作';
    return key;
  },
}));

vi.mock('echarts-for-react', () => ({ default: () => <canvas /> }));

const row = {
  version_no: 1, history_count: 0, effective_at: '2026-09-01T00:00:00Z', superseded_at: null, close_reason: '', change_summary: 'first_observation', snapshot_available: true,
  time_zone: 'Asia/Shanghai',
  id: 'period-1',
  tenant_id: 12,
  tenant_name: '晨星科技',
  policy_module: 'auth_spoofing',
  sub_strategy_id: 'rule:sender-1',
  sub_strategy_name_snapshot: '发信人规则',
  observed_since: '2026-09-01',
  observed_days: 19,
  hits: 2,
  observation_period_id: 'period-1',
  distinct_message_count: 1,
  configured_action: 'reject',
  mixed_config: false,
  pending_outcome_count: 0,
  other_outcome_count: 0,
  unknown_outcome_count: 0,
  action_difference_rate: 0.5,
  risk_unavailable_reason: '',
  risk_direction: 'configured_block',
  attribution_status: 'attributable',
  action_breakdown: [],
  config_path: '/security/pipeline?module=senderFilter',
  is_deleted: false, false_positive_rate: 0.5, false_negative_rate: null, version_history: [],
};

describe('rule effectiveness detail table', () => {
  it('keeps the prototype version history and omits custom snapshot controls', () => {
    render(<DetailTable rows={[row as RuleEffectivenessRow]} totalCount={1} page={1} pageSize={20} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);

    expect(screen.queryByTestId('rule-effectiveness-tenant-period-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'expandRow'}));
    expect(screen.getByText('versionHistory.empty')).toBeInTheDocument();
    expect(screen.queryByTestId('observation-snapshot-period-1')).not.toBeInTheDocument();
  });

  it('projects the action difference into separate false-positive and false-negative columns', () => {
    const { rerender } = render(<DetailTable rows={[row as RuleEffectivenessRow]} totalCount={1} page={1} pageSize={20} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    expect(screen.getByTestId('rule-effectiveness-fp-risk-period-1')).toHaveTextContent('50.0%');
    expect(screen.getByTestId('rule-effectiveness-fn-risk-period-1')).toHaveTextContent('notApplicable');

    const configuredAccept = {
      ...row,
      risk_direction: 'configured_accept',
      configured_action: 'accept',
      false_positive_rate: null,
      false_negative_rate: 0.25,
    };
    rerender(<DetailTable rows={[configuredAccept as RuleEffectivenessRow]} totalCount={1} page={1} pageSize={20} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    expect(screen.getByTestId('rule-effectiveness-fp-risk-period-1')).toHaveTextContent('notApplicable');
    expect(screen.getByTestId('rule-effectiveness-fn-risk-period-1')).toHaveTextContent('25.0%');
  });

  it('shows both risk columns as not applicable when the configured action is proceed', () => {
    const proceed = {
      ...row,
      risk_direction: '',
      configured_action: 'proceed',
      false_positive_rate: null,
      false_negative_rate: null,
      risk_unavailable_reason: 'unsupported_configured_action',
    };

    render(<DetailTable rows={[proceed as RuleEffectivenessRow]} totalCount={1} page={1} pageSize={20} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);

    expect(screen.getByTestId('rule-effectiveness-fp-risk-period-1')).toHaveTextContent('notApplicable');
    expect(screen.getByTestId('rule-effectiveness-fn-risk-period-1')).toHaveTextContent('notApplicable');
  });

  it('lists the current version before superseded versions for direct comparison', () => {
    const versioned = {
      ...row,
      version_no: 2,
      hits: 5,
      observed_since: '2026-09-22',
      version_history: [{
        version_no: 1,
        effective_at: '2026-09-22T09:51:33Z',
        superseded_at: '2026-09-22T09:53:15Z',
        change_type: 'substantive' as const,
        change_summary: '首次开启观察',
        hits: 1,
      }],
      current_version_changes: [{
        field: 'envelope_header_mismatch.action',
        before: 'quarantine',
        after: 'reject',
      }],
    };

    render(<DetailTable rows={[versioned as RuleEffectivenessRow]} totalCount={1} page={1} pageSize={20} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name:'expandRow'}));

    const current = screen.getByTestId('rule-effectiveness-version-period-1-2');
    const previous = screen.getByTestId('rule-effectiveness-version-period-1-1');
    expect(current).toHaveTextContent('v2');
    expect(current).toHaveTextContent('versionHistory.current');
    expect(current).toHaveTextContent('命中 5 次');
    expect(current).toHaveTextContent('执行动作：quarantine → reject');
    expect(previous).toHaveTextContent('v1');
    expect(previous).toHaveTextContent('命中 1 次');
    expect(previous).toHaveTextContent('首次开启观察');
    expect(current.compareDocumentPosition(previous) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
