import { describe, it, expect } from 'vitest';
import type { RuleNode } from '@/types/unified-rules';
import {
  buildFeatureGroupPayload,
  findDisallowedFields,
  isFieldAllowedForFeatureGroup,
} from './feature-groups';
import type { ConditionLeaf } from '@/components/security/advanced-filter-rules/serde';

function leaf(field: string): ConditionLeaf {
  return { id: field, conditionKey: field, field, operator: 'contain', value: 'x', exclude: false };
}

describe('buildFeatureGroupPayload', () => {
  it('includes rule_class on create', () => {
    const p = buildFeatureGroupPayload('vip', { any: [leaf('subject')], all: [] }, true);
    expect(p.rule_class).toBe('tag');
    expect(p.tags).toEqual(['grp:vip']);
    expect(p.stage).toBe('data');
    expect(p.metadata.group_type).toBe('feature');
    expect((p.condition_tree as RuleNode).type).toBe('OR');
  });

  it('omits rule_class on update', () => {
    const p = buildFeatureGroupPayload('vip', { any: [], all: [leaf('subject')] }, false);
    expect(p.rule_class).toBeUndefined();
    expect((p.condition_tree as RuleNode).type).toBe('AND');
  });
});

describe('feature group field whitelist', () => {
  const fieldDefs = {
    subject: { min_stage: 'data', supported: true },
    onercpt: { min_stage: 'rcpt', supported: true },
    cac_tag: { min_stage: 'sideline', supported: true },
    unknown_field: { min_stage: 'data', supported: false },
  };

  it('excludes feature_group self-reference', () => {
    expect(isFieldAllowedForFeatureGroup('feature_group', fieldDefs)).toBe(false);
  });

  it('excludes rcpt-stage fields', () => {
    expect(isFieldAllowedForFeatureGroup('onercpt', fieldDefs)).toBe(false);
  });

  it('excludes sideline-stage fields', () => {
    expect(isFieldAllowedForFeatureGroup('cac_tag', fieldDefs)).toBe(false);
  });

  it('excludes unsupported fields', () => {
    expect(isFieldAllowedForFeatureGroup('unknown_field', fieldDefs)).toBe(false);
  });

  it('excludes fields with no FieldDef', () => {
    expect(isFieldAllowedForFeatureGroup('mystery', fieldDefs)).toBe(false);
  });

  it('allows data-stage supported fields', () => {
    expect(isFieldAllowedForFeatureGroup('subject', fieldDefs)).toBe(true);
  });

  it('findDisallowedFields aggregates and dedupes', () => {
    const bad = findDisallowedFields(
      {
        any: [leaf('feature_group'), leaf('onercpt'), leaf('subject')],
        all: [leaf('onercpt'), leaf('cac_tag')],
      },
      fieldDefs,
    );
    expect(bad.sort()).toEqual(['cac_tag', 'feature_group', 'onercpt']);
  });
});
