// recipient-status-badges.test.tsx — 方案 C（Badge 化）单测。
import { describe, it, expect } from 'vitest';
import {
  bucketRecipients,
  bucketRecipientsByAction,
  actionCategory,
  statusCategory,
  isBucketHighlighted,
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
    expect(statusCategory('delivering')).toBe('delivered');
    expect(statusCategory('in_delivery')).toBe('delivered');
    expect(statusCategory('reinjected')).toBe('delivered');
  });

  it('maps withheld statuses', () => {
    expect(statusCategory('quarantined')).toBe('quarantine');
    expect(statusCategory('sidelined')).toBe('sideline');
    expect(statusCategory('pending')).toBe('sideline');
    expect(statusCategory('rejected')).toBe('rejected');
    expect(statusCategory('bounced')).toBe('rejected');
    expect(statusCategory('failed')).toBe('rejected');
    expect(statusCategory('discarded')).toBe('discarded');
    expect(statusCategory('cancelled')).toBe('discarded');
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

// GT-12923 阶段四：命中"执行动作"筛选值的收件人徽章需要高亮/置顶。
// bucket.key 是原始动作词表（accept/audit/reject/discard/quarantine/...），
// highlightKeys 是筛选值词表（deliver/review/block/drop/quarantine/recall），
// isBucketHighlighted 负责先归一化再比较——这里覆盖两套词表不同名的场景
// （accept→deliver、audit→review），以及本就同名的场景（quarantine）。
describe('isBucketHighlighted', () => {
  it('matches after normalizing the raw action vocabulary to the filter vocabulary', () => {
    expect(isBucketHighlighted('accept', ['deliver'])).toBe(true);
    expect(isBucketHighlighted('audit', ['review'])).toBe(true);
    expect(isBucketHighlighted('reject', ['block'])).toBe(true);
    expect(isBucketHighlighted('discard', ['drop'])).toBe(true);
  });

  it('matches values that are already shared between both vocabularies', () => {
    expect(isBucketHighlighted('quarantine', ['quarantine'])).toBe(true);
  });

  it('does not match when highlightKeys is empty or undefined', () => {
    expect(isBucketHighlighted('accept', [])).toBe(false);
    expect(isBucketHighlighted('accept', undefined)).toBe(false);
  });

  it('does not match an unrelated action', () => {
    expect(isBucketHighlighted('accept', ['quarantine'])).toBe(false);
  });
});

describe('sortBucketsByHighlight', () => {
  const bucket = (key: string) => ({ key });

  it('moves highlighted buckets to the front while preserving relative order within each group', () => {
    const buckets = [bucket('accept'), bucket('quarantine'), bucket('audit'), bucket('discard')];
    const sorted = sortBucketsByHighlight(buckets, ['review']);
    // 'audit' 归一化为 'review'，命中筛选值，被移到最前；其余三个未命中
    // 桶维持原始相对顺序（accept, quarantine, discard）。
    expect(sorted.map((b) => b.key)).toEqual(['audit', 'accept', 'quarantine', 'discard']);
  });

  it('returns the input unchanged when highlightKeys is empty or undefined', () => {
    const buckets = [bucket('accept'), bucket('quarantine')];
    expect(sortBucketsByHighlight(buckets, [])).toEqual(buckets);
    expect(sortBucketsByHighlight(buckets, undefined)).toEqual(buckets);
  });
});
