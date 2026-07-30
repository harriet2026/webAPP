// 转发规则模拟器 —— demo matchRule/ipMatches 同款前端逻辑（design/origin/demo/components/admin/
// mail-routing/relay-tab.tsx 逐行移植；design/implement/spec/2026-07-28-mail-routing-html-spec-
// alignment-design.md §4.2、webapp/doc/html-spec/admin-forwarding/layer-3-relay-drawer.html）。
//
// 浏览器实测勘误：layer-3 的预览文案摘要写「全空（不命中→默认策略文案）」，但对 demo 真实运行
// （http://localhost:3111/admin/forwarding，三输入全空后点「模拟匹配」）逐字核实的结果是命中
// 优先级最高的已启用规则《内网放行》——因为 ipMatches 对空 sourceIp 输入直接放行（「未提供来源
// IP 时不据此排除」），fromDomain/rcptDomain 判断同样在输入为空时跳过。demo 源码与浏览器行为
// 一致，摘要文案不准；这里以 demo matchRule 同款算法（浏览器验证过）为准，全空输入按当前规则集
// 的优先级顺序命中第一条已启用规则，而不是返回 null。relay-simulator.test.ts 记录了浏览器实测
// 证据，交付报告标注为已确认偏离。

import type { RelayRuleRow } from './relay-mapping';

export interface RelaySimInput {
  sourceIp: string;
  fromDomain: string;
  rcptDomain: string;
}

/** 来源 IP 是否命中（demo 的宽松前缀匹配：只比较 CIDR/IP 的前两段）。 */
function ipMatches(rule: RelayRuleRow, inputSourceIp: string): boolean {
  if (!rule.sourceIp || rule.sourceIp === 'ALL') return true;
  if (!inputSourceIp) return true; // 未提供来源 IP 时不据此排除
  const ips = rule.sourceIp.split(',').map((s) => s.trim());
  if (ips.includes(inputSourceIp)) return true;
  return ips.some((ip) =>
    inputSourceIp.startsWith(ip.split('/')[0].split('.').slice(0, 2).join('.'))
  );
}

/** 单条规则匹配（demo matchRule 同款）。 */
function matchRule(rule: RelayRuleRow, input: RelaySimInput): boolean {
  if (rule.status !== 'enabled') return false;
  // 来源认证：来源 IP 与 SPF 为 OR 关系，任一命中即通过。demo 中 SPF 授权简化为
  // 「输入发信域名与规则发信域名一致（包含）」；真实环境应解析该域的 SPF 记录得出授权 IP 集。
  const spfPass =
    rule.useSpf && !!rule.fromDomain && !!input.fromDomain && input.fromDomain.includes(rule.fromDomain);
  if (!ipMatches(rule, input.sourceIp) && !spfPass) return false;
  if (rule.fromDomain && input.fromDomain && !input.fromDomain.includes(rule.fromDomain)) return false;
  if (rule.rcptDomain && input.rcptDomain) {
    if (rule.rcptMatchType === 'equals' && input.rcptDomain !== rule.rcptDomain) return false;
    if (rule.rcptMatchType === 'contains' && !input.rcptDomain.includes(rule.rcptDomain)) return false;
    if (rule.rcptMatchType === 'regex') {
      try {
        if (!new RegExp(rule.rcptDomain).test(input.rcptDomain)) return false;
      } catch {
        // 正则非法按不命中处理（无报错提示，§9-D11）。
        return false;
      }
    }
  }
  return true;
}

/**
 * 按 rules 给定的顺序（调用方按当前列表的优先级排序传入）逐条匹配，返回第一条命中的规则；
 * 全部不命中返回 null。
 */
export function simulateRelay(rules: RelayRuleRow[], input: RelaySimInput): RelayRuleRow | null {
  return rules.find((r) => matchRule(r, input)) ?? null;
}
