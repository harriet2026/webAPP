import { apiRequest, type ApiRequestFn } from './client'
import type { MailMarkingDirection, MailMarkingMetadata, MailMarkingRule } from '@/components/security/mail-marking/types'
import type { RuleNode } from '@/types/unified-rules'
import { GROUP_TAG_PREFIX } from '@/types/groups'

const PAGE = 'mail_marking'

export interface MailMarkingScope {
  key: string
  name: string
  memberCount: number | null
  kind: 'department' | 'group'
}

interface RawGroupRule {
  name?: string
  tags?: string[]
  member_count?: number | null
  metadata?: string | {
    group_type?: string
    member_count?: number | null
    mail_marking_scope?: string
  }
}

interface RawMailMarkingRule {
  id: number
  name: string
  description?: string
  priority: number
  is_active: boolean
  metadata: string | MailMarkingMetadata
  condition_tree: string | RuleNode
  updated_at?: string
  created_at?: string
}

export async function listMailMarkingScopes(
  direction: MailMarkingDirection,
  requestFn: ApiRequestFn = apiRequest,
): Promise<MailMarkingScope[]> {
  const data = await requestFn<{ items: RawGroupRule[] }>(
    '/unified-rules?rule_class=tag&rule_page=groups&include=member_count',
  )
  const scopes: MailMarkingScope[] = []
  const wantedType = direction === 'receive' ? 'recipient' : 'sender'
  for (const raw of data.items ?? []) {
    const meta = typeof raw.metadata === 'string' ? JSON.parse(raw.metadata) : raw.metadata
    if (meta?.group_type !== wantedType) continue
    const key = raw.tags?.find((t: string) => t.startsWith(GROUP_TAG_PREFIX))?.slice(GROUP_TAG_PREFIX.length)
    if (!key) continue
    scopes.push({
      key,
      name: raw.name || key,
      memberCount: raw.member_count ?? meta?.member_count ?? null,
      kind: meta?.mail_marking_scope === 'department' ? 'department' : 'group',
    })
  }
  return scopes
}

function metaToCondition(direction: MailMarkingDirection, scopes: string[]): RuleNode {
  const dirNode: RuleNode = {
    type: 'condition',
    field: 'is_outbound',
    operator: 'eq',
    value: direction === 'send' ? 'true' : 'false',
  }
  if (scopes.length === 0) return dirNode
  const groupField = direction === 'receive' ? 'recipient_group' : 'sender_group'
  const groupNodes: RuleNode[] = scopes.map((g) => ({
    type: 'condition',
    field: groupField,
    map_key: `${GROUP_TAG_PREFIX}${g}`,
    operator: 'eq',
    value: 'true',
  }))
  const groupOr: RuleNode = groupNodes.length === 1 ? groupNodes[0] : { type: 'OR', children: groupNodes }
  return { type: 'AND', children: [dirNode, groupOr] }
}

function conditionToGroups(tree: RuleNode): { direction: MailMarkingDirection; groups: string[] } | null {
  const leafDir = (n: RuleNode): MailMarkingDirection | null => {
    if (n?.type === 'condition' && n.field === 'is_outbound' && n.operator === 'eq') {
      if (n.value === 'true') return 'send'
      if (n.value === 'false') return 'receive'
    }
    return null
  }
  const leafGroup = (n: RuleNode, direction: MailMarkingDirection): string | null => {
    const expectedField = direction === 'receive' ? 'recipient_group' : 'sender_group'
    if (n?.type === 'condition' && n.field === expectedField && n.operator === 'eq' && n.value === 'true' && n.map_key?.startsWith(GROUP_TAG_PREFIX)) {
      return n.map_key.slice(GROUP_TAG_PREFIX.length)
    }
    return null
  }
  if (tree.type === 'condition') {
    const d = leafDir(tree)
    if (d) return { direction: d, groups: [] }
  }
  if (tree.type === 'AND' && tree.children?.length === 2) {
    const d = leafDir(tree.children[0])
    if (d) {
      const second = tree.children[1]
      if (second.type === 'condition') {
        const g = leafGroup(second, d)
        if (g) return { direction: d, groups: [g] }
      }
      if (second.type === 'OR') {
        const gs = second.children?.map((n) => leafGroup(n, d)).filter((x): x is string => !!x) ?? []
        if (gs.length === 0 || gs.length !== (second.children?.length ?? 0)) return null
        return { direction: d, groups: gs }
      }
    }
  }
  return null
}

