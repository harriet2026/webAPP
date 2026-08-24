import type { Rule, RuleNode } from '@/types/unified-rules';
import type {
  ContentRuleAction,
  ContentRuleFormData,
  ContentRulesMetadata,
  ContentRuleScope,
  ContentRuleDirections,
  ContentRuleUiAction,
  MarkConfig,
} from '@/types/content-rules';
import type { ApiRequestFn } from './client';
import { apiRequest } from './client';
import { parseRuleJson } from './rule-json';

export const CONTENT_RULES_PAGE = 'content_rules';

export function buildConditionTree(
  data: Pick<ContentRuleFormData, 'match_type' | 'match_content' | 'scopes' | 'directions'>,
): RuleNode {
  const directionNode = buildDirectionNode(data.directions);
  const contentNode = buildContentMatchNode(data);
  return { type: 'AND', children: [directionNode, contentNode] };
}

function buildDirectionNode(dirs: ContentRuleDirections): RuleNode {
  const children: RuleNode[] = [];

  if (dirs.receive?.enabled) {
    children.push({ type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' });
  }

  if (dirs.send?.enabled) {
    const isInternalEnabled = dirs.internal?.enabled ?? false;
    if (isInternalEnabled) {
      children.push({
        type: 'AND',
        children: [
          { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'true' },
          { type: 'condition', field: 'is_internal', operator: 'eq', value: 'false' },
        ],
      });
    } else {
      children.push({ type: 'condition', field: 'is_outbound', operator: 'eq', value: 'true' });
    }
  }

  if (dirs.internal?.enabled) {
    children.push({
      type: 'AND',
      children: [
        { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'true' },
        { type: 'condition', field: 'is_internal', operator: 'eq', value: 'true' },
      ],
    });
  }

  if (children.length === 1) return children[0];
  return { type: 'OR', children };
}

function buildContentMatchNode(data: Pick<ContentRuleFormData, 'match_type' | 'match_content' | 'scopes'>): RuleNode {
  if (data.match_type === 'content_group') {
    return { type: 'condition', field: 'rcpttags', operator: 'hasTag', value: `grp:${data.match_content}` };
  }

  const scopeChildren: RuleNode[] = [];

  for (const scope of data.scopes) {
    switch (data.match_type) {
      case 'keyword': {
        const keywords = data.match_content.split('|');
        if (keywords.length === 1) {
          scopeChildren.push({ type: 'condition', field: scope, operator: 'contain', value: keywords[0].trim() });
        } else {
          const kwChildren: RuleNode[] = [];
          for (const kw of keywords) {
            const trimmed = kw.trim();
            if (trimmed) {
              kwChildren.push({ type: 'condition', field: scope, operator: 'contain', value: trimmed });
            }
          }
          if (kwChildren.length === 1) {
            scopeChildren.push(kwChildren[0]);
          } else if (kwChildren.length > 1) {
            scopeChildren.push({ type: 'OR', children: kwChildren });
          }
        }
        break;
      }
      case 'regex':
        scopeChildren.push({ type: 'condition', field: scope, operator: 'match', value: data.match_content });
        break;
    }
  }

  if (scopeChildren.length === 1) return scopeChildren[0];
  return { type: 'OR', children: scopeChildren };
}

const scopeFields: Record<string, string> = {
  subject: 'subject',
  header: 'header',
  text_body: 'text_body',
  html_body: 'html_body',
  attachment_names: 'attachment_names',
  attachment_types: 'attachment_types',
  urls: 'urls',
};

export function toContentRuleUiAction(action: ContentRuleAction, _markConfig?: MarkConfig): ContentRuleUiAction {
  return action;
}

export function fromContentRuleUiAction(action: ContentRuleUiAction): ContentRuleAction {
  return action;
}

export function parseContentRulesRule(tree: RuleNode | null): {
  directions: ContentRuleDirections;
  scopes: ContentRuleScope[];
} | null {
  if (!tree) return null;
  if (tree.type !== 'AND' || tree.children?.length !== 2) return null;

  const directions = parseDirectionsFromNode(tree.children[0]);
  const scopes = parseScopesFromContentNode(tree.children[1]);

  if (scopes.length === 0) return null;

  const hasDir =
    (directions.receive?.enabled ?? false) ||
    (directions.send?.enabled ?? false) ||
    (directions.internal?.enabled ?? false);
  if (!hasDir) return null;

  return { directions, scopes };
}

function parseDirectionsFromNode(n: RuleNode): ContentRuleDirections {
  const dirs: ContentRuleDirections = {};

  if (n.type === 'condition' && n.field === 'is_outbound' && n.operator === 'eq') {
    if (n.value === 'false') {
      dirs.receive = { enabled: true, action: 'reject' };
    } else if (n.value === 'true') {
      dirs.send = { enabled: true, action: 'reject' };
    }
    return dirs;
  }

  if (n.type === 'OR') {
    for (const child of n.children ?? []) {
      const d = parseDirectionsFromNode(child);
      if (d.receive?.enabled) dirs.receive = d.receive;
      if (d.send?.enabled) dirs.send = d.send;
      if (d.internal?.enabled) dirs.internal = d.internal;
    }
    return dirs;
  }

  if (n.type === 'AND' && n.children?.length === 2) {
    let outbound = false;
    let internal = false;
    for (const child of n.children) {
      if (child.type === 'condition' && child.field === 'is_outbound' && child.operator === 'eq' && child.value === 'true') {
        outbound = true;
      }
      if (child.type === 'condition' && child.field === 'is_internal' && child.operator === 'eq') {
        if (child.value === 'true') {
          internal = true;
        } else if (child.value === 'false') {
          dirs.send = { enabled: true, action: 'reject' };
          return dirs;
        }
      }
    }
    if (outbound && internal) {
      dirs.internal = { enabled: true, action: 'reject' };
    }
    return dirs;
  }

  return dirs;
}

function parseScopesFromContentNode(n: RuleNode | null): ContentRuleScope[] {
  if (!n) return [];
  if (n.type === 'condition') {
    for (const [scope, field] of Object.entries(scopeFields)) {
      if (n.field === field) return [scope as ContentRuleScope];
    }
    if (n.field === 'rcpttags' && n.operator === 'hasTag') return [];
    return [];
  }
  if (n.type === 'OR') {
    const scopes: ContentRuleScope[] = [];
    for (const child of n.children ?? []) {
      scopes.push(...parseScopesFromContentNode(child));
    }
    return scopes;
  }
  return [];
}

export function resolveContentRulesRule(rule: Rule): ContentRulesMetadata | null {
  let metadata: ContentRulesMetadata | null = null;
  if (rule.metadata) {
    // 后端以 json.RawMessage 内联下发，运行时可能是对象而非字符串，必须走容错解析
    const parsed = parseRuleJson(rule.metadata);
    if (parsed?.feature === 'content_rules') metadata = parsed as unknown as ContentRulesMetadata;
  }

  const tree = parseRuleJson(rule.condition_tree) as RuleNode | null;
  const treeShape = parseContentRulesRule(tree);

  if (metadata && treeShape) {
    return metadata;
  }
  if (metadata) {
    return metadata;
  }
  return null;
}

export interface ListContentRulesParams {
  q?: string;
  status?: string;
  match_type?: string;
  direction?: string;
  scope?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

export async function listContentRules(
  params: ListContentRulesParams = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ items: Rule[]; total: number; page: number; page_size: number }> {
  const qs = new URLSearchParams();
  qs.set('rule_page', 'content_rules');
  if (params.q) qs.set('q', params.q);
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.match_type) qs.set('match_type', params.match_type);
  if (params.direction) qs.set('direction', params.direction);
  if (params.scope) qs.set('scope', params.scope);
  if (params.sort) qs.set('sort', params.sort);
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  const query = qs.toString();
  return requestFn(`/unified-rules?${query}`);
}

export async function testContentRule(
  conditionTree: RuleNode,
  testAttributes: Record<string, string>,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ matched: boolean; evaluated_conditions: unknown[] }> {
  return requestFn('/unified-rules/test?scope=content_rules', {
    method: 'POST',
    body: { condition_tree: conditionTree, test_attributes: testAttributes },
  });
}
