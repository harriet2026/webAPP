import { describe, expect, it } from 'vitest';

import type { CheckStatus } from '@/types/email-disposal-detail';
import { aggregateCheckStatus } from './check-status';

describe('aggregateCheckStatus', () => {
  it.each([
    [['skipped'], 'skipped'],
    [['skipped', 'pass'], 'pass'],
    [['pass', 'observed'], 'observed'],
    [['observed', 'processing'], 'processing'],
    [['observed', 'suspicious'], 'suspicious'],
    [['pass', 'processing'], 'processing'],
    [['processing', 'timeout'], 'timeout'],
    [['timeout', 'suspicious'], 'suspicious'],
    [['processing', 'suspicious'], 'suspicious'],
    [['suspicious', 'threat'], 'threat'],
  ] as const)('returns the highest-priority status from %j', (statuses, expected) => {
    expect(aggregateCheckStatus(statuses.map((status) => ({ status })))).toBe(expected);
  });

  it('returns skipped for an empty collection', () => {
    expect(aggregateCheckStatus([] as Array<{ status: CheckStatus }>)).toBe('skipped');
  });
});
