import { describe, it, expect } from 'vitest';
import {
  emptyRuleForm,
  ruleToForm,
  formToCreateRequest,
  formToUpdateRequest,
  type RuleForm,
} from './rule-form';
import type { Rule, FieldDef } from '@/types/unified-rules';

const fieldDefs: Record<string, FieldDef> = {
  subject: { label: 'Subject', type: 'string', min_stage: 'data', operators: ['contain'], supported: true },
  ip: { label: 'IP', type: 'string', min_stage: 'mail', operators: ['equals'], supported: true },
};

function baseRule(over: Partial<Rule> = {}): Rule {
  return {
    id: 1,
    name: 'r',
    rule_class: 'action',
    stage: 'data',
    priority: 50,
    condition_tree: JSON.stringify({ type: 'condition', field: 'subject', operator: 'contain', value: 'x', note: 'subject' }),
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function leafConditions(): RuleForm['conditions'] {
  return {
    any: [],
    all: [
      {
        id: 'a',
        conditionKey: 'subject',
        field: 'subject',
        operator: 'contain',
        value: 'x',
        exclude: false,
      },
    ],
  };
}

describe('emptyRuleForm', () => {
  const f = emptyRuleForm();

  it('basic fields', () => {
    expect(f.name).toBe('');
    expect(f.priority).toBe(50);
    expect(f.enabled).toBe(true);
    expect(f.scope).toEqual(['incoming', 'outgoing', 'internal']);
    expect(f.validUntil).toBeNull();
    expect(f.description).toBe('');
  });

  it('conditions empty', () => {
    expect(f.conditions).toEqual({ any: [], all: [] });
  });

  it('primaryAction defaults to none', () => {
    expect(f.primaryAction).toBe('none');
  });

  it('block defaults', () => {
    expect(f.actionParams.block).toEqual({
      smtpCode: '550',
      responseText: '5.7.1 Message rejected due to content policy',
      tarpit: false,
      tarpitSeconds: 5,
    });
  });

  it('review defaults', () => {
    expect(f.actionParams.review).toEqual({ reviewers: '', timeoutHours: 24 });
  });

  it('deliver defaults', () => {
    expect(f.actionParams.deliver).toEqual({ skipSubsequentRules: false });
  });

  it('discard defaults', () => {
    expect(f.actionParams.discard).toEqual({ logEnabled: true, silent: true, notifyAdmin: false });
  });

  it('tagDeliver defaults', () => {
    expect(f.actionParams.tagDeliver).toEqual({
      content: '',
      position: 'subject_prefix',
      style: 'plain_text',
      headerName: '',
      headerValue: '',
    });
  });

  it('addons all unchecked', () => {
    expect(f.addons).toEqual({});
  });
});

describe('formToCreateRequest — basic mapping', () => {
  it('sets page/rule_class/stage/priority/name/is_active', () => {
    const f = { ...emptyRuleForm(), name: 'my rule', priority: 77, conditions: leafConditions() };
    const req = formToCreateRequest(f, fieldDefs);
    expect(req.page).toBe('advanced_rules');
    expect(req.rule_class).toBe('action');
    expect(req.name).toBe('my rule');
    expect(req.priority).toBe(77);
    expect(req.is_active).toBe(true);
    expect(req.stage).toBe('data');
  });

  it('scope maps into metadata.scope verbatim', () => {
    const f = { ...emptyRuleForm(), conditions: leafConditions(), scope: ['incoming', 'internal'] as RuleForm['scope'] };
    const req = formToCreateRequest(f, fieldDefs);
    expect((req.metadata as Record<string, unknown>).scope).toEqual(['incoming', 'internal']);
  });

  it('metadata.feature is always advanced_rules', () => {
    const f = { ...emptyRuleForm(), conditions: leafConditions() };
    const req = formToCreateRequest(f, fieldDefs);
    expect((req.metadata as Record<string, unknown>).feature).toBe('advanced_rules');
  });

  it('primaryAction none → action undefined, primary_action "none"', () => {
    const f = { ...emptyRuleForm(), conditions: leafConditions() };
    const req = formToCreateRequest(f, fieldDefs);
    expect(req.action).toBeUndefined();
    expect((req.metadata as Record<string, unknown>).primary_action).toBe('none');
  });

  it('primaryAction block → action "reject" + primary_action_params snake_case', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'block',
      actionParams: {
        ...emptyRuleForm().actionParams,
        block: { smtpCode: '554', responseText: 'go away', tarpit: true, tarpitSeconds: 12 },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    expect(req.action).toBe('reject');
    expect((req.metadata as Record<string, unknown>).primary_action_params).toEqual({
      smtp_code: 554,
      response_text: 'go away',
      tarpit_enabled: true,
      tarpit_seconds: 12,
    });
  });

  it('block with tarpit disabled omits tarpit_seconds', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'block',
    };
    const req = formToCreateRequest(f, fieldDefs);
    const params = (req.metadata as Record<string, unknown>).primary_action_params as Record<string, unknown>;
    expect(params.tarpit_enabled).toBe(false);
    expect(params.tarpit_seconds).toBeUndefined();
  });

  it('primaryAction deliver → action "accept" + skip_subsequent', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'deliver',
      actionParams: { ...emptyRuleForm().actionParams, deliver: { skipSubsequentRules: true } },
    };
    const req = formToCreateRequest(f, fieldDefs);
    expect(req.action).toBe('accept');
    expect((req.metadata as Record<string, unknown>).primary_action_params).toEqual({ skip_subsequent: true });
  });

  it('primaryAction discard → action "discard" + log/silent/notify snake_case', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'discard',
      actionParams: {
        ...emptyRuleForm().actionParams,
        discard: { logEnabled: false, silent: false, notifyAdmin: true },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    expect(req.action).toBe('discard');
    expect((req.metadata as Record<string, unknown>).primary_action_params).toEqual({
      log_enabled: false,
      silent_discard: false,
      notify_admin: true,
    });
  });

  it('primaryAction review → action "audit" + metadata.review_params (reviewers split+trimmed)', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'review',
      actionParams: {
        ...emptyRuleForm().actionParams,
        review: { reviewers: ' alice@x.com , bob@x.com ,', timeoutHours: 48 },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    expect(req.action).toBe('audit');
    expect((req.metadata as Record<string, unknown>).review_params).toEqual({
      reviewers: ['alice@x.com', 'bob@x.com'],
      review_timeout_hours: 48,
    });
    // review_params only set for the review action — no leaking into other actions.
    expect((req.metadata as Record<string, unknown>).primary_action_params).toEqual({});
  });

  it('primaryAction quarantine → action "quarantine", empty primary_action_params', () => {
    const f: RuleForm = { ...emptyRuleForm(), conditions: leafConditions(), primaryAction: 'quarantine' };
    const req = formToCreateRequest(f, fieldDefs);
    expect(req.action).toBe('quarantine');
    expect((req.metadata as Record<string, unknown>).primary_action_params).toEqual({});
  });
});

