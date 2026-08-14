import { describe, it, expect, vi } from 'vitest';
import { mapMailLogToDisposalItem, mapToDisplayStatus, getDisposalList, localDayBound, type MailLogAPIItem } from './disposal-api';

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

describe('mapToDisplayStatus - recall priority', () => {
  it('recall status wins over delivery status', () => {
    expect(mapToDisplayStatus('accept', 'delivered', 'released', 'recall_success')).toBe('recall_success');
  });
  it('no recall status falls through to normal logic', () => {
    expect(mapToDisplayStatus('accept', 'delivered', undefined, undefined)).toBe('delivered');
  });
  it('recall_status_summary none is treated as no recall', () => {
    expect(mapToDisplayStatus('accept', 'delivered', undefined, 'none')).toBe('delivered');
  });
  it('recall_status_summary empty string is treated as no recall', () => {
    expect(mapToDisplayStatus('accept', 'delivered', undefined, '')).toBe('delivered');
  });
  // GT-12923 阶段三：位置维度下"部分召回成功"不再是独立位置节点（邮件仍
  // 留在收件箱这个位置），历史/后端仍可能回填 partial_recall_success，
  // 归并展示为「召回成功」。
  it('partial_recall_success 归并为 recall_success', () => {
    expect(mapToDisplayStatus('accept', 'delivered', 'released', 'partial_recall_success')).toBe('recall_success');
  });
});

