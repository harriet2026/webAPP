import { describe, it, expect } from 'vitest';
import { toTlsMode, fromTlsMode, defaultPort, PROTOCOL_PORTS, type AuthProtocol } from './auth-tls-mode';
import type { AuthTlsMode } from './mr-types';

// 发信认证 Tab TLS 三档 ↔ 双布尔映射（task-8-brief.md Step 1）。

describe('toTlsMode / fromTlsMode', () => {
  it('maps the full off/prefer/force matrix both ways', () => {
    const cases: Array<{ mode: AuthTlsMode; ssl: boolean; starttls: boolean }> = [
      { mode: 'off', ssl: false, starttls: false },
      { mode: 'prefer', ssl: false, starttls: true },
      { mode: 'force', ssl: true, starttls: false },
    ];
    for (const c of cases) {
      expect(fromTlsMode(c.mode)).toEqual({ ssl_enabled: c.ssl, starttls: c.starttls });
      expect(toTlsMode(c.ssl, c.starttls)).toBe(c.mode);
    }
  });

  it('ssl 优先: ssl_enabled=true always resolves to force regardless of starttls', () => {
    expect(toTlsMode(true, false)).toBe('force');
    expect(toTlsMode(true, true)).toBe('force');
  });

  it('fixture round-trip: 7001 ldap off / 7002 smtp force / 7003 imap prefer', () => {
    expect(toTlsMode(false, false)).toBe('off'); // 7001
    expect(toTlsMode(true, false)).toBe('force'); // 7002
    expect(toTlsMode(false, true)).toBe('prefer'); // 7003
  });
});

describe('defaultPort', () => {
  const protocols: AuthProtocol[] = ['smtp', 'ldap', 'pop3', 'imap'];

  it('off → standard port for every protocol', () => {
    for (const p of protocols) {
      expect(defaultPort(p, 'off')).toBe(PROTOCOL_PORTS[p].standard);
    }
  });

  it('prefer/force → ssl port for every protocol', () => {
    for (const p of protocols) {
      expect(defaultPort(p, 'prefer')).toBe(PROTOCOL_PORTS[p].ssl);
      expect(defaultPort(p, 'force')).toBe(PROTOCOL_PORTS[p].ssl);
    }
  });

  // 全 8 组字面值（4 协议 × 2 端口档），逐一断言防止 PROTOCOL_PORTS 表漂移。
  it('exact literal values (demo PROTOCOL_PORTS)', () => {
    expect(defaultPort('smtp', 'off')).toBe(25);
    expect(defaultPort('smtp', 'force')).toBe(465);
    expect(defaultPort('ldap', 'off')).toBe(389);
    expect(defaultPort('ldap', 'prefer')).toBe(636);
    expect(defaultPort('pop3', 'off')).toBe(110);
    expect(defaultPort('pop3', 'force')).toBe(995);
    expect(defaultPort('imap', 'off')).toBe(143);
    expect(defaultPort('imap', 'prefer')).toBe(993);
  });
});