describe('formToCreateRequest — addons', () => {
  it('serializes enabled addons only, passing params through verbatim', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      addons: {
        disclaimer: { enabled: true, params: { content: 'foo', position: 'body_bottom' } },
        adminNotify: { enabled: false, params: { recipients: ['x@x.com'] } },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    expect((req.metadata as Record<string, unknown>).addons).toEqual([
      { type: 'disclaimer', params: { content: 'foo', position: 'body_bottom' } },
    ]);
  });

  it('tagDeliver auto-adds emailTag addon built from actionParams.tagDeliver', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'tagDeliver',
      actionParams: {
        ...emptyRuleForm().actionParams,
        tagDeliver: { content: '[SPAM]', position: 'subject_prefix', style: 'plain_text' },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    expect((req.metadata as Record<string, unknown>).addons).toEqual([
      { type: 'emailTag', params: { tag_content: '[SPAM]', tag_position: 'subject_prefix', tag_style: 'plain_text' } },
    ]);
  });

  it('tagDeliver with header position includes header_name/header_value when provided', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'tagDeliver',
      actionParams: {
        ...emptyRuleForm().actionParams,
        tagDeliver: {
          content: '[SPAM]',
          position: 'header',
          style: 'plain_text',
          headerName: 'X-Spam-Flag',
          headerValue: 'YES',
        },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    expect((req.metadata as Record<string, unknown>).addons).toEqual([
      {
        type: 'emailTag',
        params: {
          tag_content: '[SPAM]',
          tag_position: 'header',
          tag_style: 'plain_text',
          header_name: 'X-Spam-Flag',
          header_value: 'YES',
        },
      },
    ]);
  });

  it('tagDeliver overrides a user-supplied emailTag entry already in addons state', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'tagDeliver',
      actionParams: {
        ...emptyRuleForm().actionParams,
        tagDeliver: { content: 'canonical', position: 'subject_prefix', style: 'plain_text' },
      },
      addons: {
        emailTag: { enabled: true, params: { tag_content: 'stale', tag_position: 'header', tag_style: 'plain_text' } },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const addons = (req.metadata as Record<string, unknown>).addons as unknown[];
    expect(addons).toHaveLength(1);
    expect(addons[0]).toEqual({
      type: 'emailTag',
      params: { tag_content: 'canonical', tag_position: 'subject_prefix', tag_style: 'plain_text' },
    });
  });
});

