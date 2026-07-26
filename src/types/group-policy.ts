import type { Rule } from '@/types/unified-rules';

export type PolicyStatus = 'inherit' | 'enable' | 'disable' | 'custom';

export type TargetGroupKey =
  | 'senderGroup'
  | 'senderIpGroup'
  | 'recipientGroup'
  | 'contentGroup'
  | 'featureGroup';

export type TargetGroups = Record<TargetGroupKey, string[]>;

export type StagePolicies = Record<string, PolicyStageEntry>;

export interface PolicyStageEntry {
  status: PolicyStatus;
  params?: Record<string, unknown>;
  // 表格「策略配置」列徽标的差异摘要（如「豁免RBL」「100M/关OCR」），保存时由前端生成
  summary?: string;
}

export interface GroupPolicyMetadata {
  feature: 'group_policy';
  target_groups: TargetGroups;
  stage_policies: StagePolicies;
}

export interface GroupPolicyRule {
  id: number;
  name: string;
  description: string;
  targetGroups: TargetGroups;
  stagePolicies: StagePolicies;
  priority: number;
  isActive: boolean;
  tenantId?: number;
  createdAt: string;
  updatedAt: string;
}

export const TARGET_GROUP_KEYS: TargetGroupKey[] = [
  'senderGroup',
  'senderIpGroup',
  'recipientGroup',
  'contentGroup',
  'featureGroup',
];

export const TARGET_GROUP_TYPE: Record<TargetGroupKey, 'ip' | 'sender' | 'recipient' | 'content' | 'feature'> = {
  senderGroup: 'sender',
  senderIpGroup: 'ip',
  recipientGroup: 'recipient',
  contentGroup: 'content',
  featureGroup: 'feature',
};

export const GROUP_POLICY_PAGE_KEY = 'group_policy';

export const POLICY_TAG_PREFIX = 'gp:';

export const POLICY_STATUSES: PolicyStatus[] = ['inherit', 'enable', 'disable', 'custom'];

export function emptyTargetGroups(): TargetGroups {
  return {
    senderGroup: [],
    senderIpGroup: [],
    recipientGroup: [],
    contentGroup: [],
    featureGroup: [],
  };
}

export function emptyStagePolicies(): StagePolicies {
  return {};
}

export function parseGroupPolicyMetadata(raw: Rule['metadata']): GroupPolicyMetadata | null {
  if (!raw) return null;
  try {
    const obj: Record<string, unknown> = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (obj?.feature !== 'group_policy') return null;
    const tg = (obj.target_groups ?? {}) as Partial<TargetGroups>;
    const sp = (obj.stage_policies ?? {}) as Partial<StagePolicies>;
    return {
      feature: 'group_policy',
      target_groups: {
        senderGroup: Array.isArray(tg.senderGroup) ? tg.senderGroup : [],
        senderIpGroup: Array.isArray(tg.senderIpGroup) ? tg.senderIpGroup : [],
        recipientGroup: Array.isArray(tg.recipientGroup) ? tg.recipientGroup : [],
        contentGroup: Array.isArray(tg.contentGroup) ? tg.contentGroup : [],
        featureGroup: Array.isArray(tg.featureGroup) ? tg.featureGroup : [],
      },
      stage_policies: sp as StagePolicies,
    };
  } catch {
    return null;
  }
}

export function ruleToGroupPolicy(rule: Rule): GroupPolicyRule | null {
  const meta = parseGroupPolicyMetadata(rule.metadata);
  if (!meta) return null;
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description ?? '',
    targetGroups: meta.target_groups,
    stagePolicies: meta.stage_policies,
    priority: rule.priority,
    isActive: rule.is_active,
    tenantId: rule.tenant_id,
    createdAt: rule.created_at,
    updatedAt: rule.updated_at,
  };
}

export interface GroupPolicyFormValues {
  name: string;
  description: string;
  targetGroups: TargetGroups;
  stagePolicies: StagePolicies;
  isActive: boolean;
  priority: number;
}
