import type { Rule, RuleNode } from '@/types/unified-rules';
import type { Group, GroupType } from '@/types/groups';
import { GROUP_TAG_PREFIX, GROUP_TYPE_TO_STAGE, GROUPS_PAGE_KEY } from '@/types/groups';
import { API_BASE } from '@/lib/api/client';

export interface ImportMembersResult {
  imported: number;
  failed: { line: number; value: string; reason: string }[];
}

export interface ImportMembersOptions {
  tenantId?: number | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function importMembers(
  ruleId: number,
  file: File,
  opts: ImportMembersOptions = {},
): Promise<ImportMembersResult> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.tenantId !== undefined && opts.tenantId !== null) {
    headers['X-Tenant-ID'] = String(opts.tenantId);
  }
  const res = await fetch(`${API_BASE}/unified-rules/${ruleId}/members/import`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
    signal: opts.signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const message = typeof err.error === 'string' ? err.error : err.error?.message || 'Request failed';
    throw new Error(message);
  }
  return res.json();
}

export async function exportMembers(
  ruleId: number,
  opts: { tenantId?: number | null; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<Blob> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.tenantId !== undefined && opts.tenantId !== null) {
    headers['X-Tenant-ID'] = String(opts.tenantId);
  }
  const res = await fetch(`${API_BASE}/unified-rules/${ruleId}/members/export`, {
    method: 'GET',
    credentials: 'include',
    headers,
    signal: opts.signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const message = typeof err.error === 'string' ? err.error : err.error?.message || 'Request failed';
    throw new Error(message);
  }
  return res.blob();
}

function isCidr(line: string): boolean {
  return line.includes('/');
}

function isEmailLike(line: string): boolean {
  const at = line.indexOf('@');
  return at > 0 && at < line.length - 1;
}

function normalizeDomain(line: string): string {
  if (line.startsWith('@')) return line.slice(1);
  return line;
}

export function serializeMembers(type: GroupType, members: string[]): RuleNode {
  const rows = members.map(m => m.trim()).filter(Boolean);
  if (rows.length === 0) {
    throw new Error('group must have at least one member');
  }

  switch (type) {
    case 'ip': {
      const hasCidr = rows.some(isCidr);
      if (!hasCidr) {
        return { type: 'condition', field: 'client_ip', operator: 'within', value: rows.join('\n') };
      }
      return {
        type: 'OR',
        children: rows.map(r => ({ type: 'condition' as const, field: 'client_ip', operator: 'cidr', value: r })),
      };
    }
    case 'sender':
      return serializeAddrGroup(rows, 'sender', 'senderdomain');
    case 'recipient':
      return serializeAddrGroup(rows, 'recipient', 'recipient_domain');
    case 'content': {
      return {
        type: 'OR',
        children: rows.map(kw => ({
          type: 'OR' as const,
          children: [
            { type: 'condition' as const, field: 'subject', operator: 'contain', value: kw },
            { type: 'condition' as const, field: 'text_body', operator: 'contain', value: kw },
            { type: 'condition' as const, field: 'html_body', operator: 'contain', value: kw },
          ],
        })),
      };
    }
    case 'feature':
      throw new Error('feature groups do not support member serialization');
  }
}

function serializeAddrGroup(rows: string[], addrField: string, domainField: string): RuleNode {
  const emails: string[] = [];
  const domains: string[] = [];
  for (const r of rows) {
    if (isEmailLike(r)) emails.push(r);
    else domains.push(normalizeDomain(r));
  }
  const children: RuleNode[] = [];
  if (emails.length > 0) {
    children.push({ type: 'condition', field: addrField, operator: 'within', value: emails.join('\n') });
  }
  for (const d of domains) {
    children.push({ type: 'condition', field: domainField, operator: 'suffix', value: d });
  }
  if (children.length === 1) return children[0];
  return { type: 'OR', children };
}

export function parseMembers(tree: RuleNode | null, type: GroupType): string[] | null {
  if (!tree) return null;
  switch (type) {
    case 'ip':       return parseIPGroup(tree);
    case 'sender':   return parseAddrGroup(tree, 'sender', 'senderdomain');
    case 'recipient': return parseAddrGroup(tree, 'recipient', 'recipient_domain');
    case 'content':  return parseContentGroup(tree);
    case 'feature':  return null;
  }
}

function parseIPGroup(tree: RuleNode): string[] | null {
  if (tree.type === 'condition' && tree.field === 'client_ip' && tree.operator === 'within') {
    const members = splitLines(tree.value || '');
    return members.length > 0 ? members : null;
  }
  if (tree.type === 'OR') {
    const out: string[] = [];
    for (const c of tree.children || []) {
      if (c.type !== 'condition' || c.field !== 'client_ip' || c.operator !== 'cidr') return null;
      out.push(c.value || '');
    }
    return out.length > 0 ? out : null;
  }
  return null;
}

function parseAddrGroup(tree: RuleNode, addrField: string, domainField: string): string[] | null {
  if (tree.type === 'condition') {
    if (tree.field === addrField && tree.operator === 'within') {
      const members = splitLines(tree.value || '');
      return members.length > 0 ? members : null;
    }
    if (tree.field === domainField && tree.operator === 'suffix') {
      const value = (tree.value || '').trim();
      return value ? [value] : null;
    }
    return null;
  }
  if (tree.type !== 'OR') return null;
  const out: string[] = [];
  for (const c of tree.children || []) {
    if (c.type !== 'condition') return null;
    if (c.field === addrField && c.operator === 'within') {
      out.push(...splitLines(c.value || ''));
    } else if (c.field === domainField && c.operator === 'suffix') {
      out.push(c.value || '');
    } else {
      return null;
    }
  }
  return out.length > 0 ? out : null;
}

function parseContentGroup(tree: RuleNode): string[] | null {
  if (tree.type !== 'OR' || !tree.children?.length) return null;
  const out: string[] = [];
  for (const kwNode of tree.children) {
    if (kwNode.type !== 'OR' || !kwNode.children || kwNode.children.length !== 3) return null;
    const fields: Record<string, string> = {};
    for (const leaf of kwNode.children) {
      if (leaf.type !== 'condition' || leaf.operator !== 'contain') return null;
      if (leaf.field) fields[leaf.field] = leaf.value || '';
    }
    if (fields.subject == null || fields.text_body == null || fields.html_body == null) return null;
    if (fields.subject !== fields.text_body || fields.text_body !== fields.html_body) return null;
    out.push(fields.subject);
  }
  return out;
}

function splitLines(s: string): string[] {
  return s.split('\n').map(x => x.trim()).filter(Boolean);
}

export function ruleToGroup(rule: Rule): Group | null {
  const tag = (rule.tags || []).find(t => t.startsWith(GROUP_TAG_PREFIX));
  if (!tag) return null;
  const name = tag.slice(GROUP_TAG_PREFIX.length);
  const type = metadataGroupType(rule) ?? stageToGroupType(rule.stage);
  if (!type) return null;
  let tree: RuleNode | null = null;
  try {
    tree = typeof rule.condition_tree === 'string' ? JSON.parse(rule.condition_tree) : rule.condition_tree;
  } catch { tree = null; }
  const members = tree ? parseMembers(tree, type) : null;
  const memberCountFromBackend = (rule as Rule & { member_count?: number | null }).member_count;
  const referenceCountFromBackend = (rule as Rule & { reference_count?: number | null }).reference_count;
  return {
    ruleId: rule.id,
    name,
    type,
    members: members ?? [],
    memberCount: memberCountFromBackend ?? (members ? members.length : null),
    referenceCount: referenceCountFromBackend ?? 0,
    isActive: rule.is_active,
    createdAt: rule.created_at,
    updatedAt: rule.updated_at,
  };
}

function stageToGroupType(stage: string): GroupType | null {
  switch (stage) {
    case 'onconnect': return 'ip';
    case 'mail':      return 'sender';
    case 'rcpt':      return 'recipient';
    case 'data':      return 'content';
  }
  return null;
}

function metadataGroupType(rule: Rule): GroupType | null {
  if (!rule.metadata) return null;
  try {
    const metadata = typeof rule.metadata === 'string' ? JSON.parse(rule.metadata) : rule.metadata;
    const groupType = metadata?.group_type;
    if (groupType === 'ip' || groupType === 'sender' || groupType === 'recipient' || groupType === 'content' || groupType === 'feature') {
      return groupType;
    }
  } catch {
    return null;
  }
  return null;
}

export interface GroupFormValues {
  name: string;
  type: GroupType;
  members: string[];
  conditionTree?: RuleNode;
}

export function buildRulePayload(values: GroupFormValues, isCreate: boolean) {
  const stage = GROUP_TYPE_TO_STAGE[values.type];
  const tree = values.type === 'feature' ? (values.conditionTree ?? { type: 'OR', children: [] }) : serializeMembers(values.type, values.members);
  const tag = GROUP_TAG_PREFIX + values.name;
  const base = {
    name: values.name,
    description: '',
    stage,
    condition_tree: tree,
    tags: [tag],
    priority: 100,
    is_active: true,
    page: 'groups',
    metadata: { group_type: values.type },
  };
  if (isCreate) {
    return { ...base, rule_class: 'tag' as const };
  }
  return base;
}

export const GROUPS_LIST_QUERY = {
  rule_class: 'tag',
  page: GROUPS_PAGE_KEY,
  include: 'member_count,reference_count',
};
