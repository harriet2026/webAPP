import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailTable } from './DetailTable';
import type { RuleEffectivenessRow } from '@/lib/api/rule-effectiveness-view';
import { versionFieldLabelKey } from './version_history_labels';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      'fieldLabels.action': '执行动作',
      'fieldLabels.triggerCount': '触发数量',
      'fieldLabels.similarityThreshold': '相似度阈值',
      'fieldLabels.detectionWindow': '检测窗口',
      'fieldLabels.directions': '检测方向',
      'fieldLabels.other': '其他配置项',
      'fieldLabels.subjectMarkContent': '主题标记内容',
      'fieldLabels.bodyMarkContent': '正文标记内容',
      'fieldLabels.subjectPrefixMarkContent': '主题前缀标记内容',
      'fieldLabels.subjectSuffixMarkContent': '主题后缀标记内容',
      'fieldLabels.bodyPrefixMarkContent': '正文前缀标记内容',
      'fieldLabels.bodySuffixMarkContent': '正文后缀标记内容',
      'fieldLabels.headerMarks': '信头标记',
      'valueLabels.aggregate': '全方向聚合',
      'valueLabels.receive': '接收方向',
      'valueLabels.send': '外发方向',
      'valueLabels.separate': '按方向独立检测',
      valueSeparator: '、',
      configuredValue: '已配置',
      'versionHistory.unset': '未设置',
    };
    if (key === 'versionBadge') return `v${values?.version}`;
    if (key === 'versionHistory.hits') return `命中 ${values?.count} 次`;
    if (key === 'versionHistory.change') return `${values?.field}：${values?.before} → ${values?.after}`;
    if (key === 'versionHistory.changeSeparator') return '；';
    if (key === 'headerMarkEntry') return `${values?.name}: ${values?.value}`;
    return labels[key] ?? key;
  },
}));

vi.mock('echarts-for-react', () => ({ default: () => <canvas /> }));

const row = {
  version_no: 2,
  history_count: 1,
  effective_at: '2026-09-02T00:00:00Z',
  superseded_at: null,
  close_reason: '',
  change_summary: 'configuration_changed',
  snapshot_available: true,
  time_zone: 'Asia/Shanghai',
  id: 'period-gt-14370',
  tenant_id: 12,
  tenant_name: '晨星科技',
  policy_module: 'similar_detection',
  sub_strategy_id: 'similar_email.internal',
  sub_strategy_name_snapshot: 'similar_email.internal',
  observed_since: '2026-09-02',
  observed_days: 1,
  hits: 1,
  observation_period_id: 'period-gt-14370',
  distinct_message_count: 1,
  configured_action: 'accept',
  mixed_config: false,
  pending_outcome_count: 0,
  other_outcome_count: 0,
  unknown_outcome_count: 0,
  action_difference_rate: 0,
  risk_unavailable_reason: '',
  risk_direction: 'configured_accept',
  attribution_status: 'attributable',
  action_breakdown: [],
  config_path: '/security/pipeline?module=similarDetection',
  version_history: [{
    version_no: 1,
    effective_at: '2026-09-01',
    superseded_at: '2026-09-02',
    change_type: 'substantive' as const,
    change_summary: '首次开启观察',
    hits: 0,
  }],
  current_version_changes: [
    {field: 'internal.configuration.detection.parameters.min_count', before: 3, after: 5},
    {field: 'internal.configuration.detection.parameters.similarity_pct', before: 80, after: 90},
    {field: 'internal.configuration.detection.parameters.window_minutes', before: 10, after: 30},
    {field: 'internal.configuration.detection.directions', before: ['receive'], after: ['receive', 'send']},
    {field: 'internal.configuration.future_private_field', before: 'aggregate', after: 'separate'},
    {field: 'internal.configuration.future_private_object', before: null, after: {secret_internal_key: 'x'}},
  ],
};

