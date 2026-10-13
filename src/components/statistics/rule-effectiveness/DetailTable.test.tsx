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
    if (key === 'versionHistory.changeSeparator') return '；';
    if (key === 'versionHistory.actionField') return '执行动作';
    if (key === 'fieldLabels.detectionWindow') return '检测窗口';
    if (key === 'fieldLabels.triggerCount') return '触发数量';
    if (key === 'versionHistory.unavailable.accessDenied') return '没有查看权限，变更详情不可用';
    return key;
  },
}));

const chartMock = vi.hoisted(() => vi.fn());

vi.mock('echarts-for-react', () => ({
  default: (props: unknown) => {
    chartMock(props);
    return <canvas />;
  },
}));

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
  it('keeps the prototype hit count as a single number even when message counts are available', () => {
    render(<DetailTable rows={[row as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    expect(screen.getByTestId('rule-effectiveness-hits-period-1')).toHaveTextContent(/^2$/);
  });

  it('keeps the prototype version history and omits custom snapshot controls', () => {
    render(<DetailTable rows={[row as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);

    expect(screen.queryByTestId('rule-effectiveness-tenant-period-1')).not.toBeInTheDocument();
    const expand = screen.getByRole('button', {name:'expandRow'});
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expand);
    expect(expand).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('versionHistory.empty')).toBeInTheDocument();
    expect(screen.queryByTestId('observation-snapshot-period-1')).not.toBeInTheDocument();
    fireEvent.click(expand);
    expect(expand).toHaveAttribute('aria-expanded', 'false');
  });

  it('projects the action difference into separate false-positive and false-negative columns', () => {
    const { rerender } = render(<DetailTable rows={[row as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    expect(screen.getByTestId('rule-effectiveness-fp-risk-period-1')).toHaveTextContent('50.0%');
    expect(screen.getByTestId('rule-effectiveness-fn-risk-period-1')).toHaveTextContent('notApplicable');

    const configuredAccept = {
      ...row,
      risk_direction: 'configured_accept',
      configured_action: 'accept',
      false_positive_rate: null,
      false_negative_rate: 0.25,
    };
    rerender(<DetailTable rows={[configuredAccept as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    expect(screen.getByTestId('rule-effectiveness-fp-risk-period-1')).toHaveTextContent('notApplicable');
    expect(screen.getByTestId('rule-effectiveness-fn-risk-period-1')).toHaveTextContent('25.0%');
  });

  it('shows both risk columns as unavailable whenever the backend supplies a reason', () => {
    const proceed = {
      ...row,
      risk_direction: '',
      configured_action: 'proceed',
      false_positive_rate: null,
      false_negative_rate: null,
      risk_unavailable_reason: 'unsupported_configured_action',
    };

    render(<DetailTable rows={[proceed as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);

    expect(screen.getByTestId('rule-effectiveness-fp-risk-period-1')).toHaveTextContent(/^—$/);
    expect(screen.getByTestId('rule-effectiveness-fn-risk-period-1')).toHaveTextContent(/^—$/);
  });

  it('does not display a supplied percentage when the backend marks risk unavailable', () => {
    const inconsistent = {
      ...row,
      risk_unavailable_reason: 'inconsistent_outcomes',
      risk_direction: 'configured_block',
      false_positive_rate: 0.5,
    };

    render(<DetailTable rows={[inconsistent as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);

    expect(screen.getByTestId('rule-effectiveness-fp-risk-period-1')).toHaveTextContent(/^—$/);
    expect(screen.getByTestId('rule-effectiveness-fn-risk-period-1')).toHaveTextContent(/^—$/);
    expect(screen.getByTestId('rule-effectiveness-row-period-1')).not.toHaveTextContent('50.0%');
  });

  // GT-14343：版本起止时间按客户端时区显示为 yyyy-MM-dd HH:mm:ss，不暴露 T / 微秒 / Z；
  // 仅有日期的值（当前版本回退到 observed_since、原型 Mock）原样显示，不编造 00:00:00。
  it('formats version times in the client time zone without transport noise', () => {
    const versioned = {
      ...row,
      version_no: 2,
      observed_since: '2026-09-24',
      backend: { effective_at: '2026-09-24T06:32:18.392739Z' },
      version_history: [{
        version_no: 1,
        effective_at: '2026-09-23T08:36:06.412638Z',
        superseded_at: '2026-09-24T06:32:18.392739Z',
        change_type: 'substantive' as const,
        change_summary: '首次开启观察',
        hits: 1,
      }],
    };
    render(<DetailTable rows={[versioned as unknown as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name:'expandRow'}));

    const current = screen.getByTestId('rule-effectiveness-version-period-1-2');
    const previous = screen.getByTestId('rule-effectiveness-version-period-1-1');
    expect(previous).toHaveTextContent('2026-09-23 16:36:06 → 2026-09-24 14:32:18');
    expect(current).toHaveTextContent('2026-09-24 14:32:18 → —');
    for (const el of [current, previous]) {
      expect(el.textContent).not.toMatch(/\d{2}:\d{2}:\d{2}\.\d|T\d{2}:|Z/);
    }
  });

  it('keeps date-only version times as dates', () => {
    const versioned = {
      ...row,
      version_no: 2,
      observed_since: '2026-09-22',
      version_history: [{
        version_no: 1, effective_at: '2026-09-10', superseded_at: '2026-09-22',
        change_type: 'substantive' as const, change_summary: '首次开启观察', hits: 1,
      }],
    };
    render(<DetailTable rows={[versioned as unknown as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name:'expandRow'}));

    expect(screen.getByTestId('rule-effectiveness-version-period-1-1')).toHaveTextContent('2026-09-10 → 2026-09-22');
    expect(screen.getByTestId('rule-effectiveness-version-period-1-2')).toHaveTextContent('2026-09-22 → —');
    expect(screen.getByTestId('rule-effectiveness-version-period-1-1').textContent).not.toContain('00:00:00');
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

    render(<DetailTable rows={[versioned as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
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

  it('shows historical field changes and an explicit unavailable reason without changing hit counts', () => {
    const versioned = {
      ...row,
      version_no: 4,
      hits: 5,
      observed_since: '2026-09-22',
      version_history: [{
        version_no: 3,
        effective_at: '2026-09-15T00:00:00Z',
        superseded_at: '2026-09-22T00:00:00Z',
        change_type: 'substantive' as const,
        change_summary: '实质性配置变更',
        changed_fields: [
          { field: 'aggregate.configuration.detection.parameters.window_minutes', before: 30, after: 27 },
          { field: 'aggregate.configuration.detection.parameters.min_count', before: 10, after: 12 },
        ],
        hits: 3,
      }, {
        version_no: 2,
        effective_at: '2026-09-08T00:00:00Z',
        superseded_at: '2026-09-15T00:00:00Z',
        change_type: 'substantive' as const,
        change_summary: '实质性配置变更',
        changed_fields: [],
        change_details_unavailable_reason: 'access_denied' as const,
        hits: 2,
      }],
      current_version_changes: [{ field: 'aggregate.action', before: 'quarantine', after: 'audit' }],
    };

    render(<DetailTable rows={[versioned as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name:'expandRow'}));

    expect(screen.getByTestId('rule-effectiveness-version-period-1-3')).toHaveTextContent(
      '命中 3 次检测窗口：30 → 27；触发数量：10 → 12',
    );
    expect(screen.getByTestId('rule-effectiveness-version-period-1-3').textContent).not.toContain('configuration.detection');
    expect(screen.getByTestId('rule-effectiveness-version-period-1-2')).toHaveTextContent(
      '命中 2 次没有查看权限，变更详情不可用',
    );
    expect(screen.getByTestId('rule-effectiveness-version-period-1-2')).not.toHaveTextContent('实质性配置变更');
  });

  it('keeps every action label visible in a responsive chart region', () => {
    chartMock.mockClear();
    const withAllActions = {
      ...row,
      action_breakdown: [
        { action: 'accept', count: 0 },
        { action: 'quarantine', count: 0 },
        { action: 'audit', count: 0 },
        { action: 'reject', count: 0 },
        { action: 'discard', count: 0 },
        { action: 'recall', count: 0 },
      ],
    };

    render(<DetailTable rows={[withAllActions as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name:'expandRow'}));

    expect(screen.getByTestId('rule-effectiveness-action-distribution-period-1')).toHaveClass('grid');
    expect(screen.getByTestId('rule-effectiveness-action-chart-period-1')).toHaveClass('w-full');
    expect(screen.getByTestId('rule-effectiveness-action-legend-period-1')).toHaveTextContent(
      'accept：0quarantine：0audit：0reject：0discard：0recall：0',
    );

    const chartProps = chartMock.mock.lastCall?.[0] as {
      'data-testid': string;
      style: { height: number; width: string };
      option: {
        series: Array<{
          avoidLabelOverlap: boolean;
          label: { show: boolean; position: string; alignTo: string; edgeDistance: number; overflow: string };
          labelLine: { show: boolean };
          labelLayout: { hideOverlap: boolean; moveOverlap: string };
        }>;
      };
    };
    expect(chartProps['data-testid']).toBe('rule-effectiveness-action-echart-period-1');
    expect(chartProps.style).toEqual({ height: 224, width: '100%' });
    expect(chartProps.option.series[0]).toMatchObject({
      avoidLabelOverlap: true,
      label: {
        show: true,
        position: 'outside',
        alignTo: 'edge',
        edgeDistance: 12,
        overflow: 'break',
      },
      labelLine: { show: true },
      labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
    });
  });
});
