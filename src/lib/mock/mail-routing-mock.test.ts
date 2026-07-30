import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch, isMockable } from './dispatcher';
import {
  __resetMailRoutingMock,
  mrMockDomains,
  mrMockAdmissionRules,
  mrMockProxies,
  mrMockChannels,
  mrMockOutboundRules,
  mrMockAuthConfigs,
} from './fixtures';
import type { TenantDomain, TenantDomainNexthop } from '@/types/tenant';
import type { Rule } from '@/types/unified-rules';
import type { MailAuthConfig } from '@/lib/api/mail-auth';

// 邮件路由 html_spec 对齐（task-2-brief.md）+ 接通真实后端（Task 13）mock 覆盖契约。覆盖
// task-13-brief.md 退役清单后的新端点表，并对关键 fixture 形状做逐值断言。

beforeEach(() => {
  __resetMailRoutingMock();
});

describe('mail-routing mock 路由覆盖（isMockable 全表）', () => {
  it('每一条 (method,path) 都命中 mock', () => {
    const rows: [string, string][] = [
      ['GET', '/routing/_meta/scope'],
      ['GET', '/tenants/1/domains'],
      ['POST', '/tenants/1/domains'],
      ['GET', '/tenants/1/domains/9001/nexthops'],
      ['POST', '/tenants/1/domains/9001/nexthops'],
      ['PUT', '/tenants/1/domains/9001/nexthops/950001'],
      ['DELETE', '/tenants/1/domains/9001/nexthops/950001'],
      ['POST', '/tenants/1/domains/9001/probe'],
      ['PUT', '/tenant-domains/9001'],
      ['DELETE', '/tenant-domains/9001'],
      ['GET', '/mail-admission-rules'],
      ['POST', '/mail-admission-rules'],
      ['PUT', '/mail-admission-rules/8001'],
      ['DELETE', '/mail-admission-rules/8001'],
      ['GET', '/mail-admission/_meta/policy'],
      ['PUT', '/mail-admission/_meta/policy'],
      ['GET', '/unified-rules?rule_class=route&stage=data&page=mail_routing_outbound&page_size=500'],
      ['PUT', '/unified-rules/5001'],
      ['PUT', '/unified-rules/5001/status'],
      ['POST', '/unified-rules/5001/status'],
      ['DELETE', '/unified-rules/5001'],
      ['GET', '/proxysvr-groups/_meta/active'],
      ['GET', '/mail-auth-configs'],
      ['POST', '/mail-auth-configs'],
      ['PUT', '/mail-auth-configs/7001'],
      ['DELETE', '/mail-auth-configs/7001'],
      ['POST', '/mail-auth-configs/test'],
      ['GET', '/proxysvr-endpoints'],
      ['POST', '/proxysvr-endpoints'],
      ['PUT', '/proxysvr-endpoints/3001'],
      ['DELETE', '/proxysvr-endpoints/3001'],
      ['POST', '/proxysvr-endpoints/3001/probe'],
      ['GET', '/proxysvr-groups'],
      ['POST', '/proxysvr-groups'],
      ['PUT', '/proxysvr-groups/4001'],
      ['DELETE', '/proxysvr-groups/4001'],
      ['POST', '/mail-routing/connectivity-test'],
    ];
    for (const [method, path] of rows) {
      expect(isMockable(method, path), `${method} ${path}`).toBe(true);
    }
  });

  it('也兼容 rule_page= 变体（现有 getUnifiedRules() 通用函数实际发的 query 键）', () => {
    expect(isMockable('GET', '/unified-rules?rule_class=route&stage=data&rule_page=mail_routing_outbound')).toBe(true);
  });

  it('不吞掉其它模块对 /unified-rules/{id} 的无 scope 写操作（回归：group-policy 契约保持不变）', () => {
    expect(isMockable('PUT', '/unified-rules/123')).toBe(false);
    // 非 5xxx 段 id 的 DELETE 命中的是既有的泛化兜底路由（其它模块遗留），
    // 不是本模块新增——钉住现状，防止误以为 5xxx 收窄改变了它。
    expect(isMockable('DELETE', '/unified-rules/123')).toBe(true);
    expect(isMockable('POST', '/unified-rules')).toBe(false);
  });

  it('/relay-grants 系已随后端一并退役，不再被 mock（doc/mail-routing.md「已移除：/relay-grants*」）', () => {
    expect(isMockable('GET', '/relay-grants')).toBe(false);
    expect(isMockable('POST', '/relay-grants')).toBe(false);
  });
});