describe('rule effectiveness version field labels', () => {
  it.each(['auth_spoofing', 'similar_detection'])('renders actual marking metadata for %s without inventing an action change', (policyModule) => {
    const marked = {
      ...row,
      policy_module: policyModule,
      current_version_changes: [
        {field: 'dkim_fail.configuration.metadata.subject_prefix', before: null, after: '[安全]'},
        {field: 'dkim_fail.configuration.metadata.subject_suffix', before: '[旧标记]', after: '[新标记]'},
        {field: 'dkim_fail.configuration.metadata.body_prefix_text', before: null, after: '请谨慎处理'},
        {field: 'dkim_fail.configuration.metadata.add_headers', before: null, after: [{name: 'X-QC-Mark', value: 'review', private_unused_key: 'must-not-leak'}]},
      ],
    };
    render(<DetailTable rows={[marked as unknown as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'expandRow'}));
    const current = screen.getByTestId('rule-effectiveness-version-period-gt-14370-2');
    expect(current).toHaveTextContent('主题前缀标记内容：未设置 → [安全]');
    expect(current).toHaveTextContent('主题后缀标记内容：[旧标记] → [新标记]');
    expect(current).toHaveTextContent('正文前缀标记内容：未设置 → 请谨慎处理');
    expect(current).toHaveTextContent('信头标记：未设置 → X-QC-Mark: review');
    expect(current.textContent).not.toContain('其他配置项');
    expect(current.textContent).not.toContain('执行动作');
    expect(current.textContent).not.toContain('configuration.metadata');
    expect(current.textContent).not.toContain('private_unused_key');
    expect(current.textContent).not.toContain('must-not-leak');
  });

  it('recognizes only registered addon paths and retains flat UI marking fields', () => {
    expect(versionFieldLabelKey('dkim_fail.configuration.metadata.subject_prefix')).toBe('subjectPrefixMarkContent');
    expect(versionFieldLabelKey('internal.configuration.metadata.subject_suffix')).toBe('subjectSuffixMarkContent');
    expect(versionFieldLabelKey('internal.configuration.metadata.body_prefix_text')).toBe('bodyPrefixMarkContent');
    expect(versionFieldLabelKey('internal.configuration.metadata.body_suffix_text')).toBe('bodySuffixMarkContent');
    expect(versionFieldLabelKey('internal.configuration.metadata.add_headers')).toBe('headerMarks');
    expect(versionFieldLabelKey('internal.configuration.tag_subject_content')).toBe('subjectMarkContent');
    expect(versionFieldLabelKey('internal.configuration.future_private_object.subject_prefix')).toBe('other');
    expect(versionFieldLabelKey('internal.configuration.future_private_object.add_headers')).toBe('other');
  });

  it('does not expose malformed header objects and preserves the legacy key spelling', () => {
    const marked = {
      ...row,
      current_version_changes: [
        {field: 'internal.configuration.metadata.add_headers', before: [{key: 'X-Old-Mark', value: 'old'}], after: [{name: 'X-New-Mark', value: 'new'}]},
        {field: 'internal.configuration.metadata.add_headers', before: null, after: [{private_internal_key: 'must-not-leak'}]},
      ],
    };
    render(<DetailTable rows={[marked as unknown as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'expandRow'}));
    const current = screen.getByTestId('rule-effectiveness-version-period-gt-14370-2');
    expect(current).toHaveTextContent('信头标记：X-Old-Mark: old → X-New-Mark: new');
    expect(current).toHaveTextContent('信头标记：未设置 → 已配置');
    expect(current.textContent).not.toContain('private_internal_key');
    expect(current.textContent).not.toContain('must-not-leak');
  });

  it('keeps marking text literal when it happens to equal an enum value', () => {
    const marked = {
      ...row,
      current_version_changes: [
        {field: 'dkim_fail.configuration.metadata.subject_prefix', before: 'aggregate', after: 'receive'},
        {field: 'dkim_fail.configuration.metadata.body_prefix_text', before: null, after: 'separate'},
        {field: 'dkim_fail.configuration.tag_subject_content', before: null, after: 'send'},
      ],
    };
    render(<DetailTable rows={[marked as unknown as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'expandRow'}));
    const current = screen.getByTestId('rule-effectiveness-version-period-gt-14370-2');
    expect(current).toHaveTextContent('主题前缀标记内容：aggregate → receive');
    expect(current).toHaveTextContent('正文前缀标记内容：未设置 → separate');
    expect(current).toHaveTextContent('主题标记内容：未设置 → send');
    expect(current.textContent).not.toContain('全方向聚合');
    expect(current.textContent).not.toContain('接收方向');
    expect(current.textContent).not.toContain('按方向独立检测');
  });

  it('localizes fields and enum values without exposing internal paths', () => {
    render(<DetailTable rows={[row as unknown as RuleEffectivenessRow]} isLoading={false} onViewHits={vi.fn()} onNavigateToConfig={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'expandRow'}));

    const current = screen.getByTestId('rule-effectiveness-version-period-gt-14370-2');
    expect(current).toHaveTextContent('触发数量：3 → 5');
    expect(current).toHaveTextContent('相似度阈值：80 → 90');
    expect(current).toHaveTextContent('检测窗口：10 → 30');
    expect(current).toHaveTextContent('接收方向、外发方向');
    expect(current).toHaveTextContent('其他配置项：全方向聚合 → 按方向独立检测');
    expect(current).toHaveTextContent('其他配置项：未设置 → 已配置');
    expect(current.textContent).not.toContain('internal.configuration');
    expect(current.textContent).not.toContain('future_private_field');
    expect(current.textContent).not.toContain('secret_internal_key');
  });
});
