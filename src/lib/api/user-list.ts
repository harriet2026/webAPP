import type { Rule, RuleNode } from '@/types/unified-rules';
import type { ApiRequestFn } from './client';
import { apiRequest } from './client';

export const USER_LIST_PAGE = 'user_list';

export type UserListAction = 'block' | 'quarantine' | 'whitelist';
export type ListType = 'blacklist' | 'whitelist';

export interface UserListView {
  id: number;
  ruleId: string;
  sender: string;
  recipient: string;
  action: UserListAction;
  status: 'enabled' | 'disabled';
  createdBy: string;
  modifyTime: string;
  listType: ListType;
  raw: Rule;
}

export interface UserListRulesParams {
  listType: ListType;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface UserListRulesResult {
  items: Rule[];
  total: number;
  page: number;
  pageSize: number;
  // Old mock fixtures return only { items }. Keep the page compatible while
  // production uses the paginated API contract.
  serverPaginated: boolean;
}

function parseRuleObject(value: unknown): Record<string, unknown> | null {
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

function parseRuleTree(value: unknown): RuleNode | null {
  return parseRuleObject(value) as RuleNode | null;
}

// The backend may return JSONB columns either as encoded strings or decoded
// objects. Normalize both legal wire forms before deriving user-list fields.
export function userListTypeFromRule(rule: Rule): ListType {
  const listType = parseRuleObject(rule.metadata)?.list_type;
  if (listType === 'whitelist' || listType === 'blacklist') return listType;
  return rule.action === 'accept' ? 'whitelist' : 'blacklist';
}

function findField(tree: RuleNode | null, fields: string[]): string {
  if (!tree) return '';
  if (tree.type === 'condition' && tree.field && fields.includes(tree.field)) return tree.value ?? '';
  for (const c of tree.children ?? []) {
    const v = findField(c, fields);
    if (v) return v;
  }
  return '';
}

function actionToView(action: string | undefined, listType: ListType): UserListAction {
  if (listType === 'whitelist' || action === 'accept') return 'whitelist';
  if (action === 'reject') return 'block';
  return 'quarantine';
}

export function formatUserListId(rule: Rule, listType: ListType): string {
  const prefix = listType === 'blacklist' ? 'UB' : 'UW';
  const d = new Date(rule.created_at);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${prefix}-${ymd}-${String(rule.id).padStart(3, '0')}`;
}

export function resolveUserListRule(rule: Rule, listType: ListType): UserListView {
  const tree = parseRuleTree(rule.condition_tree);
  const owner = parseRuleObject(rule.metadata)?.owner;
  return {
    id: rule.id,
    ruleId: formatUserListId(rule, listType),
    sender: findField(tree, ['sender', 'senderdomain']),
    recipient: findField(tree, ['onercpt', 'rcpttags']),
    action: actionToView(rule.action, listType),
    status: rule.is_active ? 'enabled' : 'disabled',
    createdBy: typeof owner === 'string' ? owner : '',
    modifyTime: rule.updated_at,
    listType,
    raw: rule,
  };
}

export async function listUserListRules(
  params: UserListRulesParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<UserListRulesResult> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  const query = new URLSearchParams({
    rule_page: USER_LIST_PAGE,
    rule_class: 'action',
    stage: 'rcpt',
    list_type: params.listType,
    page: String(page),
    page_size: String(pageSize),
  });
  if (params.search?.trim()) query.set('search', params.search.trim());

  const response = await requestFn<{
    items?: Rule[];
    total?: number;
    page?: number;
    page_size?: number;
  }>(`/unified-rules?${query.toString()}`);
  const items = response.items ?? [];
  const serverPaginated = typeof response.total === 'number';
  return {
    items,
    total: response.total ?? items.length,
    page: serverPaginated ? (response.page ?? page) : page,
    pageSize: serverPaginated ? (response.page_size ?? pageSize) : pageSize,
    serverPaginated,
  };
}

// Carry the page namespace on an ID-based generic route. The server can then
// reject an unauthorized request before looking up the numeric ID, avoiding an
// existence oracle for tenant-scoped user-list rows.
export async function deleteUserListRule(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  await requestFn(`/unified-rules/${id}?rule_page=user_list`, { method: 'DELETE' });
}

// API 契约禁止 `batch`，复用 bulk 端点（internal/api/CLAUDE.md）。
// 后端为不破坏既有调用方会「加字段」返回 deleted/failed，缺失时容错回退。
export async function bulkDeleteUserListRules(
  ids: number[],
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ deleted: number[]; failed: { id: number; reason: string }[] }> {
  const resp = await requestFn<{ deleted?: number[]; failed?: { id: number; reason: string }[] }>(
    '/unified-rules/bulk',
    { method: 'POST', body: { action: 'delete', page: USER_LIST_PAGE, ids } },
  );
  return { deleted: resp.deleted ?? ids, failed: resp.failed ?? [] };
}
