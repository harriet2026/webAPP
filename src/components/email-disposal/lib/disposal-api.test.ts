import { describe, it, expect, vi } from 'vitest';
import { getDisposalRuleOptions, mapMailLogToDisposalItem, getDisposalList, localDayBound, type MailLogAPIItem } from './disposal-api';

function baseItem(overrides: Partial<MailLogAPIItem> = {}): MailLogAPIItem {
  return {
    id: 1,
    sender: 'sender@example.com',
    recipients: ['a@x.com'],
    subject: 's',
    action: 'accept',
    status: 'delivered',
    authenticated: false,
    ...overrides,
  };
}

describe('mapMailLogToDisposalItem - multi-recipient (GT-11619)', () => {
  it('preserves all recipients in recipientList', () => {
    const item = mapMailLogToDisposalItem(baseItem({
      recipients: ['a@x.com', 'b@y.com', 'c@z.com'],
    }));
    expect(item.recipientList).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
    expect(item.recipient).toBe('a@x.com');
  });

  it('handles single recipient', () => {
    const item = mapMailLogToDisposalItem(baseItem({ recipients: ['only@x.com'] }));
    expect(item.recipientList).toEqual(['only@x.com']);
    expect(item.recipient).toBe('only@x.com');
  });

  it('handles missing recipients array', () => {
    const item = mapMailLogToDisposalItem(baseItem({ recipients: undefined as unknown as string[] }));
    expect(item.recipientList).toEqual([]);
    expect(item.recipient).toBe('');
  });

  it('handles empty recipients array', () => {
    const item = mapMailLogToDisposalItem(baseItem({ recipients: [] }));
    expect(item.recipientList).toEqual([]);
    expect(item.recipient).toBe('');
  });
});

describe('mapMailLogToDisposalItem - direction (GT-12254)', () => {
  it.each([
    ['receive', 'incoming'],
    ['send', 'outgoing'],
    ['internal', 'internal'],
  ])('uses backend direction %s as %s instead of inferring it from authentication', (direction, expected) => {
    const item = mapMailLogToDisposalItem(baseItem({
      direction,
      // The regression was most visible on relay traffic: it is not SMTP
      // authenticated, but its direction is still authoritatively decided by
      // the backend.
      authenticated: false,
      smtp_user: undefined,
    }));

    expect(item.direction).toBe(expected);
  });
});

describe('mapMailLogToDisposalItem - disposal basis summary (GT-12935)', () => {
  it('passes the lightweight group summary through without reconstructing recipients', () => {
    const groups = [{
      policy_key: 'CR',
      recipient_count: 3,
      effective_count: 1,
      effective_known: true,
      entries: [{
        rule_name: '正文规则', rule_id: 'CR-66', action: 'quarantine',
        recipient_count: 3, effective_count: 1, effective_known: true,
      }],
    }];
    const item = mapMailLogToDisposalItem(baseItem({ disposal_basis_groups: groups }));
    expect(item.disposalBasisGroups).toEqual(groups);
    expect(item.disposalBasisGroups?.[0].entries[0]).not.toHaveProperty('recipients');
  });
});

// GT-12782 Task 4：mapToDisplayStatus 已删除——展示状态由后端下发的
// display_statuses 列表承载（一致邮件单元素、mixed 多元素带收件人数），
// mapper 只透传、不推导。13 态真值表由后端契约锁定：
// internal/models/display_status_test.go（Go 单元）+
// internal/storage/maillog_display_status_parity_dbtest_test.go（列表↔筛选
// 双向等价）。
describe('mapMailLogToDisposalItem - display_statuses passthrough (GT-12782)', () => {
  it('passes the backend list through verbatim (order and counts preserved)', () => {
    const item = mapMailLogToDisposalItem(baseItem({
      action: 'mixed',
      display_statuses: [
        { status: 'quarantine_pending', count: 1 },
        { status: 'delivered', count: 2 },
      ],
    }));
    expect(item.displayStatuses).toEqual([
      { status: 'quarantine_pending', count: 1 },
      { status: 'delivered', count: 2 },
    ]);
  });

  it('uniform mail carries a single-element list', () => {
    const item = mapMailLogToDisposalItem(baseItem({
      display_statuses: [{ status: 'audit_pending', count: 3 }],
    }));
    expect(item.displayStatuses).toEqual([{ status: 'audit_pending', count: 3 }]);
  });

  it('retains the raw recall rollup while badges remain driven by display_statuses', () => {
    const item = mapMailLogToDisposalItem(baseItem({
      recall_status_summary: 'partial_recall_success',
      display_statuses: [
        { status: 'recall_success', count: 2 },
        { status: 'recall_failed', count: 1 },
      ],
    }));
    expect(item.recallStatusSummary).toBe('partial_recall_success');
    expect(item.displayStatuses).toEqual([
      { status: 'recall_success', count: 2 },
      { status: 'recall_failed', count: 1 },
    ]);
  });

  it('falls back to an empty list when the backend omits the field (no client-side fabrication)', () => {
    const item = mapMailLogToDisposalItem(baseItem({ display_statuses: undefined }));
    expect(item.displayStatuses).toEqual([]);
  });
});

