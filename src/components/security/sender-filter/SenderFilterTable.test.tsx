import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SenderFilterTable } from './SenderFilterTable';
import type { SenderFilterRuleView, SenderFilterGroups } from '@/types/sender-filter';
import type { Rule } from '@/types/unified-rules';

// Identity translator (mirrors recipient-status.test.tsx): SenderFilterTable
// calls `useTranslations()` with NO namespace and passes fully-qualified keys
// like 'senderFilter.ruleId', so the mock must return the key as-is (not
// prefix it with "undefined.") when no namespace is supplied.
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    const full = namespace ? `${namespace}.${key}` : key;
    return params ? `${full}:${JSON.stringify(params)}` : full;
  },
}));

function baseRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 1,
    name: '测试规则',
    rule_class: 'sender_filter',
    stage: 'connect',
    priority: 100,
    condition_tree: '{}',
    action: 'reject',
    is_active: true,
    created_at: '2026-03-20T08:00:00Z',
    updated_at: '2026-03-20T08:00:00Z',
    ...overrides,
  } as Rule;
}

function baseView(overrides: Partial<SenderFilterRuleView> = {}): SenderFilterRuleView {
  return {
    rule: baseRule(),
    list_type: 'blacklist',
    list_id_display: 'BL-20260320-001',
    resolved: {
      feature: 'sender_filter',
      sender_config: { type: 'individual', value: 'attacker@example.org' },
      ip_range: { type: 'all' },
      list_type: 'blacklist',
    },
    is_complex: false,
    ...overrides,
  };
}

const emptyGroups: SenderFilterGroups = { senderGroups: [], ipGroups: [] };

function renderTable(data: SenderFilterRuleView[], groups: SenderFilterGroups = emptyGroups) {
  return render(
    <SenderFilterTable
      data={data}
      pageCount={1}
      pageIndex={0}
      pageSize={10}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggle={vi.fn()}
      groups={groups}
      isLoading={false}
    />,
  );
}

describe('SenderFilterTable demo columns', () => {
  it('无 IP 范围列', () => {
    renderTable([baseView()]);
    expect(screen.queryByText('senderFilter.ipRange')).toBeNull();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('senderFilter.ipRange');
  });

  it('规则ID 为日期格式', () => {
    renderTable([baseView({ list_id_display: 'BL-20260320-001' })]);
    expect(screen.getByText('BL-20260320-001')).toBeInTheDocument();
  });

  it('状态列仍是 Switch', () => {
    renderTable([baseView()]);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('保留规则名称/发信人/执行动作/修改时间/操作列', () => {
    renderTable([baseView()]);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toContain('senderFilter.ruleId');
    expect(headers).toContain('senderFilter.ruleName');
    expect(headers).toContain('senderFilter.senderConfig');
    expect(headers).toContain('senderFilter.action');
    expect(headers).toContain('senderFilter.status');
    expect(headers).toContain('senderFilter.modifyTime');
    expect(headers).toContain('senderFilter.operation');

    expect(screen.getByText('测试规则')).toBeInTheDocument();
    expect(screen.getByText('attacker@example.org')).toBeInTheDocument();
    expect(screen.getByText('senderFilter.action_reject')).toBeInTheDocument();
  });
});

describe('SenderFilterTable resilience to incomplete metadata', () => {
  // A sender_filter rule whose metadata carries no sender_config is accepted by
  // POST /unified-rules and reachable via rule import or any non-UI client.
  // Rendering used to read `resolved.sender_config.type` unguarded, throwing
  // "Cannot read properties of undefined (reading 'type')" — an uncaught render
  // error that took out the WHOLE page behind the error boundary, not just the
  // cell. It must degrade to the existing "complex condition" badge instead.
  it('renders a rule whose resolved metadata has no sender_config', () => {
    const view = baseView({
      resolved: {
        feature: 'sender_filter',
        list_type: 'blacklist',
      } as SenderFilterRuleView['resolved'],
    });
    expect(() => renderTable([view])).not.toThrow();
    expect(screen.getByText('测试规则')).toBeDefined();
    expect(screen.getAllByText('senderFilter.complexCondition').length).toBeGreaterThan(0);
  });

  it('renders a rule whose sender_config carries an unknown type', () => {
    const view = baseView({
      resolved: {
        feature: 'sender_filter',
        sender_config: { type: 'not-a-real-type', value: 'x@y.z' },
        ip_range: { type: 'all' },
        list_type: 'blacklist',
      } as unknown as SenderFilterRuleView['resolved'],
    });
    expect(() => renderTable([view])).not.toThrow();
    expect(screen.getByText('测试规则')).toBeDefined();
  });
});