describe('mail-routing mock 数据形状', () => {
  it('收信域列表 5 行，形状为 TenantDomain（verify_status/is_active 齐全）', () => {
    expect(mrMockDomains).toHaveLength(5);
    const res = dispatch({ method: 'GET', path: '/tenants/1/domains' });
    expect(res.status).toBe(200);
    const items = (res.data as { items: TenantDomain[] }).items;
    expect(items).toHaveLength(5);
    expect(items.map((d) => [d.id, d.domain, d.verify_status, d.is_active])).toEqual([
      [9001, 'example.cn', 'verified', true],
      [9002, 'mail.example.cn', 'verified', true],
      [9003, 'corp.example.com', 'verified', true],
      [9004, 'legacy.example.net', 'verified', true],
      [9005, 'newdomain.cn', 'verified', true],
    ]);
  });

  it('收信域探测聚合状态与 demo 状态分布一致（含部分异常域 9003 的 2/4 异常路数）', () => {
    const list = dispatch({ method: 'GET', path: '/tenants/1/domains/9003/nexthops' });
    const nexthops = (list.data as { items: TenantDomainNexthop[] }).items;
    expect(nexthops).toHaveLength(4);
    expect(nexthops.filter((n) => n.probe_status === 'abnormal')).toHaveLength(2);
    expect(nexthops.filter((n) => n.probe_status === 'normal')).toHaveLength(2);

    const unchecked = dispatch({ method: 'GET', path: '/tenants/1/domains/9005/nexthops' });
    const uItems = (unchecked.data as { items: TenantDomainNexthop[] }).items;
    expect(uItems.every((n) => n.probe_status === 'unchecked')).toBe(true);
  });

  it('转发放行 3 行，DEV-1 优先级换算后为 990/950/1（demo 10/50/999 保序反转），priority/helo_pattern/rcpt_domain/rcpt_match 为真实字段', () => {
    expect(mrMockAdmissionRules).toHaveLength(3);
    const res = dispatch({ method: 'GET', path: '/mail-admission-rules' });
    const items = (res.data as { items: Array<{ id: number; note: string; priority: number; helo_pattern: string; rcpt_domain: string; rcpt_match: string }> }).items;
    expect(items.map((g) => [g.id, g.note, g.priority, g.helo_pattern, g.rcpt_domain, g.rcpt_match])).toEqual([
      [8001, '内网放行', 990, '', 'example.cn', 'equals'],
      [8002, '合作伙伴转发', 950, 'partner.com', 'example.cn', 'contains'],
      [8003, '兜底拒绝', 1, '', '', 'contains'],
    ]);
  });

  it('发信认证 3 行，7001 为 ssl_enabled:false + protocol_config.starttls:false（tlsMode=off 双布尔映射）', () => {
    expect(mrMockAuthConfigs).toHaveLength(3);
    const res = dispatch({ method: 'GET', path: '/mail-auth-configs' });
    const items = (res.data as { items: MailAuthConfig[] }).items;
    expect(items).toHaveLength(3);
    const a7001 = items.find((c) => c.id === 7001)!;
    expect(a7001.ssl_enabled).toBe(false);
    expect((a7001.protocol_config as { starttls?: boolean }).starttls).toBe(false);
    expect((a7001.protocol_config as { skip_verify?: boolean }).skip_verify).toBe(false);

    const a7002 = items.find((c) => c.id === 7002)!;
    expect(a7002.ssl_enabled).toBe(true);
    expect((a7002.protocol_config as { starttls?: boolean }).starttls).toBe(false);

    const a7003 = items.find((c) => c.id === 7003)!;
    expect(a7003.ssl_enabled).toBe(false);
    expect((a7003.protocol_config as { starttls?: boolean; skip_verify?: boolean }).starttls).toBe(true);
    expect((a7003.protocol_config as { starttls?: boolean; skip_verify?: boolean }).skip_verify).toBe(true);
  });

  it('出站规则 → unified 规则形状，metadata.tls_level + 顶层 tls_success_rate 为真实字段，优先级已转换为 900/980', () => {
    expect(mrMockOutboundRules).toHaveLength(2);
    const res = dispatch({ method: 'GET', path: '/unified-rules?rule_class=route&stage=data&page=mail_routing_outbound' });
    const items = (res.data as { items: Rule[] }).items;
    expect(items).toHaveLength(2);
    const r5001 = items.find((r) => r.id === 5001)!;
    expect(r5001.priority).toBe(900);
    expect(r5001.rule_class).toBe('route');
    expect(r5001.stage).toBe('data');
    expect(r5001.tls_success_rate).toBe(98);
    const meta5001 = JSON.parse(r5001.metadata!) as { channel: string; proxysvr_group_id: number; tls_level: string };
    expect(meta5001.channel).toBe('proxysvr');
    expect(meta5001.proxysvr_group_id).toBe(4001);
    expect(meta5001.tls_level).toBe('prefer');

    const r5002 = items.find((r) => r.id === 5002)!;
    expect(r5002.priority).toBe(980);
    expect(r5002.tls_success_rate).toBe(87);
    const meta5002 = JSON.parse(r5002.metadata!) as { channel: string; proxysvr_group_id: number; tls_level: string };
    expect(meta5002.channel).toBe('proxysvr');
    expect(meta5002.proxysvr_group_id).toBe(4002);
    expect(meta5002.tls_level).toBe('force_verify');
  });

  it('代理 IP（proxysvr-endpoints）3 行，字段含真实 lid/presend_code/use_tls/license_present', () => {
    expect(mrMockProxies).toHaveLength(3);
    const res = dispatch({ method: 'GET', path: '/proxysvr-endpoints' });
    const items = (res.data as { items: Array<Record<string, unknown>> }).items;
    expect(items).toHaveLength(3);
    expect(items.map((p) => [p.id, p.name, p.host, p.lid, p.use_tls, p.license_present, p.is_active, p.probe_status])).toEqual([
      [3001, '主出口-电信', '1.1.1.1', 'lid-3001', false, false, true, 'normal'],
      [3002, '备出口-联通', '1.1.1.2', 'lid-3002', false, false, true, 'normal'],
      [3003, '高安全出口', '1.1.1.3', 'lid-3003', true, true, false, 'abnormal'],
    ]);
  });

  it('投递通道（proxysvr-groups）2 行，members 为有序 {endpoint_id,ord}；/proxysvr-groups/_meta/active 只投影 is_active', () => {
    expect(mrMockChannels).toHaveLength(2);
    const res = dispatch({ method: 'GET', path: '/proxysvr-groups' });
    const items = (res.data as { items: Array<{ id: number; name: string; members: Array<{ endpoint_id: number; ord: number }> }> }).items;
    expect(items.map((c) => [c.id, c.name, c.members])).toEqual([
      [4001, '测试通道', [{ endpoint_id: 3001, ord: 0 }, { endpoint_id: 3002, ord: 1 }]],
      [4002, '高安全通道', [{ endpoint_id: 3003, ord: 0 }]],
    ]);

    const active = dispatch({ method: 'GET', path: '/proxysvr-groups/_meta/active' });
    expect((active.data as { items: Array<{ id: number }> }).items.map((g) => g.id)).toEqual([4001, 4002]);
  });
});

