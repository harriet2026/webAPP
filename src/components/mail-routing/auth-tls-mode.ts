// 发信认证 Tab —— TLS 三档 ↔ 真实契约双布尔（ssl_enabled + protocol_config.starttls）
// 的换算 + 协议默认端口表。对齐 doc/html-spec/admin-forwarding/layer-8-auth-drawer.html
// 与 index.html §2.6（task-8-brief.md 给出的换算表）。
//
// 真实契约没有三档概念，只有 ssl_enabled（隐式 TLS/SSL-on-connect）与
// protocol_config.starttls 两个独立布尔；demo 的 UI 概念「关闭/优先 TLS/强制 TLS」按下表
// 映射（brief 给出，mock fixture 7001/7002/7003 三条已按此换算，见
// mail-routing-fixtures.ts::mrMockAuthConfigs 顶部注释）：
//   off    → ssl_enabled=false, starttls=false
//   prefer → ssl_enabled=false, starttls=true
//   force  → ssl_enabled=true,  starttls=false
// 反向换算（toTlsMode）ssl 优先：ssl_enabled=true 一律判定为 force，不看 starttls
// （real 后端理论上不会出现 ssl=true 且 starttls=true 的组合，但 ssl 优先保证即使出现
// 也有确定性归类，不会导致 UI 无法选中任何一档）。

import type { AuthTlsMode } from './mr-types';

export type AuthProtocol = 'smtp' | 'ldap' | 'pop3' | 'imap';

/** 各协议标准端口 / TLS（SSL-on-connect）端口，抄 demo PROTOCOL_PORTS。 */
export const PROTOCOL_PORTS: Record<AuthProtocol, { standard: number; ssl: number }> = {
  smtp: { standard: 25, ssl: 465 },
  ldap: { standard: 389, ssl: 636 },
  pop3: { standard: 110, ssl: 995 },
  imap: { standard: 143, ssl: 993 },
};

/** 双布尔 → TLS 三档（ssl 优先）。 */
export function toTlsMode(ssl: boolean, starttls: boolean): AuthTlsMode {
  if (ssl) return 'force';
  if (starttls) return 'prefer';
  return 'off';
}

/** TLS 三档 → 双布尔。 */
export function fromTlsMode(mode: AuthTlsMode): { ssl_enabled: boolean; starttls: boolean } {
  switch (mode) {
    case 'force':
      return { ssl_enabled: true, starttls: false };
    case 'prefer':
      return { ssl_enabled: false, starttls: true };
    case 'off':
    default:
      return { ssl_enabled: false, starttls: false };
  }
}

/** 协议 × TLS 三档 → 默认端口：off 用标准端口，prefer/force 都用加密端口。 */
export function defaultPort(protocol: AuthProtocol, mode: AuthTlsMode): number {
  const ports = PROTOCOL_PORTS[protocol] ?? PROTOCOL_PORTS.smtp;
  return mode === 'off' ? ports.standard : ports.ssl;
}