describe('formToUpdateRequest', () => {
  it('mirrors formToCreateRequest but has no rule_class field', () => {
    const f: RuleForm = { ...emptyRuleForm(), name: 'edited', conditions: leafConditions(), primaryAction: 'block' };
    const req = formToUpdateRequest(f, fieldDefs);
    expect((req as Record<string, unknown>).rule_class).toBeUndefined();
    expect(req.name).toBe('edited');
    expect(req.action).toBe('reject');
    expect((req.metadata as Record<string, unknown>).primary_action).toBe('block');
    expect(req.page).toBe('advanced_rules');
  });
});

describe('ruleToForm', () => {
  it('reads basic fields back from a Rule', () => {
    const rule = baseRule({
      name: 'incoming block',
      priority: 33,
      is_active: false,
      description: 'desc',
      valid_until: '2026-12-31T23:59:59Z',
      metadata: JSON.stringify({
        feature: 'advanced_rules',
        scope: ['incoming'],
        primary_action: 'none',
        primary_action_params: {},
      }),
    });
    const f = ruleToForm(rule);
    expect(f.name).toBe('incoming block');
    expect(f.priority).toBe(33);
    expect(f.enabled).toBe(false);
    expect(f.description).toBe('desc');
    expect(f.validUntil).toBe('2026-12-31');
    expect(f.scope).toEqual(['incoming']);
  });

  it('parses block primary_action_params back into actionParams.block', () => {
    const rule = baseRule({
      metadata: JSON.stringify({
        feature: 'advanced_rules',
        scope: ['incoming', 'outgoing', 'internal'],
        primary_action: 'block',
        primary_action_params: { smtp_code: 554, response_text: 'nope', tarpit_enabled: true, tarpit_seconds: 9 },
      }),
    });
    const f = ruleToForm(rule);
    expect(f.primaryAction).toBe('block');
    expect(f.actionParams.block).toEqual({
      smtpCode: '554',
      responseText: 'nope',
      tarpit: true,
      tarpitSeconds: 9,
    });
  });

  it('parses review_params back into actionParams.review (reviewers array → comma string)', () => {
    const rule = baseRule({
      metadata: JSON.stringify({
        feature: 'advanced_rules',
        scope: ['incoming', 'outgoing', 'internal'],
        primary_action: 'review',
        review_params: { reviewers: ['alice@x.com', 'bob@x.com'], review_timeout_hours: 48 },
      }),
    });
    const f = ruleToForm(rule);
    expect(f.primaryAction).toBe('review');
    expect(f.actionParams.review).toEqual({ reviewers: 'alice@x.com, bob@x.com', timeoutHours: 48 });
  });

  it('parses generic addons into AddonsState', () => {
    const rule = baseRule({
      metadata: JSON.stringify({
        feature: 'advanced_rules',
        scope: ['incoming', 'outgoing', 'internal'],
        primary_action: 'none',
        addons: [
          { type: 'disclaimer', params: { content: 'foo', position: 'body_bottom' } },
          { type: 'detailedLog', params: {} },
        ],
      }),
    });
    const f = ruleToForm(rule);
    expect(f.addons.disclaimer).toEqual({ enabled: true, params: { content: 'foo', position: 'body_bottom' } });
    expect(f.addons.detailedLog).toEqual({ enabled: true, params: {} });
  });

  it('routes an emailTag addon into actionParams.tagDeliver when primary_action is tagDeliver, not into addons', () => {
    const rule = baseRule({
      metadata: JSON.stringify({
        feature: 'advanced_rules',
        scope: ['incoming', 'outgoing', 'internal'],
        primary_action: 'tagDeliver',
        addons: [{ type: 'emailTag', params: { tag_content: '[SPAM]', tag_position: 'subject_prefix', tag_style: 'plain_text' } }],
      }),
    });
    const f = ruleToForm(rule);
    expect(f.actionParams.tagDeliver).toEqual({
      content: '[SPAM]',
      position: 'subject_prefix',
      style: 'plain_text',
    });
    expect(f.addons.emailTag).toBeUndefined();
  });

  it('parses condition_tree via deserializeGroups', () => {
    const rule = baseRule({
      condition_tree: JSON.stringify({
        type: 'OR',
        children: [{ type: 'condition', field: 'subject', operator: 'contain', value: 'invoice', note: 'subject' }],
      }),
      metadata: JSON.stringify({ feature: 'advanced_rules', scope: ['incoming'], primary_action: 'none' }),
    });
    const f = ruleToForm(rule);
    expect(f.conditions.any).toHaveLength(1);
    expect(f.conditions.any[0].field).toBe('subject');
    expect(f.conditions.all).toHaveLength(0);
  });

  it('is resilient to unparsable metadata/condition_tree (falls back to defaults)', () => {
    const rule = baseRule({ metadata: 'not json', condition_tree: 'not json either' });
    const f = ruleToForm(rule);
    expect(f.primaryAction).toBe('none');
    expect(f.conditions).toEqual({ any: [], all: [] });
  });
});

