import { describe, it, expect, vi } from 'vitest';
import {
  getSecurityModules,
  setSecurityModuleEnabled,
  WHITELIST_BEARING_MODULES,
} from '@/lib/api/security-modules';

describe('security-modules api client', () => {
  it('GET hits /security/modules', async () => {
    const fn = vi.fn().mockResolvedValue({ ip_filter: true });
    await getSecurityModules(fn as never);
    expect(fn).toHaveBeenCalledWith('/security/modules');
  });

  it('PUT sends the page in the path and enabled in the body', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await setSecurityModuleEnabled('rbl_filter', false, fn as never);
    expect(fn).toHaveBeenCalledWith('/security/modules/rbl_filter', {
      method: 'PUT',
      body: { enabled: false },
    });
  });

  it('flags exactly the three whitelist-bearing modules', () => {
    expect([...WHITELIST_BEARING_MODULES].sort()).toEqual(
      ['ip_filter', 'user_list', 'sender_filter'].sort(),
    );
  });
});
