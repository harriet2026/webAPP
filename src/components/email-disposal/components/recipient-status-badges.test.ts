// recipient-status-badges.test.tsx — 方案 C（Badge 化）单测。
import { describe, it, expect } from 'vitest';
import {
  bucketRecipients,
  bucketRecipientsByAction,
  actionCategory,
  statusCategory,
  isBucketHighlighted,
  pickPrimaryBucket,
  pickPrimaryDisplayStatus,
  sortBucketsByHighlight,
} from './recipient-status-badges';
import type { RecipientDisposition } from '@/types/phishing-detection';

describe('actionCategory', () => {
  it('maps known actions', () => {
    expect(actionCategory('accept')).toBe('delivered');
    expect(actionCategory('sideline')).toBe('sideline');
    expect(actionCategory('quarantine')).toBe('quarantine');
    expect(actionCategory('reject')).toBe('rejected');
    expect(actionCategory('discard')).toBe('discarded');
  });

  it('falls back to other for unknown', () => {
    expect(actionCategory('xyz')).toBe('other');
    expect(actionCategory('')).toBe('other');
  });
});

describe('statusCategory', () => {
  it('maps delivery-related statuses', () => {
    expect(statusCategory('delivered')).toBe('delivered');
    // GT-12835：在途不再归进「投递成功」类——把还没送到的报成成功正是本缺陷
    // 的形态；投递失败也从笼统的 rejected 拆出独立的 failed 类。
    expect(statusCategory('delivering')).toBe('delivering');
    expect(statusCategory('in_delivery')).toBe('delivering');
    expect(statusCategory('deferred')).toBe('delivering');
    expect(statusCategory('delivery_failed')).toBe('failed');
    expect(statusCategory('failed')).toBe('failed');
    expect(statusCategory('reinjected')).toBe('delivered');
  });

  it('maps withheld statuses', () => {
    expect(statusCategory('quarantined')).toBe('quarantine');
    expect(statusCategory('sidelined')).toBe('sideline');
    expect(statusCategory('pending')).toBe('sideline');
    expect(statusCategory('pending_review')).toBe('audit');
    expect(statusCategory('audited')).toBe('audit');
    expect(statusCategory('rejected')).toBe('rejected');
    expect(statusCategory('bounced')).toBe('failed');
    expect(statusCategory('discarded')).toBe('discarded');
    expect(statusCategory('cancelled')).toBe('cancelled');
    expect(statusCategory('delivery_cancelled')).toBe('cancelled');
  });
});

