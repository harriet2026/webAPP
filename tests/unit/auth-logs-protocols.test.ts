import { describe, it, expect } from 'vitest';
import { PROTOCOLS, PROTOCOL_OPTIONS, protocolLabelKey } from '@/components/auth-logs/constants';

// GT-12368: 认证日志协议筛选与原型 §2.4 一致，仅 SMTP/LDAP/POP3/IMAP；
// 本地账号库(LOCAL)后端已默认禁用，不再作为可选协议暴露。
describe('auth-logs protocol filter — GT-12368', () => {
  it('offers exactly the four prototype protocols, no LOCAL', () => {
    expect([...PROTOCOLS]).toEqual(['SMTP', 'LDAP', 'POP3', 'IMAP']);
    expect(PROTOCOLS).not.toContain('LOCAL');
  });
  it('PROTOCOL_OPTIONS has no LOCAL entry', () => {
    expect(PROTOCOL_OPTIONS.map((o) => o.value)).not.toContain('LOCAL');
    expect(PROTOCOL_OPTIONS).toHaveLength(4);
  });
  it('protocolLabelKey still localizes LOCAL for historical column rendering (spec §4.1 fallback)', () => {
    expect(protocolLabelKey('LOCAL')).toBe('authAttempts.protocols.LOCAL');
  });
});
