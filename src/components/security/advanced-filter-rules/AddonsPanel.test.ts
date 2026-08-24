import { describe, it, expect } from 'vitest';
import { serializeAddons, parseAddons, emptyAddonsState, defaultAddonParams } from './AddonsPanel';
import { formToCreateRequest, emptyRuleForm, ruleToForm, type RuleForm } from './rule-form';
import type { Rule, FieldDef } from '@/types/unified-rules';
import { createDefaultLeaf } from './ConditionTree';
import { CONDITIONS } from './catalogue';

// AddonsPanel.test.ts — asserts AddonsPanel's serialize/parse/empty are the
// SAME protocol rule-form.ts (F4) uses internally. rule-form.ts imports these
// exact functions (see rule-form.ts's `import { serializeAddons, parseAddons }
// from './AddonsPanel'`), so this is a direct consumer test, not a
// reimplementation double-check: if these functions regress, rule-form.ts
// breaks with them (see rule-form.test.ts's "formToCreateRequest — addons"
// suite, which exercises the exact same code path end to end).

const fieldDefs: Record<string, FieldDef> = {};

function leafConditions(): RuleForm['conditions'] {
  const def = CONDITIONS[0];
  const leaf = createDefaultLeaf(def, fieldDefs);
  return { any: [leaf], all: [] };
}

describe('emptyAddonsState', () => {
  it('returns an empty object', () => {
    expect(emptyAddonsState()).toEqual({});
  });
});

describe('serializeAddons', () => {
  it('emits only enabled addons, params passed through verbatim', () => {
    const out = serializeAddons({
      disclaimer: { enabled: true, params: { template: 'standard', position: 'body_bottom' } },
      adminNotify: { enabled: false, params: { recipients: 'x@x.com' } },
    });
    expect(out).toEqual([{ type: 'disclaimer', params: { template: 'standard', position: 'body_bottom' } }]);
  });

  it('returns [] for an empty state', () => {
    expect(serializeAddons({})).toEqual([]);
  });
});

describe('parseAddons', () => {
  it('parses a metadata object with an addons array', () => {
    const state = parseAddons({ addons: [{ type: 'disclaimer', params: { template: 'legal' } }] });
    expect(state).toEqual({ disclaimer: { enabled: true, params: { template: 'legal' } } });
  });

  it('is resilient to null/undefined/non-object input', () => {
    expect(parseAddons(null)).toEqual({});
    expect(parseAddons(undefined)).toEqual({});
    expect(parseAddons('garbage')).toEqual({});
    expect(parseAddons({})).toEqual({});
  });

  it('skips malformed entries but keeps well-formed ones', () => {
    const state = parseAddons({ addons: [null, { notType: 1 }, { type: 'emailTag', params: { tag_content: 'x' } }] });
    expect(state).toEqual({ emailTag: { enabled: true, params: { tag_content: 'x' } } });
  });

  it('defaults params to {} when a matched entry has no params object', () => {
    const state = parseAddons({ addons: [{ type: 'detailedLog' }] });
    expect(state).toEqual({ detailedLog: { enabled: true, params: {} } });
  });
});

describe('serializeAddons/parseAddons round-trip', () => {
  it('round-trips an arbitrary AddonsState through serialize -> {addons: ...} -> parse', () => {
    const original = {
      disclaimer: { enabled: true, params: { template: 'standard', position: 'body_bottom' } },
      forwardServer: { enabled: true, params: { target_address: 'mail.example.com', target_port: 25 } },
      adminNotify: { enabled: false, params: { recipients: 'x@x.com' } },
    };
    const serialized = serializeAddons(original);
    const parsed = parseAddons({ addons: serialized });
    // enabled=false entries are dropped by serialize (never round-trip back);
    // everything enabled=true must come back byte-identical.
    expect(parsed.disclaimer).toEqual(original.disclaimer);
    expect(parsed.forwardServer).toEqual(original.forwardServer);
    expect(parsed.adminNotify).toBeUndefined();
  });
});

describe('defaultAddonParams', () => {
  it('returns a params object for every addon key referenced by the UI', () => {
    const keys = ['disclaimer', 'externalReminder', 'adminNotify', 'deleteAttachment', 'emailTag', 'forwardServer', 'modifyHeader', 'detailedLog'] as const;
    for (const k of keys) {
      expect(typeof defaultAddonParams(k)).toBe('object');
    }
  });
});

describe('AddonsPanel protocol matches rule-form.ts end to end', () => {
  it('formToCreateRequest(f).metadata.addons matches serializeAddons(f.addons) directly', () => {
    const f: RuleForm = {
      ...emptyRuleForm(),
      conditions: leafConditions(),
      addons: {
        disclaimer: { enabled: true, params: { template: 'legal', position: 'header' } },
        modifyHeader: { enabled: true, params: { target_field: 'Subject', operation: 'replace', new_value: 'x' } },
      },
    };
    const req = formToCreateRequest(f, fieldDefs);
    const metadataAddons = (req.metadata as Record<string, unknown>).addons;
    expect(metadataAddons).toEqual(serializeAddons(f.addons));
  });

  it('ruleToForm(...).addons matches parseAddons(metadata) directly', () => {
    const metadata = {
      feature: 'advanced_rules',
      scope: ['incoming'],
      primary_action: 'discard',
      primary_action_params: { log_enabled: true, silent_discard: true, notify_admin: false },
      addons: [{ type: 'adminNotify', params: { recipient_type: 'adminList', merge_window_minutes: 5 } }],
    };
    const rule: Rule = {
      id: 1,
      name: 'r',
      rule_class: 'action',
      stage: 'data',
      priority: 50,
      condition_tree: JSON.stringify({ type: 'condition', field: 'subject', operator: 'contain', value: 'x', note: 'subject' }),
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      metadata: JSON.stringify(metadata),
    };
    const form = ruleToForm(rule);
    expect(form.addons).toEqual(parseAddons(metadata));
  });
});
