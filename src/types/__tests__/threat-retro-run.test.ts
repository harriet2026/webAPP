import { describe, it, expect } from 'vitest';
import { isRunDegraded } from '@/lib/threat-retro/degraded';

describe('isRunDegraded', () => {
  it('flags degraded when any failure counter > 0', () => {
    expect(isRunDegraded({ failed_target_count: 0, failed_child_count: 0 } as any)).toBe(false);
    expect(isRunDegraded({ failed_target_count: 2, failed_child_count: 0 } as any)).toBe(true);
    expect(isRunDegraded({ failed_target_count: 0, failed_child_count: 1 } as any)).toBe(true);
  });
});