// TestMapToDisplayStatus 位置维度状态表（GT-12923 阶段三）。
// 邮件状态枚举从「风险/结果」维度改为「邮件当前所在位置」维度：
//   仍在我方系统内 → 已停在网关 → 已离开网关(去向已确定) →
//   针对已送达邮件的位置变更 → 已归档/清理
// bounced/reviewed_rejected/deleted/partial_delivered/partial_recall_success
// 不再是独立位置节点，全部归并到语义最贴近的位置节点上；新增
// delivery_cancelled 区分"已进入投递队列但被我方中止"与"discard/直接丢弃"。
// Regression coverage for review finding 1: audit_pending was entirely
// unhandled (fell through to the removed 'processing' bucket), and
// 'processing'/'delay_detecting' were extra states outside the 17-state set.
describe('mapToDisplayStatus - 位置维度状态表', () => {
  it('action=audit with no workflow outcome yet maps to audit_pending', () => {
    expect(mapToDisplayStatus('audit', undefined, undefined, undefined)).toBe('audit_pending');
    expect(mapToDisplayStatus('audit', undefined, '', undefined)).toBe('audit_pending');
  });
  it('action=audit approved and delivered maps to delivered, not audit_pending', () => {
    expect(mapToDisplayStatus('audit', 'delivered', 'approved', undefined)).toBe('delivered');
  });
  it('action=audit rejected after review 归并为 discarded（已停在网关）', () => {
    expect(mapToDisplayStatus('audit', undefined, 'rejected_after_review', undefined)).toBe('discarded');
  });
  it('action=quarantine with no workflow outcome maps to quarantine_pending', () => {
    expect(mapToDisplayStatus('quarantine', undefined, undefined, undefined)).toBe('quarantine_pending');
  });
  it('action=sideline with no workflow outcome maps to sideline_pending', () => {
    expect(mapToDisplayStatus('sideline', undefined, undefined, undefined)).toBe('sideline_pending');
  });
  it('action=reject maps to rejected', () => {
    expect(mapToDisplayStatus('reject', undefined, undefined, undefined)).toBe('rejected');
  });
  it('action=bounce 归并为 delivery_failed（已离开网关但未成功送达）', () => {
    expect(mapToDisplayStatus('bounce', undefined, undefined, undefined)).toBe('delivery_failed');
  });
  it('action=discard maps to discarded', () => {
    expect(mapToDisplayStatus('discard', undefined, undefined, undefined)).toBe('discarded');
  });
  it('workflow_outcome=discarded maps to discarded', () => {
    expect(mapToDisplayStatus('sideline', undefined, 'discarded', undefined)).toBe('discarded');
  });
  it('workflow_outcome=expired maps to expired', () => {
    expect(mapToDisplayStatus('quarantine', undefined, 'expired', undefined)).toBe('expired');
  });
  it('workflow_outcome=deleted 归并为 discarded（已停在网关）', () => {
    expect(mapToDisplayStatus('quarantine', undefined, 'deleted', undefined)).toBe('discarded');
  });
  it('accept with no delivery status yet maps to delivering, never processing', () => {
    expect(mapToDisplayStatus('accept', undefined, undefined, undefined)).toBe('delivering');
  });
  it('released with no delivery status yet maps to delivering, never processing', () => {
    expect(mapToDisplayStatus('accept', undefined, 'released', undefined)).toBe('delivering');
  });
  it('accept + delivery cancelled maps to delivery_cancelled（已进入队列但被中止，非 discard）', () => {
    expect(mapToDisplayStatus('accept', 'cancelled', undefined, undefined)).toBe('delivery_cancelled');
  });
  it('accept + delivery in_delivery maps to delivering', () => {
    expect(mapToDisplayStatus('accept', 'in_delivery', undefined, undefined)).toBe('delivering');
  });
  it('accept + delivery failed maps to delivery_failed', () => {
    expect(mapToDisplayStatus('accept', 'failed', undefined, undefined)).toBe('delivery_failed');
  });
  it('accept + delivery partial_delivered 归并为 delivering（位置未确定为单一终态）', () => {
    expect(mapToDisplayStatus('accept', 'partial_delivered', undefined, undefined)).toBe('delivering');
  });
  it('recall states always win regardless of action/workflow/delivery', () => {
    expect(mapToDisplayStatus('accept', 'delivered', 'released', 'recall_pending')).toBe('recall_pending');
    expect(mapToDisplayStatus('accept', 'delivered', 'released', 'recall_failed')).toBe('recall_failed');
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

  // GT-12923 阶段三：执行动作从 advanced_filters 的 action eq/in 条件挪到顶层
  // 查询参数，序列化方式与 emailTypes/disposalPolicyKeys 一致。
  it('serializes executionActions as comma-separated action, not an advanced_filters condition', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    await getDisposalList(
      { page: 1, pageSize: 20, executionActions: ['deliver', 'quarantine'] },
      requestFn,
    );
    const url = requestFn.mock.calls[0][0] as string;
    expect(url).toContain('action=deliver%2Cquarantine');
    expect(url).not.toContain('advanced_filters=');
  });

  it('omits the action param when executionActions is empty or absent', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    await getDisposalList({ page: 1, pageSize: 20, executionActions: [] }, requestFn);
    const url = requestFn.mock.calls[0][0] as string;
    expect(url).not.toContain('action=');
  });

  it('serializes the controlled received-time sort order', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
    await getDisposalList({ page: 1, pageSize: 100, sortOrder: 'asc' }, requestFn);
    expect(String(requestFn.mock.calls[0][0])).toContain('sort_order=asc');
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

// GT-12353：审核队列/超时 worker 把审核项翻成终态后，后端现在会回写
// mail_log.workflow_outcome_summary（此前只有邮件处置中心自己写，于是这类
// 邮件在处置中心永远显示「待审核」、放行点了返回 not_applicable、召回恒灰）。
// 前端必须认得这三种终态取值，否则回写了也白写——会继续落到
// action==='audit' 的分支。
describe('审核终态的展示映射 (GT-12353)', () => {
  it('timeout_released 按已投递渲染，而不是继续显示待审核', () => {
    expect(mapToDisplayStatus('audit', 'delivered', 'timeout_released')).toBe('delivered');
    // 未拿到终端投递状态时按「投递中」，与 released/approved 同语义。
    expect(mapToDisplayStatus('audit', undefined, 'timeout_released')).toBe('delivering');
  });

  it('approved 按已投递渲染', () => {
    expect(mapToDisplayStatus('audit', 'delivered', 'approved')).toBe('delivered');
  });

  it('rejected_after_review 渲染为已丢弃（位置维度下归并到 discarded）', () => {
    expect(mapToDisplayStatus('audit', undefined, 'rejected_after_review')).toBe('discarded');
  });

  it('终态缺失时仍显示待审核（这正是修复前的现象，必须保持可区分）', () => {
    expect(mapToDisplayStatus('audit', undefined, 'none')).toBe('audit_pending');
    expect(mapToDisplayStatus('audit', undefined, undefined)).toBe('audit_pending');
  });
});
