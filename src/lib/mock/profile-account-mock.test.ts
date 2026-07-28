import { describe, expect, it } from 'vitest';

import { dispatch, isMockable } from './dispatcher';

describe('profile account mock', () => {
  it('provides the shared demo identity used by the header and profile page', () => {
    expect(isMockable('GET', '/profile/account')).toBe(true);
    expect(dispatch({ method: 'GET', path: '/profile/account' })).toEqual({
      status: 200,
      data: expect.objectContaining({
        username: 'admin',
        role: 'system_admin',
        name: '张运维',
      }),
    });
  });
});
