import type { Rule, RuleNode } from '@/types/unified-rules';
import type {
  BehaviorControlFormData,
  BehaviorControlMetadata,
  BehaviorControlRuleView,
  RecipientLimitConfig,
  RecipientCheckConfig,
} from '@/types/behavior-control';
import { PRODUCT_TO_BACKEND, BACKEND_TO_PRODUCT } from '@/types/behavior-control';
import type { ApiRequestFn } from './client';
import { apiRequest } from './client';
import { toRFC3339 } from '@/lib/format-time';

export const BEHAVIOR_CONTROL_PAGE = 'behavior_control';

// PostgreSQL JSONB fields are decoded by the unified-rules list endpoint.
// Older API snapshots and mocks still return their serialized representation.
// Keep that wire-format compatibility local to this feature rather than
// weakening the generic Rule contract used by unrelated pages.
export type BehaviorControlRuleWire = Omit<Rule, 'condition_tree' | 'metadata'> & {
  condition_tree: Rule['condition_tree'] | RuleNode;
  metadata?: Rule['metadata'] | Record<string, unknown>;
};

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeBehaviorControlRule(raw: BehaviorControlRuleWire): Rule {
  return {
    ...raw,
    condition_tree: typeof raw.condition_tree === 'string'
      ? raw.condition_tree
      : JSON.stringify(raw.condition_tree),
    metadata: typeof raw.metadata === 'string' || raw.metadata === undefined
      ? raw.metadata
      : JSON.stringify(raw.metadata),
  };
}

export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (s.startsWith('*@')) s = s.slice(2);
  else if (s.startsWith('@')) s = s.slice(1);
  return s;
}

export function buildConditionTreeFromForm(
  data: Pick<BehaviorControlFormData, 'object_config'>,
): RuleNode {
  const o = data.object_config;
  switch (o.type) {
    case 'global':
      return { type: 'condition', field: 'sender', operator: 'isNotNull' };
    case 'sender':
      if (o.sub_type === 'individual')
        return { type: 'condition', field: 'sender', operator: 'eq', value: o.value! };
      return { type: 'condition', field: 'rcpttags', operator: 'hasTag', value: `grp:${o.value!}` };
    case 'senderIp':
      if (o.sub_type === 'single')
        return { type: 'condition', field: 'client_ip', operator: 'eq', value: o.value! };
      return { type: 'condition', field: 'rcpttags', operator: 'hasTag', value: `grp:${o.value!}` };
    case 'senderDomain':
      return { type: 'condition', field: 'senderdomain', operator: 'eq', value: o.value!.toLowerCase() };
  }
}

export function formToCreateBody(form: BehaviorControlFormData) {
  const meta: BehaviorControlMetadata = {
    feature: 'behavior_control',
    direction: form.direction,
    object_config: form.object_config,
    time_window: form.time_window,
    dim_a: form.dim_a,
    threshold_a: form.threshold_a,
    or_enabled: form.or_enabled,
    dim_b: form.or_enabled ? form.dim_b : undefined,
    threshold_b: form.or_enabled ? form.threshold_b : undefined,
  };
  return {
    name: form.name,
    description: form.description ?? '',
    priority: form.priority,
    is_active: form.is_active,
    valid_from: toRFC3339(form.valid_from) ?? null,
    valid_until: toRFC3339(form.valid_until) ?? null,
    page: BEHAVIOR_CONTROL_PAGE,
    stage: 'rcpt',
    rule_class: 'action',
    action: PRODUCT_TO_BACKEND[form.action],
    tags: [],
    metadata: meta,
    condition_tree: buildConditionTreeFromForm(form),
  };
}

export function resolveBehaviorControlRule(rawRule: BehaviorControlRuleWire): BehaviorControlRuleView {
  const rule = normalizeBehaviorControlRule(rawRule);
  let meta: BehaviorControlMetadata | null = null;
  const parsed = parseRecord(rawRule.metadata);
  if (
    parsed?.feature === 'behavior_control' &&
    parsed.direction &&
    parsed.object_config &&
    parsed.time_window &&
    parsed.dim_a &&
    typeof parsed.threshold_a === 'number'
  ) {
    meta = parsed as unknown as BehaviorControlMetadata;
  }
  return {
    rule,
    meta,
    list_id_display: `BC#${rule.id}`,
    is_complex: meta === null,
  };
}

export async function listBehaviorControlRules(
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ items: BehaviorControlRuleWire[] }> {
  return requestFn('/unified-rules?rule_page=behavior_control&rule_class=action&stage=rcpt&page_size=10000');
}

export async function createBehaviorControlRule(
  form: BehaviorControlFormData,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ rule: Rule }> {
  return requestFn('/unified-rules', {
    method: 'POST',
    body: formToCreateBody(form),
  });
}

export async function updateBehaviorControlRule(
  id: number,
  form: BehaviorControlFormData,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ rule: Rule }> {
  return requestFn(`/unified-rules/${id}`, {
    method: 'PUT',
    body: formToCreateBody(form),
  });
}

export async function deleteBehaviorControlRule(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  return requestFn(`/unified-rules/${id}`, { method: 'DELETE' });
}

export async function toggleBehaviorControlRule(
  id: number,
  isActive: boolean,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ rule: Rule }> {
  return requestFn(`/unified-rules/${id}`, {
    method: 'PUT',
    body: { is_active: isActive },
  });
}

export async function getRecipientLimitConfig(
  requestFn: ApiRequestFn = apiRequest,
): Promise<RecipientLimitConfig> {
  return requestFn('/behavior-control/recipient-limit-config');
}

export async function setRecipientLimitConfig(
  config: RecipientLimitConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ status: string }> {
  return requestFn('/behavior-control/recipient-limit-config', {
    method: 'PUT',
    body: config,
  });
}

export async function deleteRecipientLimitConfig(
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ status: string }> {
  return requestFn('/behavior-control/recipient-limit-config', {
    method: 'DELETE',
  });
}

export async function getRecipientCheckConfig(
  requestFn: ApiRequestFn = apiRequest,
): Promise<RecipientCheckConfig> {
  return requestFn('/behavior-control/recipient-check-config');
}

export async function setRecipientCheckConfig(
  config: RecipientCheckConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ status: string }> {
  return requestFn('/behavior-control/recipient-check-config', {
    method: 'PUT',
    body: config,
  });
}

export async function deleteRecipientCheckConfig(
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ status: string }> {
  return requestFn('/behavior-control/recipient-check-config', {
    method: 'DELETE',
  });
}

export { BACKEND_TO_PRODUCT };

// GT-12157：收信人检测的目录可用性。
// 注意语义：存在性验证查的是本地通讯录（contact_book），不是实时打 LDAP，
// 所以这里的「可用」指**同步是否健康、数据是否新鲜**——同步一直失败时通讯录
// 会越来越偏离上游，存在性结论随之不可信。
export interface RecipientDirectoryStatus {
  available: boolean;
  /** available=false 时的原因：no_source | never_synced | last_sync_failed | stale */
  reason?: string;
  source_count: number;
  contact_count: number;
  last_sync_at?: string;
  last_sync_status?: string;
  stale_minutes: number;
}

export async function getRecipientDirectoryStatus(
  requestFn: ApiRequestFn = apiRequest,
): Promise<RecipientDirectoryStatus> {
  return requestFn('/behavior-control/recipient-check/directory-status');
}