describe('round trip: ruleToForm(formToCreateRequest-shaped Rule) ≈ original form', () => {
  function requestToFakeRule(req: ReturnType<typeof formToCreateRequest>): Rule {
    return {
      id: 1,
      name: req.name,
      description: req.description,
      rule_class: req.rule_class,
      stage: req.stage,
      priority: req.priority ?? 50,
      condition_tree: JSON.stringify(req.condition_tree),
      action: req.action,
      metadata: JSON.stringify(req.metadata),
      is_active: req.is_active ?? true,
      valid_until: req.valid_until ?? undefined,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
  }

  it('block action round-trips', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      name: 'rt-block',
      conditions: leafConditions(),
      primaryAction: 'block',
      scope: ['incoming', 'internal'],
      actionParams: {
        ...emptyRuleForm().actionParams,
        block: { smtpCode: '552', responseText: 'blocked', tarpit: true, tarpitSeconds: 20 },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const back = ruleToForm(requestToFakeRule(req));
    expect(back.name).toBe(f.name);
    expect(back.primaryAction).toBe('block');
    expect(back.scope).toEqual(f.scope);
    expect(back.actionParams.block).toEqual(f.actionParams.block);
    // Leaf `id` is an ephemeral UI key regenerated by deserializeGroups, not
    // part of the wire protocol — compare everything else.
    const withoutId = (leaves: RuleForm['conditions']['all']) =>
      leaves.map((l) => ({ conditionKey: l.conditionKey, field: l.field, mapKey: l.mapKey, operator: l.operator, value: l.value, exclude: l.exclude }));
    expect(withoutId(back.conditions.all)).toEqual(withoutId(f.conditions.all));
    expect(back.conditions.any).toEqual(f.conditions.any);
  });

  it('tagDeliver action round-trips (addons stays empty, actionParams.tagDeliver recovered)', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      name: 'rt-tag',
      conditions: leafConditions(),
      primaryAction: 'tagDeliver',
      actionParams: {
        ...emptyRuleForm().actionParams,
        tagDeliver: { content: '[SPAM]', position: 'subject_prefix', style: 'plain_text' },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const back = ruleToForm(requestToFakeRule(req));
    expect(back.primaryAction).toBe('tagDeliver');
    expect(back.actionParams.tagDeliver).toEqual(f.actionParams.tagDeliver);
    expect(back.addons).toEqual({});
  });

  it('review action round-trips', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      name: 'rt-review',
      conditions: leafConditions(),
      primaryAction: 'review',
      actionParams: {
        ...emptyRuleForm().actionParams,
        review: { reviewers: 'alice@x.com, bob@x.com', timeoutHours: 12 },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const back = ruleToForm(requestToFakeRule(req));
    expect(back.primaryAction).toBe('review');
    expect(back.actionParams.review).toEqual(f.actionParams.review);
  });

  it('addons round-trip', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      name: 'rt-addons',
      conditions: leafConditions(),
      primaryAction: 'none',
      addons: {
        disclaimer: { enabled: true, params: { content: 'hi', position: 'body_top' } },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const back = ruleToForm(requestToFakeRule(req));
    expect(back.addons).toEqual(f.addons);
  });
});