function parseRule(raw: RawMailMarkingRule): MailMarkingRule | null {
  try {
    const metadata: MailMarkingMetadata = typeof raw.metadata === 'string' ? JSON.parse(raw.metadata) : raw.metadata
    if (metadata?.feature !== 'mail_marking') return null
    const tree: RuleNode = typeof raw.condition_tree === 'string' ? JSON.parse(raw.condition_tree) : raw.condition_tree
    const scope = conditionToGroups(tree)
    if (!scope || metadata.direction !== scope.direction) return null
    const { direction, groups: conditionGroups } = scope
    const departments = Array.isArray(metadata.departments) ? metadata.departments : []
    const groups = Array.isArray(metadata.groups)
      ? metadata.groups
      : conditionGroups.filter((key) => !departments.includes(key))
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      priority: raw.priority,
      is_active: !!raw.is_active,
      metadata,
      direction,
      departments,
      groups,
      updated_at: raw.updated_at,
      created_at: raw.created_at,
    }
  } catch {
    return null
  }
}

export async function listMailMarkingRules(
  direction: MailMarkingDirection,
  requestFn: ApiRequestFn = apiRequest,
): Promise<MailMarkingRule[]> {
  const data = await requestFn<{ items: RawMailMarkingRule[] }>(
    `/unified-rules?rule_class=action&stage=data&rule_page=${PAGE}&page_size=500`,
  )
  return data.items
    .map(parseRule)
    .filter((r): r is MailMarkingRule => !!r && r.direction === direction)
    .sort((a, b) => b.priority - a.priority || b.id - a.id)
}

export interface SaveMailMarkingPayload {
  id?: number
  name: string
  description?: string
  priority: number
  is_active: boolean
  metadata: MailMarkingMetadata
  departments: string[]
  groups: string[]
}

export async function saveMailMarkingRule(
  p: SaveMailMarkingPayload,
  requestFn: ApiRequestFn = apiRequest,
): Promise<MailMarkingRule> {
  const direction = p.metadata.direction
  const departments = [...new Set(p.departments)]
  const groups = [...new Set(p.groups)]
  const metadata = { ...p.metadata, departments, groups }
  const condition_tree = metaToCondition(direction, [...departments, ...groups])
  const body = {
    name: p.name,
    description: p.description ?? '',
    rule_class: 'action',
    stage: 'data',
    priority: p.priority,
    action: 'proceed',
    condition_tree,
    metadata,
    page: PAGE,
    is_active: p.is_active,
    tags: [],
  }
  const raw = p.id
    ? await requestFn<RawMailMarkingRule | { rule: RawMailMarkingRule }>(`/unified-rules/${p.id}?scope=${PAGE}`, { method: 'PUT', body })
    : await requestFn<RawMailMarkingRule | { rule: RawMailMarkingRule }>(`/unified-rules?scope=${PAGE}`, { method: 'POST', body })
  const parsed = parseRule('rule' in raw ? raw.rule : raw)
  if (!parsed) throw new Error('Unexpected response shape')
  return parsed
}

export async function deleteMailMarkingRule(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>(`/unified-rules/${id}?scope=${PAGE}`, { method: 'DELETE' })
}

export async function testMailMarkingRule(
  rule: SaveMailMarkingPayload,
  testEmail: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ matched: boolean; ruleName?: string }> {
  const direction = rule.metadata.direction
  const scopes = [...rule.departments, ...rule.groups]
  const condition_tree = metaToCondition(direction, scopes)
  const mapField = direction === 'receive' ? 'recipient_group' : 'sender_group'
  const test_attributes = {
    sender: direction === 'send' ? testEmail : 'someone@external.example',
    recipients: direction === 'send' ? 'someone@external.example' : testEmail,
    is_outbound: direction === 'send' ? 'true' : 'false',
    [mapField]: Object.fromEntries(scopes.map((g) => [`${GROUP_TAG_PREFIX}${g}`, true])),
  }
  const r = await requestFn<{ matched: boolean }>(`/unified-rules/test?scope=${PAGE}`, {
    method: 'POST',
    body: { condition_tree, test_attributes },
  })
  return { matched: !!r.matched, ruleName: r.matched ? rule.name : undefined }
}
