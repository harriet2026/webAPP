// 出站路由步骤一：代理 IP（Task 13 接通真实后端）—— ProxysvrEndpoint ⇄ OutboundProxyRow 映射。
// 对齐 doc/mail-routing.md §4、internal/models/proxysvr.go、internal/api/proxysvr.go。

import type { ProxysvrEndpoint, ProxysvrEndpointRequest } from '@/types/proxysvr';
import { normalizeProbeStatus } from '../mr-types';
import type { OutboundProxyRow, TlsMinVersion, CipherProfile } from './outbound-types';

const DEFAULT_TLS_MIN_VERSION: TlsMinVersion = '1.2';
const DEFAULT_CIPHER_PROFILE: CipherProfile = 'default';

export function proxysvrEndpointToRow(e: ProxysvrEndpoint): OutboundProxyRow {
  return {
    id: String(e.id),
    name: e.name,
    proxyIp: e.host,
    proxyPort: e.port,
    presendCode: e.presend_code,
    lid: e.lid,
    licensePresent: e.license_present,
    license: '',
    useTls: e.use_tls,
    egressIp: e.egress_ip,
    heloHostname: e.helo_hostname,
    tlsMinVersion: (e.tls_min_version || DEFAULT_TLS_MIN_VERSION) as TlsMinVersion,
    cipherProfile: (e.cipher_profile || DEFAULT_CIPHER_PROFILE) as CipherProfile,
    status: e.is_active ? 'enabled' : 'disabled',
    probeStatus: normalizeProbeStatus(e.probe_status),
    lastProbeTime: e.last_probe_time,
  };
}

/** 抽屉新建/编辑的可写字段（不含服务端派生的 licensePresent/probeStatus/lastProbeTime）；
 * id 为空串表示新建。 */
export type OutboundProxyDraft = Omit<OutboundProxyRow, 'licensePresent' | 'probeStatus' | 'lastProbeTime'>;

export function emptyProxyDraft(): OutboundProxyDraft {
  return {
    id: '',
    name: '',
    proxyIp: '',
    proxyPort: 6620,
    presendCode: 347,
    lid: '',
    license: '',
    useTls: false,
    egressIp: '',
    heloHostname: '',
    tlsMinVersion: DEFAULT_TLS_MIN_VERSION,
    cipherProfile: DEFAULT_CIPHER_PROFILE,
    status: 'enabled',
  };
}

/** license 为空串时省略该字段——真实后端语义："update 时省略 license = 保持原值不变"。 */
export function proxyDraftToRequest(d: OutboundProxyDraft): ProxysvrEndpointRequest {
  return {
    name: d.name,
    host: d.proxyIp,
    port: d.proxyPort,
    presend_code: d.presendCode,
    lid: d.lid,
    use_tls: d.useTls,
    is_active: d.status === 'enabled',
    egress_ip: d.egressIp,
    helo_hostname: d.heloHostname,
    tls_min_version: d.tlsMinVersion,
    cipher_profile: d.cipherProfile,
    ...(d.license ? { license: d.license } : {}),
  };
}
