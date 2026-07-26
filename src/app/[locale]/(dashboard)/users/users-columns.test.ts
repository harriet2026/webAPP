import { describe, it, expect } from 'vitest';
import zh from '../../../../../messages/zh.json';
import type { User } from '@/types/user';

// GT-11960: storage.ListUsers has always SELECTed name / email / last_login_at
// and the API returns them (verified on the wire: the /users payload carries
// name, email, last_login_at, last_login_ip). But webapp's `User` type never
// declared them, so the 姓名 / 邮箱 / 最后登录时间 columns had nothing to render
// and the page showed only ID/username/role/tenant/created_at.
describe('users list columns (GT-11960)', () => {
  it('the User type carries the fields the backend already returns', () => {
    // A compile-time assertion made observable at runtime: if any of these were
    // dropped from the interface again, this object would not type-check.
    const u: User = {
      id: 1,
      username: 'admin',
      role: 'system_admin',
      tenant_id: null,
      name: '张三',
      email: 'admin@example.com',
      last_login_at: '2026-07-11T17:03:16Z',
      last_login_ip: '10.0.0.1',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    };
    expect(u.name).toBe('张三');
    expect(u.email).toBe('admin@example.com');
    expect(u.last_login_at).toBeTruthy();
  });

  it('has i18n labels for the restored columns in zh', () => {
    const users = (zh as unknown as Record<string, Record<string, string>>).users;
    expect(users.name).toBeTruthy();
    expect(users.email).toBeTruthy();
    expect(users.lastLoginAt).toBeTruthy();
    expect(users.neverLoggedIn).toBeTruthy();
    // and they must not be raw key paths leaking through
    expect(users.lastLoginAt).not.toContain('.');
  });
});
