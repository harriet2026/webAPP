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

  it('primaryAction defaults to proceed', () => {
    expect(f.primaryAction).toBe('proceed');
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

  it('default proceed → native action proceed', () => {
    const f = { ...emptyRuleForm(), conditions: leafConditions() };
    const req = formToCreateRequest(f, fieldDefs);
    expect(req.action).toBe('proceed');
    expect((req.metadata as Record<string, unknown>).primary_action).toBe('proceed');
  });

  it('primaryAction deliver → action "accept" + skip_subsequent', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'accept',
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
      primaryAction: 'audit',
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

  it('proceed does not force an emailTag addon', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'proceed',
    };
    const req = formToCreateRequest(f, fieldDefs);
    expect((req.metadata as Record<string, unknown>).addons).toEqual([]);
  });

  it('emailTag is serialized only when enabled as an addon', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      primaryAction: 'proceed',
      addons: {
        emailTag: {
          enabled: true,
          params: {
            tag_content: '[SPAM]',
            tag_position: 'header',
            tag_style: 'plain_text',
            header_name: 'X-Spam-Flag',
            header_value: 'YES',
          },
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

});

describe('formToUpdateRequest', () => {
  it('mirrors formToCreateRequest but has no rule_class field', () => {
    const f: RuleForm = { ...emptyRuleForm(), name: 'edited', conditions: leafConditions(), primaryAction: 'discard' };
    const req = formToUpdateRequest(f, fieldDefs);
    expect((req as Record<string, unknown>).rule_class).toBeUndefined();
    expect(req.name).toBe('edited');
    expect(req.action).toBe('discard');
    expect((req.metadata as Record<string, unknown>).primary_action).toBe('discard');
    expect(req.page).toBe('advanced_rules');
  });
});

describe('ruleToForm', () => {
  it('reads basic fields back from a Rule', () => {
    const rule = baseRule({
      name: 'incoming rule',
      priority: 33,
      is_active: false,
      description: 'desc',
      valid_until: '2026-12-31T23:59:59Z',
      metadata: JSON.stringify({
        feature: 'advanced_rules',
        scope: ['incoming'],
        primary_action: 'proceed',
        primary_action_params: {},
      }),
    });
    const f = ruleToForm(rule);
    expect(f.name).toBe('incoming rule');
    expect(f.priority).toBe(33);
    expect(f.enabled).toBe(false);
    expect(f.description).toBe('desc');
    expect(f.validUntil).toBe('2026-12-31');
    expect(f.scope).toEqual(['incoming']);
  });

  it('parses review_params back into actionParams.review (reviewers array → comma string)', () => {
    const rule = baseRule({
      metadata: JSON.stringify({
        feature: 'advanced_rules',
        scope: ['incoming', 'outgoing', 'internal'],
        primary_action: 'audit',
        review_params: { reviewers: ['alice@x.com', 'bob@x.com'], review_timeout_hours: 48 },
      }),
    });
    const f = ruleToForm(rule);
    expect(f.primaryAction).toBe('audit');
    expect(f.actionParams.review).toEqual({ reviewers: 'alice@x.com, bob@x.com', timeoutHours: 48 });
  });

  it('parses generic addons into AddonsState', () => {
    const rule = baseRule({
      metadata: JSON.stringify({
        feature: 'advanced_rules',
        scope: ['incoming', 'outgoing', 'internal'],
        primary_action: 'proceed',
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

  it('keeps an emailTag as an independent addon for proceed', () => {
    const rule = baseRule({
      metadata: JSON.stringify({
        feature: 'advanced_rules',
        scope: ['incoming', 'outgoing', 'internal'],
        primary_action: 'proceed',
        addons: [{ type: 'emailTag', params: { tag_content: '[SPAM]', tag_position: 'subject_prefix', tag_style: 'plain_text' } }],
      }),
    });
    const f = ruleToForm(rule);
    expect(f.addons.emailTag).toEqual({
      enabled: true,
      params: { tag_content: '[SPAM]', tag_position: 'subject_prefix', tag_style: 'plain_text' },
    });
  });

  it('parses condition_tree via deserializeGroups', () => {
    const rule = baseRule({
      condition_tree: JSON.stringify({
        type: 'OR',
        children: [{ type: 'condition', field: 'subject', operator: 'contain', value: 'invoice', note: 'subject' }],
      }),
      metadata: JSON.stringify({ feature: 'advanced_rules', scope: ['incoming'], primary_action: 'proceed' }),
    });
    const f = ruleToForm(rule);
    expect(f.conditions.any).toHaveLength(1);
    expect(f.conditions.any[0].field).toBe('subject');
    expect(f.conditions.all).toHaveLength(0);
  });

  it('is resilient to unparsable metadata/condition_tree (falls back to defaults)', () => {
    const rule = baseRule({ metadata: 'not json', condition_tree: 'not json either' });
    const f = ruleToForm(rule);
    expect(f.primaryAction).toBe('proceed');
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

  it('discard action round-trips', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      name: 'rt-discard',
      conditions: leafConditions(),
      primaryAction: 'discard',
      scope: ['incoming', 'internal'],
      actionParams: {
        ...emptyRuleForm().actionParams,
        discard: { logEnabled: false, silent: true, notifyAdmin: true },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const back = ruleToForm(requestToFakeRule(req));
    expect(back.name).toBe(f.name);
    expect(back.primaryAction).toBe('discard');
    expect(back.scope).toEqual(f.scope);
    expect(back.actionParams.discard).toEqual(f.actionParams.discard);
    // Leaf `id` is an ephemeral UI key regenerated by deserializeGroups, not
    // part of the wire protocol — compare everything else.
    const withoutId = (leaves: RuleForm['conditions']['all']) =>
      leaves.map((l) => ({ conditionKey: l.conditionKey, field: l.field, mapKey: l.mapKey, operator: l.operator, value: l.value, exclude: l.exclude }));
    expect(withoutId(back.conditions.all)).toEqual(withoutId(f.conditions.all));
    expect(back.conditions.any).toEqual(f.conditions.any);
  });

  it('proceed with an emailTag addon round-trips', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      name: 'rt-tag',
      conditions: leafConditions(),
      primaryAction: 'proceed',
      addons: {
        emailTag: { enabled: true, params: { tag_content: '[SPAM]', tag_position: 'subject_prefix', tag_style: 'plain_text' } },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const back = ruleToForm(requestToFakeRule(req));
    expect(back.primaryAction).toBe('proceed');
    expect(back.addons).toEqual(f.addons);
  });

  it('review action round-trips', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      name: 'rt-review',
      conditions: leafConditions(),
      primaryAction: 'audit',
      actionParams: {
        ...emptyRuleForm().actionParams,
        review: { reviewers: 'alice@x.com, bob@x.com', timeoutHours: 12 },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const back = ruleToForm(requestToFakeRule(req));
    expect(back.primaryAction).toBe('audit');
    expect(back.actionParams.review).toEqual(f.actionParams.review);
  });

  it('addons round-trip', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      name: 'rt-addons',
      conditions: leafConditions(),
      primaryAction: 'proceed',
      addons: {
        disclaimer: { enabled: true, params: { content: 'hi', position: 'body_top' } },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const back = ruleToForm(requestToFakeRule(req));
    expect(back.addons).toEqual(f.addons);
  });
});
