import type { CreateRuleRequest, FieldDef, Rule, RuleNode, UpdateRuleRequest } from '@/types/unified-rules';
import { deserializeGroups, serializeGroups, type ConditionGroups } from './serde';
import { deriveStage } from './stage-derive';
import type { PrimaryAction } from './conflict-matrix';
import type { AddonsState } from './validation';
import { serializeAddons, parseAddons } from './AddonsPanel';

// rule-form.ts — the SOLE translation layer between the advanced-filter-rules
// editor state (RuleForm) and the backend AdvancedRulesMetadata protocol
// (internal/api/advanced_rules_helper.go). The JSON keys emitted/consumed
// here (feature, scope, primary_action, primary_action_params, review_params,
// addons[].type/params, and every snake_case param key below) were
// cross-checked against:
//   - internal/api/advanced_rules_helper.go (AdvancedRulesMetadata,
//     AdvancedRulesActionParams, AdvancedRulesReviewParams, AdvancedRulesAddon
//     struct json tags + ValidateAdvancedRulesMetadata / MapPrimaryActionToUnifiedAction)
//   - the pre-rewrite rule editor (parseRuleToForm/handleConfirm)
//   - the pre-rewrite addons editor (serializeAddons/parseAddons)
// Do not invent new key names — any addition here must have a matching
// backend field or an explicit product decision recorded in the task report.

// isInternalIP — SSRF-adjacent client-side guard for addon params that take
// a free-form server address (currently: forwardServer's target/server
// address, checked by rules/tag/page.tsx before submit). Copied verbatim
// from the pre-rewrite addons editor (same file that owned forwardServer's
// UI); this is a simple heuristic pre-check only — the authoritative guard is
// the backend's isInternalAddress/netguard.IsInternalHost (which resolves
// hostnames), see internal/api/advanced_rules_helper.go.
export function isInternalIP(addr: string): boolean {
  const a = addr.trim().toLowerCase();
  if (a === 'localhost' || a === '127.0.0.1' || a === '::1') return true;
  if (a.startsWith('10.') || a.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(a)) return true;
  if (a.startsWith('fc') || a.startsWith('fd') || a === '0.0.0.0') return true;
  return false;
}

export type Scope = 'incoming' | 'outgoing' | 'internal';

export interface ReviewActionParams {
  reviewers: string;
  timeoutHours: number;
}

export interface DeliverActionParams {
  skipSubsequentRules: boolean;
}

export interface DiscardActionParams {
  logEnabled: boolean;
  silent: boolean;
  notifyAdmin: boolean;
}

export interface RuleForm {
  name: string;
  priority: number;
  enabled: boolean;
  scope: Scope[];
  validUntil: string | null; // date-only "YYYY-MM-DD", or null
  description: string;
  conditions: ConditionGroups;
  primaryAction: PrimaryAction;
  actionParams: {
    deliver?: DeliverActionParams;
    review?: ReviewActionParams;
    discard?: DiscardActionParams;
  };
  addons: AddonsState;
}

const ALL_SCOPES: Scope[] = ['incoming', 'outgoing', 'internal'];

const PRIMARY_ACTIONS: PrimaryAction[] = [
  'accept',
  'proceed',
  'quarantine',
  'audit',
  'discard',
];

function isPrimaryAction(v: unknown): v is PrimaryAction {
  return typeof v === 'string' && (PRIMARY_ACTIONS as string[]).includes(v);
}

function isScope(v: unknown): v is Scope {
  return v === 'incoming' || v === 'outgoing' || v === 'internal';
}

// Backend: MapPrimaryActionToUnifiedAction (advanced_rules_helper.go).
// Public policy actions are persisted natively; proceed remains non-terminal
// in the unified engine and can still carry optional addons.
const ACTION_TO_RULE_ACTION: Record<PrimaryAction, string> = {
  accept: 'accept',
  proceed: 'proceed',
  quarantine: 'quarantine',
  audit: 'audit',
  discard: 'discard',
};

// GT-12181: defaultPriority is role-aware (see priority-range.ts). Callers
// inside the editor pass the logged-in role's default (tenant admin 600,
// system admin 600); the 50 fallback is kept only for isolated callers that
// invoke emptyRuleForm() with no argument.
export function emptyRuleForm(defaultPriority = 50): RuleForm {
  return {
    name: '',
    priority: defaultPriority,
    enabled: true,
    scope: [...ALL_SCOPES],
    validUntil: null,
    description: '',
    conditions: { any: [], all: [] },
    primaryAction: 'proceed',
    actionParams: {
      deliver: { skipSubsequentRules: false },
      review: { reviewers: '', timeoutHours: 24 },
      discard: { logEnabled: true, silent: true, notifyAdmin: false },
    },
    addons: {},
  };
}

// ─── form → request ───────────────────────────────────────────────────────

function buildPrimaryActionParams(f: RuleForm): Record<string, unknown> {
  switch (f.primaryAction) {
    case 'accept': {
      const d = f.actionParams.deliver ?? emptyRuleForm().actionParams.deliver!;
      return { skip_subsequent: d.skipSubsequentRules };
    }
    case 'discard': {
      const dd = f.actionParams.discard ?? emptyRuleForm().actionParams.discard!;
      return { log_enabled: dd.logEnabled, silent_discard: dd.silent, notify_admin: dd.notifyAdmin };
    }
    default:
      return {};
  }
}

