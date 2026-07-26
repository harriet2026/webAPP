import { describe, it, expect, vi } from 'vitest';
import { mapMailLogToDisposalItem, mapToDisplayStatus, getDisposalList, type MailLogAPIItem } from './disposal-api';

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
  it('partial_recall_success surfaces correctly', () => {
    expect(mapToDisplayStatus('accept', 'delivered', 'released', 'partial_recall_success')).toBe('partial_recall_success');
  });
});

// TestMapToDisplayStatus 17-state truth table (V2 status dict, design doc §5.1).
// Regression coverage for review finding 1: audit_pending was entirely
// unhandled (fell through to the removed 'processing' bucket), and
// 'processing'/'delay_detecting' were extra states outside the 17-state set.
describe('mapToDisplayStatus - 17-state truth table', () => {
  it('action=audit with no workflow outcome yet maps to audit_pending', () => {
    expect(mapToDisplayStatus('audit', undefined, undefined, undefined)).toBe('audit_pending');
    expect(mapToDisplayStatus('audit', undefined, '', undefined)).toBe('audit_pending');
  });
  it('action=audit approved and delivered maps to delivered, not audit_pending', () => {
    expect(mapToDisplayStatus('audit', 'delivered', 'approved', undefined)).toBe('delivered');
  });
  it('action=audit rejected after review maps to reviewed_rejected', () => {
    expect(mapToDisplayStatus('audit', undefined, 'rejected_after_review', undefined)).toBe('reviewed_rejected');
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
  it('action=bounce maps to bounced', () => {
    expect(mapToDisplayStatus('bounce', undefined, undefined, undefined)).toBe('bounced');
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
  it('workflow_outcome=deleted maps to deleted', () => {
    expect(mapToDisplayStatus('quarantine', undefined, 'deleted', undefined)).toBe('deleted');
  });
  it('accept with no delivery status yet maps to delivering, never processing', () => {
    expect(mapToDisplayStatus('accept', undefined, undefined, undefined)).toBe('delivering');
  });
  it('released with no delivery status yet maps to delivering, never processing', () => {
    expect(mapToDisplayStatus('accept', undefined, 'released', undefined)).toBe('delivering');
  });
  it('accept + delivery cancelled maps to discarded', () => {
    expect(mapToDisplayStatus('accept', 'cancelled', undefined, undefined)).toBe('discarded');
  });
  it('accept + delivery in_delivery maps to delivering', () => {
    expect(mapToDisplayStatus('accept', 'in_delivery', undefined, undefined)).toBe('delivering');
  });
  it('accept + delivery failed maps to delivery_failed', () => {
    expect(mapToDisplayStatus('accept', 'failed', undefined, undefined)).toBe('delivery_failed');
  });
  it('accept + delivery partial_delivered maps to partial_delivered', () => {
    expect(mapToDisplayStatus('accept', 'partial_delivered', undefined, undefined)).toBe('partial_delivered');
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

  it('serializes the controlled received-time sort order', async () => {
    const requestFn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
    await getDisposalList({ page: 1, pageSize: 100, sortOrder: 'asc' }, requestFn);
    expect(String(requestFn.mock.calls[0][0])).toContain('sort_order=asc');
  });
});
