import type { ApiRequestFn } from '@/lib/api/client';
import type { Rule } from '@/types/unified-rules';
import type { Group } from '@/types/groups';
import {
  GROUP_POLICY_PAGE_KEY,
  POLICY_TAG_PREFIX,
  emptyStagePolicies,
  emptyTargetGroups,
  ruleToGroupPolicy,
  type GroupPolicyFormValues,
  type GroupPolicyMetadata,
  type GroupPolicyRule,
} from '@/types/group-policy';

export const GROUP_POLICY_LIST_QUERY = {
  rule_class: 'tag',
  page: GROUP_POLICY_PAGE_KEY,
  include: 'member_count,reference_count',
};

export async function listGroupPolicies(
  apiRequest: ApiRequestFn,
): Promise<GroupPolicyRule[]> {
  const qs = new URLSearchParams(GROUP_POLICY_LIST_QUERY).toString();
  const res = await apiRequest<{ items: Rule[] }>(`/unified-rules?${qs}`, { method: 'GET' });
  return (res.items ?? [])
    .map(ruleToGroupPolicy)
    .filter((r): r is GroupPolicyRule => r != null);
}

export interface GroupPolicyPayload {
  name: string;
  description: string;
  rule_class: 'tag';
  stage: 'data';
  page: typeof GROUP_POLICY_PAGE_KEY;
  tags: string[];
  condition_tree: { type: 'AND'; children: never[] };
  metadata: GroupPolicyMetadata;
  is_active: boolean;
  priority?: number;
  tenant_id?: number | null;
}

export function buildGroupPolicyPayload(
  values: GroupPolicyFormValues,
  isCreate: boolean,
  tenantId?: number | null,
): GroupPolicyPayload {
  const metadata: GroupPolicyMetadata = {
    feature: 'group_policy',
    target_groups: values.targetGroups,
    stage_policies: values.stagePolicies,
  };
  const base: Omit<GroupPolicyPayload, 'rule_class'> = {
    name: values.name,
    description: values.description,
    stage: 'data',
    page: GROUP_POLICY_PAGE_KEY,
    tags: [POLICY_TAG_PREFIX + values.name],
    condition_tree: { type: 'AND', children: [] },
    metadata,
    is_active: values.isActive,
    priority: values.priority,
  };
  // group_policy is tenant-scoped: the API rejects a create with no tenant in
  // multi-tenant mode ("group policy requires a tenant in multi-tenant mode").
  // Scope the create to the console's active tenant so a system_admin viewing a
  // specific tenant can save. Updates never re-scope (the rule keeps its tenant).
  if (isCreate && tenantId != null) {
    return { ...base, rule_class: 'tag' as const, tenant_id: tenantId };
  }
  return { ...base, rule_class: 'tag' as const };
}

export function createGroupPolicy(
  apiRequest: ApiRequestFn,
  values: GroupPolicyFormValues,
  tenantId?: number | null,
): Promise<Rule> {
  return apiRequest<Rule>('/unified-rules', {
    method: 'POST',
    body: buildGroupPolicyPayload(values, true, tenantId),
  });
}

export function updateGroupPolicy(
  apiRequest: ApiRequestFn,
  id: number,
  values: GroupPolicyFormValues,
): Promise<Rule> {
  const payload = buildGroupPolicyPayload(values, false);
  return apiRequest<Rule>(`/unified-rules/${id}`, {
    method: 'PUT',
    body: payload,
  });
}

export function deleteGroupPolicy(apiRequest: ApiRequestFn, id: number): Promise<void> {
  return apiRequest<void>(`/unified-rules/${id}`, { method: 'DELETE' });
}

export function emptyFormValues(): GroupPolicyFormValues {
  return {
    name: '',
    description: '',
    targetGroups: emptyTargetGroups(),
    stagePolicies: emptyStagePolicies(),
    isActive: true,
    priority: 100,
  };
}

// GT-12276：优先级范围与服务端 validatePriority 同口径——项目全局 0-9999，
// 租户管理员收窄为 100-1000（GT-11507）。数值越大越优先。
export function groupPolicyPriorityRange(isSystemAdmin: boolean): { min: number; max: number } {
  return isSystemAdmin ? { min: 0, max: 9999 } : { min: 100, max: 1000 };
}

export function groupPolicyPriorityOutOfRange(priority: number, isSystemAdmin: boolean): boolean {
  const { min, max } = groupPolicyPriorityRange(isSystemAdmin);
  return priority < min || priority > max;
}

// GT-12273：目标群组下拉只保留可保存的活跃群组——服务端 validateTargetGroups
// 会跳过 is_active=false 的群组行（选中后保存必然 400 "target group not found
// or not visible"），失效项不该成为可选项。
export function selectableTargetGroups(rules: Rule[], toGroup: (r: Rule) => Group | null): Group[] {
  return rules
    .map(toGroup)
    .filter((g): g is Group => g != null && g.isActive);
}
