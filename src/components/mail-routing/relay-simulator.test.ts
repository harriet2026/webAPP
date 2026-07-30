import { describe, it, expect } from 'vitest';
import { simulateRelay } from './relay-simulator';
import type { RelayRuleRow } from './relay-mapping';

// demo 三条 fixture（design/origin/demo/components/admin/mail-routing/types.ts
// MOCK_RELAY_RULES，逐字段抄录并换算优先级 DEV-1：990/950/1，数组按降序排列，
// 与列表渲染顺序一致，模拟器按此顺序逐条匹配）。

const innerAllow: RelayRuleRow = {
  id: 8001,
  ruleName: '内网放行',
  priority: 990,
  sourceIp: '192.168.0.0/16',
  useSpf: false,
  heloValue: '',
  fromDomain: 'example.cn',
  rcptDomain: 'example.cn',
  rcptMatchType: 'equals',
  spamFilter: false,
  status: 'enabled',
  updatedAt: '2026-06-18 09:00:00',
};

const partnerForward: RelayRuleRow = {
  id: 8002,
  ruleName: '合作伙伴转发',
  priority: 950,
  sourceIp: '203.0.113.5,203.0.113.6',
  useSpf: true,
  heloValue: 'partner.com',
  fromDomain: 'partner.com',
  rcptDomain: 'example.cn',
  rcptMatchType: 'contains',
  spamFilter: true,
  status: 'enabled',
  updatedAt: '2026-06-17 18:22:30',
};

const fallbackDeny: RelayRuleRow = {
  id: 8003,
  ruleName: '兜底拒绝',
  priority: 1,
  sourceIp: 'ALL',
  useSpf: false,
  heloValue: '',
  fromDomain: '',
  rcptDomain: '',
  rcptMatchType: 'contains',
  spamFilter: true,
  status: 'disabled',
  updatedAt: '2026-06-15 11:05:12',
};

const rules = [innerAllow, partnerForward, fallbackDeny];

describe('simulateRelay', () => {
  it('192.168.1.5 / example.cn / example.cn → 命中《内网放行》（宽松前缀匹配 IP + 收信域等于）', () => {
    const hit = simulateRelay(rules, { sourceIp: '192.168.1.5', fromDomain: 'example.cn', rcptDomain: 'example.cn' });
    expect(hit?.id).toBe(8001);
  });

  it('203.0.113.5 / partner.com / example.cn → 命中《合作伙伴转发》（精确 IP 命中，SPF 也应为 OR 命中）', () => {
    const hit = simulateRelay(rules, { sourceIp: '203.0.113.5', fromDomain: 'partner.com', rcptDomain: 'example.cn' });
    expect(hit?.id).toBe(8002);
  });

  it('SPF OR 关系：IP 不在池内但发信域名命中 SPF 简化判定 → 仍命中', () => {
    const hit = simulateRelay(rules, { sourceIp: '8.8.8.8', fromDomain: 'partner.com', rcptDomain: 'example.cn' });
    expect(hit?.id).toBe(8002);
  });

  it('全部字段不匹配任何已启用规则 → null（真实的「未命中」场景）', () => {
    // 8.8.8.8 不落在任一规则的 CIDR/前缀内；other.org 既不含 example.cn 也不含
    // partner.com（SPF 简化判定同样落空）；禁用的兜底规则本就被跳过。
    const hit = simulateRelay(rules, { sourceIp: '8.8.8.8', fromDomain: 'other.org', rcptDomain: 'other.org' });
    expect(hit).toBeNull();
  });

  it('三输入全空 → 命中优先级最高的已启用规则《内网放行》（浏览器实测勘误，见 relay-simulator.ts 顶部注释）', () => {
    // http://localhost:3111/admin/forwarding 新建抽屉，三个模拟器输入框留空直接点
    // 「模拟匹配」，实测结果框文案为「命中规则《内网放行》，动作：允许通过（垃圾邮件过滤：
    // 否）」——ipMatches 对空 sourceIp 输入直接放行（demo 注释「未提供来源 IP 时不据此排
    // 除」），fromDomain/rcptDomain 判断在输入为空时同样跳过，因此第一条已启用规则必中。
    // layer-3-relay-drawer.html 的预览摘要写「全空→不命中」与该实测结果不符，这里以浏览器
    // 验证过的 demo 真实行为为准（demo matchRule 同款移植）。
    const hit = simulateRelay(rules, { sourceIp: '', fromDomain: '', rcptDomain: '' });
    expect(hit?.id).toBe(8001);
    expect(hit?.ruleName).toBe('内网放行');
  });

  it('禁用规则跳过：单条禁用规则即使 CIDR/域名都命中也不返回', () => {
    const hit = simulateRelay([fallbackDeny], { sourceIp: '1.2.3.4', fromDomain: 'x.com', rcptDomain: 'y.com' });
    expect(hit).toBeNull();
  });

  it('非法正则不命中（不抛错，静默按不匹配处理）', () => {
    const badRegexRule: RelayRuleRow = {
      ...innerAllow,
      rcptMatchType: 'regex',
      rcptDomain: '(unterminated[', // 非法正则
    };
    expect(() =>
      simulateRelay([badRegexRule], { sourceIp: '192.168.1.5', fromDomain: 'example.cn', rcptDomain: 'example.cn' })
    ).not.toThrow();
    const hit = simulateRelay([badRegexRule], { sourceIp: '192.168.1.5', fromDomain: 'example.cn', rcptDomain: 'example.cn' });
    expect(hit).toBeNull();
  });

  it('合法正则命中', () => {
    const regexRule: RelayRuleRow = { ...innerAllow, rcptMatchType: 'regex', rcptDomain: '^example\\.(cn|com)$' };
    const hit = simulateRelay([regexRule], { sourceIp: '192.168.1.5', fromDomain: 'example.cn', rcptDomain: 'example.cn' });
    expect(hit?.id).toBe(8001);
  });
});
