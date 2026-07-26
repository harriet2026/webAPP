import type { DemoAction, DemoBlacklistAction, DemoWhitelistAction, IPFilterListType } from '@/types/ip-filter';

/** CIDR → 覆盖的 IP 数量（对齐 demo calculateIpCount，仅 IPv4 估算）。 */
export function calculateIpCount(ipAddress: string): number {
  if (!ipAddress) return 0;
  if (ipAddress.includes('/')) {
    const cidr = parseInt(ipAddress.split('/')[1], 10);
    if (Number.isNaN(cidr) || cidr < 0 || cidr > 32) return 0;
    return Math.pow(2, 32 - cidr);
  }
  return 1;
}

/** 数量格式化 K/M（对齐 demo formatIpCount）。 */
export function formatIpCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

/** demo 的简化匹配逻辑（CIDR 取前两段前缀比较，单 IP 全等）。仅用于模拟测试展示。 */
export function ipInRangeSimple(testIp: string, ruleIp: string): boolean {
  if (!testIp || !ruleIp) return false;
  if (ruleIp.includes('/')) {
    const [network] = ruleIp.split('/');
    const n = network.split('.');
    const t = testIp.split('.');
    return n[0] === t[0] && n[1] === t[1];
  }
  return testIp === ruleIp;
}

/** demo 动作 → 效果描述 i18n key（当前配置效果区）。 */
export const DEMO_ACTION_EFFECT_KEY: Record<DemoAction, string> = {
  block: 'ipFilter.effectBlock',
  quarantine: 'ipFilter.effectQuarantine',
  drop: 'ipFilter.effectDrop',
  review: 'ipFilter.effectReview',
  deliver: 'ipFilter.effectDeliver',
  tagDeliver: 'ipFilter.effectTagDeliver',
};

export interface IPConfigExample {
  id: string;
  nameKey: string;
  descKey: string;
  remarkKey: string;
  effectKey: string;
  ip: string;
  action: DemoAction;
}

/** 配置示例（对齐 demo configExamples）。 */
export function getConfigExamples(listType: IPFilterListType): IPConfigExample[] {
  if (listType === 'blacklist') {
    return [
      {
        id: 'spam-source',
        nameKey: 'ipFilter.exampleSpamSource',
        descKey: 'ipFilter.exampleSpamSourceDesc',
        remarkKey: 'ipFilter.exampleSpamSourceRemark',
        effectKey: 'ipFilter.exampleSpamSourceEffect',
        ip: '203.0.113.0/24',
        action: 'block' satisfies DemoBlacklistAction,
      },
      {
        id: 'suspicious-ip',
        nameKey: 'ipFilter.exampleSuspiciousIp',
        descKey: 'ipFilter.exampleSuspiciousIpDesc',
        remarkKey: 'ipFilter.exampleSuspiciousIpRemark',
        effectKey: 'ipFilter.exampleSuspiciousIpEffect',
        ip: '198.51.100.0/24',
        action: 'quarantine' satisfies DemoBlacklistAction,
      },
    ];
  }
  return [
    {
      id: 'internal-network',
      nameKey: 'ipFilter.exampleInternalNetwork',
      descKey: 'ipFilter.exampleInternalNetworkDesc',
      remarkKey: 'ipFilter.exampleInternalNetworkRemark',
      effectKey: 'ipFilter.exampleInternalNetworkEffect',
      ip: '192.168.0.0/16',
      action: 'deliver' satisfies DemoWhitelistAction,
    },
    {
      id: 'partner-ip',
      nameKey: 'ipFilter.examplePartnerIp',
      descKey: 'ipFilter.examplePartnerIpDesc',
      remarkKey: 'ipFilter.examplePartnerIpRemark',
      effectKey: 'ipFilter.examplePartnerIpEffect',
      ip: '10.0.0.0/8',
      action: 'tagDeliver' satisfies DemoWhitelistAction,
    },
  ];
}