// Builds the AdvancedRulesMetadata JSON object (feature/scope/primary_action/
// primary_action_params/review_params/addons) shared by create and update.
function buildMetadata(f: RuleForm): Record<string, unknown> {
  const addonsList: Array<{ type: string; params: Record<string, unknown> }> = serializeAddons(f.addons);

  const metadata: Record<string, unknown> = {
    feature: 'advanced_rules',
    scope: f.scope,
    primary_action: f.primaryAction,
    primary_action_params: buildPrimaryActionParams(f),
    addons: addonsList,
  };

  if (f.primaryAction === 'audit') {
    const rp = f.actionParams.review ?? emptyRuleForm().actionParams.review!;
    metadata.review_params = {
      reviewers: rp.reviewers.split(',').map((s) => s.trim()).filter(Boolean),
      review_timeout_hours: rp.timeoutHours,
    };
  }

  return metadata;
}

function ruleAction(primaryAction: PrimaryAction): string {
  return ACTION_TO_RULE_ACTION[primaryAction];
}

function toValidUntilISO(v: string | null): string | null {
  return v ? `${v}T23:59:59Z` : null;
}

export function formToCreateRequest(f: RuleForm, fieldDefs: Record<string, FieldDef>): CreateRuleRequest {
  const leaves = [...f.conditions.any, ...f.conditions.all];
  const stage = deriveStage(leaves, fieldDefs, f.primaryAction) as CreateRuleRequest['stage'];
  const conditionTree = serializeGroups(f.conditions);

  return {
    name: f.name,
    description: f.description || undefined,
    page: 'advanced_rules',
    rule_class: 'action',
    stage,
    priority: f.priority,
    condition_tree: conditionTree as RuleNode,
    action: ruleAction(f.primaryAction),
    metadata: buildMetadata(f),
    is_active: f.enabled,
    valid_until: toValidUntilISO(f.validUntil),
  };
}

export function formToUpdateRequest(f: RuleForm, fieldDefs: Record<string, FieldDef>): UpdateRuleRequest {
  const leaves = [...f.conditions.any, ...f.conditions.all];
  const stage = deriveStage(leaves, fieldDefs, f.primaryAction) as UpdateRuleRequest['stage'];
  const conditionTree = serializeGroups(f.conditions);

  return {
    name: f.name,
    description: f.description || undefined,
    page: 'advanced_rules',
    stage,
    priority: f.priority,
    condition_tree: conditionTree as RuleNode,
    action: ruleAction(f.primaryAction),
    metadata: buildMetadata(f),
    is_active: f.enabled,
    valid_until: toValidUntilISO(f.validUntil),
  };
}

// ─── request/rule → form (edit回填) ────────────────────────────────────────

function parseMetadata(metadata: Rule['metadata']): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    return typeof metadata === 'string' ? JSON.parse(metadata) : (metadata as Record<string, unknown>);
  } catch {
    return null;
  }
}

function parseConditionTree(tree: Rule['condition_tree']): RuleNode | null {
  if (!tree) return null;
  try {
    return typeof tree === 'string' ? JSON.parse(tree) : (tree as unknown as RuleNode);
  } catch {
    return null;
  }
}

export function ruleToForm(rule: Rule): RuleForm {
  const form = emptyRuleForm();
  form.name = rule.name;
  form.priority = rule.priority;
  form.enabled = rule.is_active;
  form.description = rule.description || '';
  form.validUntil = rule.valid_until ? rule.valid_until.slice(0, 10) : null;

  const meta = parseMetadata(rule.metadata);

  if (meta && Array.isArray(meta.scope) && meta.scope.length > 0) {
    const scopes = (meta.scope as unknown[]).filter(isScope);
    if (scopes.length > 0) form.scope = scopes;
  }

  const primaryAction: PrimaryAction = meta && isPrimaryAction(meta.primary_action) ? meta.primary_action : 'proceed';
  form.primaryAction = primaryAction;

  const pap = (meta?.primary_action_params ?? {}) as Record<string, unknown>;
  if (primaryAction === 'accept') {
    form.actionParams.deliver = { skipSubsequentRules: !!pap.skip_subsequent };
  } else if (primaryAction === 'discard') {
    const defaults = emptyRuleForm().actionParams.discard!;
    form.actionParams.discard = {
      logEnabled: pap.log_enabled === undefined ? defaults.logEnabled : !!pap.log_enabled,
      silent: pap.silent_discard === undefined ? defaults.silent : !!pap.silent_discard,
      notifyAdmin: !!pap.notify_admin,
    };
  }

  if (primaryAction === 'audit') {
    const rp = (meta?.review_params ?? {}) as Record<string, unknown>;
    const defaults = emptyRuleForm().actionParams.review!;
    form.actionParams.review = {
      reviewers: Array.isArray(rp.reviewers) ? (rp.reviewers as string[]).join(', ') : (typeof rp.reviewers === 'string' ? rp.reviewers : defaults.reviewers),
      timeoutHours: typeof rp.review_timeout_hours === 'number' ? rp.review_timeout_hours : defaults.timeoutHours,
    };
  }

  form.addons = parseAddons(meta ?? {});

  const tree = parseConditionTree(rule.condition_tree);
  form.conditions = deserializeGroups(tree);

  return form;
}
