// DKIM 外发签名 + 租户发信域名的 mock 数据（无后端的开发/演示用）。
//
// 背景：真实后端 `/dkim/*` 与 `/tenants/:id/domains` 在 v0 预览环境不可达
// （api/v1 代理指向 127.0.0.1:18080）。dispatcher 只在路由被登记时才拦截为
// mock（见 client.ts 的 isMockable 门控），否则放行到真实后端并失败。此前这两
// 组接口都未登记，导致「认证协议检查 → DKIM 外发签名」子卡在预览里无数据、
// 生成/激活/DNS 校验点不动。这里补齐一份可变的内存态 fixture，让整条链路在
// 预览里可完整演示（生成 → 一次性私钥 → 复制 DNS TXT → 校验 → 激活 → 删除）。
//
// 数据形状严格对齐 src/lib/api/dkim.ts 的 DkimKey / DkimKeyListResponse /
// DkimKeyWithPrivate / VerifyDnsResult，以及 src/types/tenant-domain.ts 的
// TenantDomain。

import type {
  DkimAlgorithm,
  DkimDnsStatus,
  DkimKey,
  DkimKeyListResponse,
  DkimKeyWithPrivate,
  VerifyDnsResult,
} from '@/lib/api/dkim';
import type { TenantDomain, MailSystemType } from '@/types/tenant-domain';

// ─── 租户发信域名 ────────────────────────────────────────────────────────
// 与 mockTenants（fixtures.ts）的租户 id 1/2/3 对齐；域名同时用于 DKIM 键映射。
const TENANT_DOMAINS: Record<number, Array<{ domain: string; mail_system_type: MailSystemType }>> = {
  1: [
    { domain: 'example-a.com', mail_system_type: 'coremail' },
    { domain: 'mail-a.cn', mail_system_type: 'standard_smtp' },
  ],
  2: [{ domain: 'example-b.com', mail_system_type: 'exchange' }],
  3: [{ domain: 'example-c.com', mail_system_type: 'standard_smtp' }],
};

export function mockTenantDomainsFor(tenantId: number): { items: TenantDomain[]; total: number } {
  const defs = TENANT_DOMAINS[tenantId] ?? [];
  const items: TenantDomain[] = defs.map((d, idx) => ({
    id: tenantId * 100 + idx + 1,
    tenant_id: tenantId,
    domain: d.domain,
    next_hop_type: 'domain',
    next_hop_host: d.domain,
    next_hop_port: 25,
    is_active: 1,
    mail_system_type: d.mail_system_type,
    mail_system_config: null,
  }));
  return { items, total: items.length };
}

// ─── DKIM 密钥内存态 ─────────────────────────────────────────────────────
// 一段 demo 用的假公钥（非真实密钥，仅用于展示 DNS TXT 记录形状）。
const FAKE_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0mockDemoPublicKeyForPreviewOnlyNotARealKeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQIDAQAB';

function dnsRecordName(selector: string, domain: string): string {
  return `${selector}._domainkey.${domain}`;
}

function dnsRecordValue(algorithm: DkimAlgorithm): string {
  const k = algorithm === 'ed25519-sha256' ? 'ed25519' : 'rsa';
  return `v=DKIM1; k=${k}; p=${FAKE_PUBLIC_KEY}`;
}

let SEQ = 1000;
function nextId(): number {
  SEQ += 1;
  return SEQ;
}

// 初始种子：租户1 已启用一把（已验证）+ 一把历史待验证；租户2 一把待验证；
// 租户1 的 mail-a.cn 与租户3 故意留空，用于演示「未签名」空态。
function seed(): DkimKey[] {
  return [
    {
      id: nextId(),
      tenant_id: 1,
      domain: 'example-a.com',
      selector: 's2026',
      algorithm: 'rsa-sha256',
      key_size: 2048,
      public_key: FAKE_PUBLIC_KEY,
      dns_record_name: dnsRecordName('s2026', 'example-a.com'),
      dns_record: dnsRecordValue('rsa-sha256'),
      dns_record_observed: dnsRecordValue('rsa-sha256'),
      dns_status: 'verified',
      dns_checked_at: '2026-07-20T08:00:00Z',
      dns_error: null,
      is_active: true,
      note: '当前启用的签名密钥',
      created_at: '2026-06-01T00:00:00Z',
    },
    {
      id: nextId(),
      tenant_id: 1,
      domain: 'example-a.com',
      selector: 's2025',
      algorithm: 'rsa-sha256',
      key_size: 2048,
      public_key: FAKE_PUBLIC_KEY,
      dns_record_name: dnsRecordName('s2025', 'example-a.com'),
      dns_record: dnsRecordValue('rsa-sha256'),
      dns_record_observed: null,
      dns_status: 'unverified',
      dns_checked_at: null,
      dns_error: null,
      is_active: false,
      note: '上一年度密钥（待轮换下线）',
      created_at: '2025-06-01T00:00:00Z',
    },
    {
      id: nextId(),
      tenant_id: 2,
      domain: 'example-b.com',
      selector: 'default',
      algorithm: 'ed25519-sha256',
      key_size: null,
      public_key: FAKE_PUBLIC_KEY,
      dns_record_name: dnsRecordName('default', 'example-b.com'),
      dns_record: dnsRecordValue('ed25519-sha256'),
      dns_record_observed: null,
      dns_status: 'unverified',
      dns_checked_at: null,
      dns_error: null,
      is_active: false,
      note: null,
      created_at: '2026-07-10T00:00:00Z',
    },
  ];
}

