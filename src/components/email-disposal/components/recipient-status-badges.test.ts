// recipient-status-badges.test.tsx — 方案 C（Badge 化）单测。
import { describe, it, expect } from 'vitest';
import { bucketRecipients, bucketRecipientsByAction, actionCategory, statusCategory } from './recipient-status-badges';
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
