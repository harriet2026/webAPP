// recipient-status-badges.test.tsx — 方案 C（Badge 化）单测。
import { describe, it, expect } from 'vitest';
import {
  bucketRecipients,
  bucketRecipientsByAction,
  actionCategory,
  statusCategory,
  isBucketHighlighted,
  sortBucketsByHighlight,
  pickPrimaryBucket,
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

// GT-12923 阶段五 UI 复盘：多桶场景只渲染 1 个"主要类别"Badge，
// pickPrimaryBucket 决定选哪个桶作为主 Badge——这是解决"UI 占地大/颜色花"
// 同时又不引入"筛选投递却看到隔离"这类表面矛盾的关键逻辑。
describe('pickPrimaryBucket', () => {
  const bucket = (key: string, count: number) => ({ key, recipients: Array(count).fill('x@x.com') });

  it('picks the matched bucket over a larger unmatched one when a filter is active', () => {
    // 隔离 5 人 > 投递 1 人，但筛选值是"投递"（deliver 归一化后对应 accept），
    // 必须展示投递，否则用户会觉得"筛投递却看到隔离"前后矛盾。
    const buckets = [bucket('quarantine', 5), bucket('accept', 1)];
    const primary = pickPrimaryBucket(buckets, actionCategory, ['deliver']);
    expect(primary.key).toBe('accept');
  });

  it('picks the larger matched bucket when multiple buckets match the filter', () => {
    const buckets = [bucket('accept', 2), bucket('quarantine', 5), bucket('sideline', 1)];
    const primary = pickPrimaryBucket(buckets, actionCategory, ['deliver', 'quarantine']);
    expect(primary.key).toBe('quarantine');
  });

  it('falls back to risk priority when no bucket matches the filter', () => {
    const buckets = [bucket('accept', 10), bucket('quarantine', 1)];
    const primary = pickPrimaryBucket(buckets, actionCategory, ['block']);
    expect(primary.key).toBe('quarantine');
  });

  it('uses risk priority when there is no active filter (quarantine over delivered)', () => {
    const buckets = [bucket('accept', 6), bucket('quarantine', 1)];
    const primary = pickPrimaryBucket(buckets, actionCategory, undefined);
    expect(primary.key).toBe('quarantine');
  });

  it('breaks ties within the same risk tier by recipient count', () => {
    const buckets = [bucket('reject', 2), bucket('discard', 5)];
    // reject 和 discard 风险优先级不同（reject=3 < discard=4），reject 应该
    // 胜出，即使 discard 人数更多——验证优先级先于人数。
    const primary = pickPrimaryBucket(buckets, actionCategory, undefined);
    expect(primary.key).toBe('reject');
  });

  it('picks the highest-count bucket among ties in the same risk tier', () => {
    // 'foo' 和 'bar' 都不在 ACTION_CATEGORY 词表里，actionCategory 都 fallback
    // 到 'other'（同一优先级层），此时应按人数降序选择。
    const buckets = [bucket('foo', 2), bucket('bar', 6)];
    const primary = pickPrimaryBucket(buckets, actionCategory, undefined);
    expect(primary.recipients.length).toBe(6);
  });
});

// 群发邮件"邮件状态"筛选修复：筛"投递成功"命中一封含隔离收件人的群发
// 邮件时，status 维度的主 Badge 必须展示"投递成功"，否则会出现"筛选投递
// 成功却看到隔离中"的表面矛盾（与 action 维度的既有设计动机一致）。
describe('isBucketHighlighted (status dimension)', () => {
  it('matches after normalizing the raw recipient status vocabulary to the DisplayStatus filter vocabulary', () => {
    expect(isBucketHighlighted('delivered', ['delivered'], 'status')).toBe(true);
    expect(isBucketHighlighted('quarantined', ['quarantine_pending'], 'status')).toBe(true);
    expect(isBucketHighlighted('pending_review', ['audit_pending'], 'status')).toBe(true);
  });

  it('does not match an unrelated status', () => {
    expect(isBucketHighlighted('quarantined', ['delivered'], 'status')).toBe(false);
  });
});

describe('pickPrimaryBucket (status dimension)', () => {
  const bucket = (key: string, count: number) => ({ key, recipients: Array(count).fill('x@x.com') });

  it('picks the matched "delivered" bucket over a larger unmatched "quarantined" bucket when filtering by 投递成功', () => {
    const buckets = [bucket('quarantined', 5), bucket('delivered', 1)];
    const primary = pickPrimaryBucket(buckets, statusCategory, ['delivered'], 'status');
    expect(primary.key).toBe('delivered');
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