describe('bucketRecipients (action dimension)', () => {
  const disp = (recipient: string, final_action: string): RecipientDisposition => ({
    recipient,
    final_action,
    status: '',
  });

  it('groups recipients by final_action', () => {
    const result = bucketRecipients([
      disp('a@x.com', 'accept'),
      disp('b@x.com', 'quarantine'),
      disp('c@x.com', 'accept'),
    ]);
    expect(result).toHaveLength(2);
    const accept = result.find((b) => b.key === 'accept')!;
    expect(accept.recipients).toEqual(['a@x.com', 'c@x.com']);
    const quarantine = result.find((b) => b.key === 'quarantine')!;
    expect(quarantine.recipients).toEqual(['b@x.com']);
  });

  it('orders delivered before quarantine (positive first)', () => {
    const result = bucketRecipients([
      disp('a@x.com', 'quarantine'),
      disp('b@x.com', 'accept'),
      disp('c@x.com', 'sideline'),
    ]);
    expect(result.map((b) => b.key)).toEqual(['accept', 'sideline', 'quarantine']);
  });

  it('handles empty input', () => {
    expect(bucketRecipients([])).toEqual([]);
  });

  it('falls back to original_action when final_action is empty', () => {
    const result = bucketRecipientsByAction([
      { recipient: 'a@x.com', final_action: '', original_action: 'sideline', status: '' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('sideline');
  });
});

describe('bucketRecipients (status dimension)', () => {
  const disp = (recipient: string, status: string): RecipientDisposition => ({
    recipient,
    final_action: '',
    status,
  });

  it('groups recipients by status', () => {
    const result = bucketRecipients(
      [disp('a@x.com', 'delivered'), disp('b@x.com', 'quarantined'), disp('c@x.com', 'delivered')],
      'status',
    );
    expect(result).toHaveLength(2);
    const delivered = result.find((b) => b.key === 'delivered')!;
    expect(delivered.recipients).toEqual(['a@x.com', 'c@x.com']);
  });

  it('orders delivered before quarantine in status dimension', () => {
    const result = bucketRecipients(
      [disp('a@x.com', 'quarantined'), disp('b@x.com', 'delivered')],
      'status',
    );
    expect(result.map((b) => b.key)).toEqual(['delivered', 'quarantined']);
  });
});

describe('mixed badge primary bucket selection', () => {
  const bucket = (key: string, count: number) => ({
    key,
    recipients: Array.from({ length: count }, (_, i) => `${i}@example.com`),
  });

  it('shows the largest category matched by the active action filter', () => {
    const primary = pickPrimaryBucket(
      [bucket('accept', 2), bucket('quarantine', 5), bucket('sideline', 1)],
      actionCategory,
      ['deliver', 'quarantine'],
    );
    expect(primary.key).toBe('quarantine');
  });

  it('shows a matched category even when an unmatched category has more recipients', () => {
    const primary = pickPrimaryBucket(
      [bucket('accept', 1), bucket('quarantine', 5)],
      actionCategory,
      ['deliver'],
    );
    expect(primary.key).toBe('accept');
  });

  it('uses the approved risk order without an active filter', () => {
    const primary = pickPrimaryBucket(
      [
        bucket('accept', 10),
        bucket('delivering', 8),
        bucket('discard', 6),
        bucket('reject', 5),
        bucket('quarantine', 1),
      ],
      actionCategory,
    );
    expect(primary.key).toBe('quarantine');
  });

  it('uses recipient count to break ties within the same risk category', () => {
    const primary = pickPrimaryBucket(
      [bucket('unknown-a', 2), bucket('unknown-b', 6)],
      actionCategory,
    );
    expect(primary.key).toBe('unknown-b');
  });

  it('uses the approved status risk order and honors an active status filter', () => {
    const buckets = [
      bucket('delivered', 10),
      bucket('delivery_failed', 2),
      bucket('quarantined', 1),
    ];
    expect(pickPrimaryBucket(buckets, statusCategory, undefined, 'status').key).toBe('quarantined');
    expect(pickPrimaryBucket(buckets, statusCategory, ['delivery_failed'], 'status').key).toBe('delivery_failed');
  });
});

describe('mixed badge filter highlighting', () => {
  it('normalizes raw actions and keeps block/drop ambiguity for reject buckets', () => {
    expect(isBucketHighlighted('accept', ['deliver'])).toBe(true);
    expect(isBucketHighlighted('audit', ['review'])).toBe(true);
    expect(isBucketHighlighted('sideline', ['review'])).toBe(false);
    expect(isBucketHighlighted('reject', ['block'])).toBe(true);
    expect(isBucketHighlighted('reject', ['drop'])).toBe(true);
    expect(isBucketHighlighted('bounce', ['block'])).toBe(true);
    expect(isBucketHighlighted('bounce', ['drop'])).toBe(false);
    expect(isBucketHighlighted('discard', ['drop'])).toBe(true);
  });

  it('moves matched buckets ahead without mutating the input', () => {
    const buckets = [{ key: 'accept' }, { key: 'quarantine' }];
    const sorted = sortBucketsByHighlight(buckets, ['quarantine']);
    expect(sorted.map((bucket) => bucket.key)).toEqual(['quarantine', 'accept']);
    expect(buckets.map((bucket) => bucket.key)).toEqual(['accept', 'quarantine']);
  });
});

describe('authoritative display-status primary badge', () => {
  const entries = [
    { status: 'quarantine_pending' as const, count: 1 },
    { status: 'delivered' as const, count: 6 },
    { status: 'delivery_failed' as const, count: 1 },
  ];

  it('uses risk priority by default without recomputing from recipient details', () => {
    expect(pickPrimaryDisplayStatus(entries).status).toBe('quarantine_pending');
  });

  it('prioritizes the active canonical status filter', () => {
    expect(pickPrimaryDisplayStatus(entries, ['delivered']).status).toBe('delivered');
    expect(pickPrimaryDisplayStatus(entries, ['delivery_failed']).status).toBe('delivery_failed');
  });
});
