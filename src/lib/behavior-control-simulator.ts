import type {
  BehaviorDimension,
  BehaviorCondition,
  BehaviorControlFormObjectConfig,
} from '@/types/behavior-control';

export type BehaviorObjectMatchReason =
  | 'sender_mismatch'
  | 'ip_mismatch'
  | 'group_unavailable'
  | 'organization_unavailable';

export type BehaviorObjectMatchResult =
  | { matched: true }
  | { matched: false; reason: BehaviorObjectMatchReason };

export interface BehaviorObjectMatchRequest {
  objectConfig: BehaviorControlFormObjectConfig;
  sender: string;
  senderIp: string;
  groupMembers?: string[] | null;
}

export interface BehaviorSimulationInputs {
  uniqueSenderIPCount: number;
  mailCount: number;
  recipientCount: number;
  attachmentSizeMiB: number;
}

export interface BehaviorSimulationRequest {
  conditions: BehaviorCondition[];
  orEnabled: boolean;
  inputs: BehaviorSimulationInputs;
  // 向下兼容旧调用
  dimensionA?: BehaviorDimension;
  thresholdA?: number;
  orEnabled_legacy?: boolean;
  dimensionB?: BehaviorDimension;
  thresholdB?: number;
}

export interface BehaviorSimulationHit {
  condition: string;
  dimension: BehaviorDimension;
  count: number;
  threshold: number;
}

function senderDomain(sender: string): string | null {
  const normalized = sender.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return at > 0 && at < normalized.length - 1 ? normalized.slice(at + 1) : null;
}

function matchesSender(sender: string, target: string): boolean {
  const actual = sender.trim().toLowerCase();
  const expected = target.trim().toLowerCase();
  if (expected.startsWith('*@')) {
    return senderDomain(actual) === expected.slice(2);
  }
  return actual === expected;
}

function parseIPv4(value: string): number | null {
  const octets = value.trim().split('.');
  if (octets.length !== 4) return null;
  let result = 0;
  for (const octet of octets) {
    if (!/^(0|[1-9]\d{0,2})$/.test(octet)) return null;
    const part = Number(octet);
    if (part > 255) return null;
    result = result * 256 + part;
  }
  return result >>> 0;
}

function matchesIP(ip: string, target: string): boolean {
  const expected = target.trim();
  if (!expected.includes('/')) return ip.trim() === expected;

  const [networkRaw, prefixRaw, extra] = expected.split('/');
  const actual = parseIPv4(ip);
  const network = parseIPv4(networkRaw);
  const prefix = Number(prefixRaw);
  if (extra !== undefined || actual === null || network === null
    || !/^\d{1,2}$/.test(prefixRaw) || prefix < 0 || prefix > 32) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (actual & mask) === (network & mask);
}

// 规则运行时会先按适用对象过滤，再累计/判断阈值。模拟器必须保持同样顺序，
// 否则不属于规则对象的测试样本也会因计数超限而被错误报告为命中。
export function matchBehaviorControlObject(
  request: BehaviorObjectMatchRequest,
): BehaviorObjectMatchResult {
  const { objectConfig, sender, senderIp, groupMembers } = request;
  switch (objectConfig.type) {
    case 'global':
      return { matched: true };
    case 'senderDomain':
      return senderDomain(sender) === objectConfig.value.trim().toLowerCase()
        ? { matched: true }
        : { matched: false, reason: 'sender_mismatch' };
    case 'sender':
      switch (objectConfig.sub_type) {
        case 'individual':
          return matchesSender(sender, objectConfig.value)
            ? { matched: true }
            : { matched: false, reason: 'sender_mismatch' };
        case 'group': {
          if (!groupMembers?.length) return { matched: false, reason: 'group_unavailable' };
          const domain = senderDomain(sender);
          const matched = groupMembers.some((member) => (
            member.includes('@')
              ? matchesSender(sender, member)
              // 发件人组的域成员在真实规则中使用 senderdomain/suffix。
              : domain?.endsWith(member.trim().replace(/^@/, '').toLowerCase()) === true
          ));
          return matched
            ? { matched: true }
            : { matched: false, reason: 'sender_mismatch' };
        }
        case 'organization':
          // 浏览器只有测试邮箱，没有该邮箱的部门路径，不能臆造组织归属。
          return { matched: false, reason: 'organization_unavailable' };
      }
    case 'senderIp':
      if (objectConfig.sub_type === 'single') {
        return matchesIP(senderIp, objectConfig.value)
          ? { matched: true }
          : { matched: false, reason: 'ip_mismatch' };
      }
      if (!groupMembers?.length) return { matched: false, reason: 'group_unavailable' };
      return groupMembers.some((member) => matchesIP(senderIp, member))
        ? { matched: true }
        : { matched: false, reason: 'ip_mismatch' };
  }
}

function countForDimension(
  dimension: BehaviorDimension,
  inputs: BehaviorSimulationInputs,
): number | null {
  switch (dimension) {
    case 'ip_count':
      return inputs.uniqueSenderIPCount;
    case 'mail_count':
      return inputs.mailCount;
    case 'recipient_count':
      return inputs.recipientCount;
    case 'attachment_size':
      // 配置/API/命中证据都以 MiB 表示，保持与运行时比较边界一致。
      return inputs.attachmentSizeMiB;
  }
}

// 模拟器只使用用户在抽屉中输入的样本数据，不调用后端接口。
export function simulateBehaviorControl(
  request: BehaviorSimulationRequest,
): BehaviorSimulationHit | null {
  const { conditions, orEnabled, inputs } = request;

  if (!conditions || conditions.length === 0) return null;

  if (orEnabled) {
    // OR 模式：任一条件命中即触发
    for (let i = 0; i < conditions.length; i++) {
      const { dim, threshold } = conditions[i];
      if (!dim || !threshold || threshold <= 0) continue;
      const count = countForDimension(dim, inputs);
      if (count !== null && count >= threshold) {
        return { condition: String(i + 1), dimension: dim, count, threshold };
      }
    }
    return null;
  } else {
    // AND 模式：所有条件同时满足才触发，返回第一个命中的条件作为展示
    const allHit = conditions.every(({ dim, threshold }) => {
      if (!dim || !threshold || threshold <= 0) return false;
      const count = countForDimension(dim, inputs);
      return count !== null && count >= threshold;
    });
    if (!allHit) return null;
    const first = conditions[0];
    const count = countForDimension(first.dim, inputs);
    return { condition: '1', dimension: first.dim, count: count ?? 0, threshold: first.threshold };
  }
}
