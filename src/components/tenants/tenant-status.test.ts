import { describe, it, expect } from 'vitest';
import { displayStatus } from './tenant-status';

describe('displayStatus', () => {
  it('expired overrides stored status', () => {
    expect(displayStatus({ status: 'active', expired: true })).toBe('expired');
  });
  it('uses stored status when not expired', () => {
    expect(displayStatus({ status: 'suspended', expired: false })).toBe('suspended');
  });
});