let KEYS: DkimKey[] = seed();

function parseQuery(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  const qs = path.split('?')[1];
  if (qs) {
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=');
      if (k) out[k] = decodeURIComponent(v || '');
    }
  }
  return out;
}

export function mockListDkimKeys(path: string): DkimKeyListResponse {
  const q = parseQuery(path);
  const tenantId = q.tenant_id ? Number(q.tenant_id) : undefined;
  const domain = q.domain || undefined;
  let items = KEYS.slice();
  if (tenantId !== undefined) items = items.filter((k) => k.tenant_id === tenantId);
  if (domain) items = items.filter((k) => k.domain === domain);
  // 稳定排序：启用优先，其次创建时间倒序。
  items.sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
  return { items, total: items.length, page: 1, page_size: 100 };
}

export function mockGenerateDkimKey(body: {
  tenant_id: number;
  domain: string;
  selector: string;
  algorithm: DkimAlgorithm;
  key_size?: number;
  note?: string;
}): DkimKeyWithPrivate {
  const key: DkimKey = {
    id: nextId(),
    tenant_id: body.tenant_id,
    domain: body.domain,
    selector: body.selector,
    algorithm: body.algorithm,
    key_size: body.algorithm === 'ed25519-sha256' ? null : body.key_size ?? 2048,
    public_key: FAKE_PUBLIC_KEY,
    dns_record_name: dnsRecordName(body.selector, body.domain),
    dns_record: dnsRecordValue(body.algorithm),
    dns_record_observed: null,
    // 新生成的密钥默认未验证：必须先发布 DNS 并校验通过才能启用。
    dns_status: 'unverified',
    dns_checked_at: null,
    dns_error: null,
    is_active: false,
    note: body.note ?? null,
    created_at: new Date().toISOString(),
  };
  KEYS.push(key);
  return {
    ...key,
    private_key_pem:
      '-----BEGIN PRIVATE KEY-----\n' +
      'MOCK-DEMO-PRIVATE-KEY-DO-NOT-USE-IN-PRODUCTION\n'.repeat(6) +
      '-----END PRIVATE KEY-----',
  };
}

export function mockImportDkimKey(body: {
  tenant_id: number;
  domain: string;
  selector: string;
  note?: string;
}): DkimKey {
  const key: DkimKey = {
    id: nextId(),
    tenant_id: body.tenant_id,
    domain: body.domain,
    selector: body.selector,
    algorithm: 'rsa-sha256',
    key_size: 2048,
    public_key: FAKE_PUBLIC_KEY,
    dns_record_name: dnsRecordName(body.selector, body.domain),
    dns_record: dnsRecordValue('rsa-sha256'),
    dns_record_observed: null,
    dns_status: 'unverified',
    dns_checked_at: null,
    dns_error: null,
    is_active: false,
    note: body.note ?? null,
    created_at: new Date().toISOString(),
  };
  KEYS.push(key);
  return key;
}

export function mockVerifyDkimDns(id: number): VerifyDnsResult {
  const key = KEYS.find((k) => k.id === id);
  const now = new Date().toISOString();
  if (!key) {
    return { dns_status: 'not_found', dns_checked_at: now, dns_record_observed: null };
  }
  // demo：校验即视为发布成功，翻转为已验证。
  const status: DkimDnsStatus = 'verified';
  key.dns_status = status;
  key.dns_checked_at = now;
  key.dns_record_observed = key.dns_record;
  key.dns_error = null;
  return { dns_status: status, dns_checked_at: now, dns_record_observed: key.dns_record };
}

export function mockSetDkimKeyStatus(id: number, isActive: boolean): void {
  const key = KEYS.find((k) => k.id === id);
  if (!key) return;
  if (isActive) {
    // 同域名同一时刻只允许一把启用：先把同域名其它密钥置为未启用。
    for (const k of KEYS) {
      if (k.tenant_id === key.tenant_id && k.domain === key.domain) k.is_active = false;
    }
  }
  key.is_active = isActive;
}

export function mockDeleteDkimKey(id: number): void {
  KEYS = KEYS.filter((k) => k.id !== id);
}
