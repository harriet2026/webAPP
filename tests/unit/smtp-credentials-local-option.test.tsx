import { describe, it, expect } from 'vitest';
import { backendOptions } from '@/app/[locale]/(dashboard)/smtp-credentials/page';

// GT-12368: 本地账号库禁用时，创建凭证的 auth_backend 不提供 local。
describe('smtp-credentials backend options — GT-12368', () => {
  it('hides local when disabled', () => {
    expect(backendOptions(false)).toEqual(['smtp_relay', 'ldap']);
  });
  it('offers local when enabled', () => {
    expect(backendOptions(true)).toEqual(['local', 'smtp_relay', 'ldap']);
  });
});