// GT review finding 3/7: quick filters for mail type and disposal basis must
// support multi-select, serialized as comma-separated query params.
describe('getDisposalList - multi-value quick filter serialization', () => {
  it('serializes emailTypes as comma-separated email_type', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    await getDisposalList({ page: 1, pageSize: 20, emailTypes: ['spam', 'phishing'] }, requestFn);
    const url = requestFn.mock.calls[0][0] as string;
    expect(url).toContain('email_type=spam%2Cphishing');
  });

  it('serializes disposalPolicyKeys as comma-separated disposal_policy_keys', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    await getDisposalList({ page: 1, pageSize: 20, disposalPolicyKeys: ['IPBL', 'CR'] }, requestFn);
    const url = requestFn.mock.calls[0][0] as string;
    expect(url).toContain('disposal_policy_keys=IPBL%2CCR');
  });

  it('omits email_type / disposal_policy_keys params when arrays are empty or absent', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    await getDisposalList({ page: 1, pageSize: 20, emailTypes: [], disposalPolicyKeys: undefined }, requestFn);
    const url = requestFn.mock.calls[0][0] as string;
    expect(url).not.toContain('email_type=');
    expect(url).not.toContain('disposal_policy_keys=');
  });

  it('serializes the controlled received-time sort order', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
    await getDisposalList({ page: 1, pageSize: 100, sortOrder: 'asc' }, requestFn);
    expect(String(requestFn.mock.calls[0][0])).toContain('sort_order=asc');
  });
});

describe('getDisposalRuleOptions - global rule picker search', () => {
  it('queries the dedicated metadata endpoint with a bounded server-side search', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      items: [{ id: 'CR-77', name: '付款规则' }],
    });

    await expect(getDisposalRuleOptions(' 付款 ', requestFn)).resolves.toEqual([
      { id: 'CR-77', name: '付款规则' },
    ]);
    const url = String(requestFn.mock.calls[0][0]);
    expect(url).toContain('/mail-logs/_meta/disposal-rules?');
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('search')).toBe('付款');
    expect(params.get('limit')).toBe('12');
  });
});

describe('localDayBound / date range params (GT-12633)', () => {
  it('converts yyyy-MM-dd to local-timezone day bounds in RFC3339', () => {
    const start = localDayBound('2026-07-29', false);
    const end = localDayBound('2026-07-29', true);
    // 断言换算语义而非具体时区：本地 00:00 与 23:59:59.999 的精确时刻。
    expect(new Date(start).getTime()).toBe(new Date('2026-07-29T00:00:00.000').getTime());
    expect(new Date(end).getTime()).toBe(new Date('2026-07-29T23:59:59.999').getTime());
    // RFC3339 instant（Z 结尾），不再是裸日期。
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    // 起止界覆盖恰好一整天（含毫秒末端）。
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 3600 * 1000 - 1);
  });

  it('passes non-date inputs through unchanged', () => {
    expect(localDayBound('2026-07-29T10:00:00Z', false)).toBe('2026-07-29T10:00:00Z');
    expect(localDayBound('', true)).toBe('');
  });

  it('getDisposalList sends converted RFC3339 day bounds, not bare dates', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    await getDisposalList({ page: 1, pageSize: 20, startDate: '2026-07-29', endDate: '2026-07-29' }, requestFn);
    const url = String(requestFn.mock.calls[0][0]);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('start_date')).toBe(localDayBound('2026-07-29', false));
    expect(params.get('end_date')).toBe(localDayBound('2026-07-29', true));
    expect(params.get('start_date')).not.toBe('2026-07-29');
  });
});