describe('mail-routing mock 写操作维护内存态', () => {
  it('收信域 CRUD：新建→更新→探测→删除', () => {
    const created = dispatch({
      method: 'POST',
      path: '/tenants/1/domains',
      body: { domain: 'new.example.cn', next_hop_host: '192.168.9.1', next_hop_port: 25 },
    });
    expect(created.status).toBe(201);
    const domain = created.data as TenantDomain;
    expect(domain.domain).toBe('new.example.cn');

    const updated = dispatch({ method: 'PUT', path: `/tenant-domains/${domain.id}`, body: { domain: 'renamed.example.cn' } });
    expect((updated.data as TenantDomain).domain).toBe('renamed.example.cn');

    const probed = dispatch({ method: 'POST', path: `/tenants/1/domains/${domain.id}/probe` });
    expect(probed.status).toBe(200);
    expect(['normal', 'partial', 'abnormal']).toContain((probed.data as { probe_status: string }).probe_status);

    const deleted = dispatch({ method: 'DELETE', path: `/tenant-domains/${domain.id}` });
    expect(deleted.status).toBe(200);
    const list = dispatch({ method: 'GET', path: '/tenants/1/domains' });
    expect((list.data as { items: TenantDomain[] }).items.find((d) => d.id === domain.id)).toBeUndefined();
  });

  it('转发放行 CRUD：新建→更新→删除', () => {
    const created = dispatch({
      method: 'POST',
      path: '/mail-admission-rules',
      body: { client_cidr: '10.1.0.0/16', note: '测试', priority: 700 },
    });
    expect(created.status).toBe(201);
    const id = (created.data as { id: number }).id;
    expect((created.data as { priority: number }).priority).toBe(700);

    const updated = dispatch({ method: 'PUT', path: `/mail-admission-rules/${id}`, body: { note: '测试-已改' } });
    expect((updated.data as { note: string }).note).toBe('测试-已改');

    expect(dispatch({ method: 'DELETE', path: `/mail-admission-rules/${id}` }).status).toBe(200);
    const list = dispatch({ method: 'GET', path: '/mail-admission-rules' });
    expect((list.data as { items: Array<{ id: number }> }).items.find((g) => g.id === id)).toBeUndefined();
  });

  it('出站规则状态开关 PUT/POST 与 DELETE 在会话内生效，且不影响其它模块的 90xx/无 scope 路由', () => {
    const toggled = dispatch({ method: 'PUT', path: '/unified-rules/5001/status', body: { is_active: false } });
    expect((toggled.data as Rule).is_active).toBe(false);

    const toggledBack = dispatch({ method: 'POST', path: '/unified-rules/5001/status', body: { is_active: true } });
    expect((toggledBack.data as Rule).is_active).toBe(true);

    const renamed = dispatch({ method: 'PUT', path: '/unified-rules/5002', body: { name: '金融合作方-已改' } });
    expect((renamed.data as Rule).name).toBe('金融合作方-已改');

    expect(dispatch({ method: 'DELETE', path: '/unified-rules/5002' }).status).toBe(200);
    const list = dispatch({ method: 'GET', path: '/unified-rules?page=mail_routing_outbound' });
    expect((list.data as { items: Rule[] }).items.map((r) => r.id)).toEqual([5001]);
  });

  it('编辑出站规则时 metadata.tls_level 可写，但顶层 tls_success_rate 是服务端只读聚合（写请求不改变它）', () => {
    const updated = dispatch({
      method: 'PUT',
      path: '/unified-rules/5001',
      body: { metadata: { channel: 'smtp', next_hop_host: 'smtp.out.example.com', next_hop_port: 25, tls_level: 'force' } },
    });
    const rule = updated.data as Rule;
    expect(JSON.parse(rule.metadata!).tls_level).toBe('force');
    // tlsSuccessRate 未随这次写请求变化（真实后端语义：只读聚合，PUT 不接受该字段）。
    expect(rule.tls_success_rate).toBe(98);
  });

  it('发信认证 CRUD + 测试连接（900ms 语义落在 latency_ms，success 为 boolean）', () => {
    const created = dispatch({
      method: 'POST',
      path: '/mail-auth-configs',
      body: { protocol: 'pop3', server_host: 'pop3.example.cn', server_port: 110 },
    });
    expect(created.status).toBe(201);
    const id = (created.data as { id: number }).id;

    expect(dispatch({ method: 'DELETE', path: `/mail-auth-configs/${id}` }).status).toBe(200);

    const test = dispatch({ method: 'POST', path: '/mail-auth-configs/test', body: {} });
    const result = test.data as { success: boolean; message: string; latency_ms: number };
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
    expect(result.latency_ms).toBeGreaterThanOrEqual(850);
    expect(result.latency_ms).toBeLessThan(1000);
  });

  it('代理 IP CRUD 与探测（POST /proxysvr-endpoints/:id/probe 回写 probe_status/last_probe_time）', () => {
    const proxy = dispatch({ method: 'POST', path: '/proxysvr-endpoints', body: { name: '新代理', host: '2.2.2.2', lid: 'lid-new' } });
    expect(proxy.status).toBe(201);
    const proxyId = (proxy.data as { id: number }).id;
    expect((proxy.data as { probe_status: string }).probe_status).toBe('unchecked');

    const probed = dispatch({ method: 'POST', path: `/proxysvr-endpoints/${proxyId}/probe` });
    expect(probed.status).toBe(200);
    expect(['normal', 'abnormal']).toContain((probed.data as { probe_status: string }).probe_status);

    expect(dispatch({ method: 'DELETE', path: `/proxysvr-endpoints/${proxyId}` }).status).toBe(200);
  });

  it('投递通道 CRUD；被出站规则引用的通道删除返回 409（真实后端「被引用不可删」语义）', () => {
    const channel = dispatch({ method: 'POST', path: '/proxysvr-groups', body: { name: '新通道', members: [{ endpoint_id: 3001, ord: 0 }] } });
    expect(channel.status).toBe(201);
    const channelId = (channel.data as { id: number }).id;
    expect(dispatch({ method: 'DELETE', path: `/proxysvr-groups/${channelId}` }).status).toBe(200);

    // 4001 被 mrMockOutboundRules 的 5001 引用，删除必须 409。
    const blocked = dispatch({ method: 'DELETE', path: '/proxysvr-groups/4001' });
    expect(blocked.status).toBe(409);
    expect((blocked.data as { error: { code: string; message: string } }).error.code).toBe('conflict');
  });

  it('__resetMailRoutingMock 复位所有会话内状态', () => {
    dispatch({ method: 'DELETE', path: '/mail-admission-rules/8001' });
    dispatch({ method: 'PUT', path: '/unified-rules/5001/status', body: { is_active: false } });
    __resetMailRoutingMock();
    const rules = dispatch({ method: 'GET', path: '/mail-admission-rules' });
    expect((rules.data as { items: Array<{ id: number }> }).items).toHaveLength(3);
    const outboundRules = dispatch({ method: 'GET', path: '/unified-rules?page=mail_routing_outbound' });
    expect((outboundRules.data as { items: Rule[] }).items.find((r) => r.id === 5001)!.is_active).toBe(true);
  });
});
