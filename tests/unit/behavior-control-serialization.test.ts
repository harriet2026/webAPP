import { describe, it, expect } from 'vitest';
import {
  buildConditionTreeFromForm,
  resolveBehaviorControlRule,
  normalizeDomain,
  formToCreateBody,
} from '@/lib/api/behavior-control';
import type { BehaviorControlFormData } from '@/types/behavior-control';
import type { Rule } from '@/types/unified-rules';

const baseForm: BehaviorControlFormData = {
  name: 'test',
  priority: 2000,
  is_active: true,
  direction: 'outbound',
  object_config: { type: 'sender', sub_type: 'individual', value: 'a@b.com' },
  time_window: '15min',
  conditions: [{ dim: 'mail_count', threshold: 50 }],
  or_enabled: false,
  dim_a: 'mail_count',
  threshold_a: 50,
  action: 'review',
};

describe('buildConditionTreeFromForm', () => {
  it('individual sender produces sender eq node', () => {
    const t = buildConditionTreeFromForm(baseForm);
    expect(t).toEqual({ type: 'condition', field: 'sender', operator: 'eq', value: 'a@b.com' });
  });

  it('global produces sender isNotNull node', () => {
    const t = buildConditionTreeFromForm({
      ...baseForm,
      object_config: { type: 'global' },
    });
    expect(t).toEqual({ type: 'condition', field: 'sender', operator: 'isNotNull' });
  });

  it('sender group produces rcpttags hasTag grp:NAME', () => {
    const t = buildConditionTreeFromForm({
      ...baseForm,
      object_config: { type: 'sender', sub_type: 'group', value: 'staff' },
    });
    expect(t).toEqual({ type: 'condition', field: 'rcpttags', operator: 'hasTag', value: 'grp:staff' });
  });
});

describe('resolveBehaviorControlRule', () => {
  it('returns meta when feature matches', () => {
    const rule = {
      id: 1,
      action: 'audit',
      tags: [],
      page: 'behavior_control',
      stage: 'rcpt',
      condition_tree: '',
      metadata: JSON.stringify({
        feature: 'behavior_control',
        direction: 'outbound',
        object_config: { type: 'sender', sub_type: 'individual', value: 'a@b.com' },
        time_window: '15min',
        dim_a: 'mail_count',
        threshold_a: 50,
        or_enabled: false,
      }),
    } as unknown as Rule;
    const view = resolveBehaviorControlRule(rule);
    expect(view.is_complex).toBe(false);
    expect(view.meta?.direction).toBe('outbound');
    expect(view.list_id_display).toBe('BC#1');
  });

  it('accepts decoded metadata objects returned by the list API', () => {
    const rule = {
      id: 4,
      action: 'audit',
      tags: [],
      page: 'behavior_control',
      stage: 'rcpt',
      condition_tree: { type: 'condition', field: 'sender', operator: 'eq', value: 'a@b.com' },
      metadata: {
        feature: 'behavior_control',
        direction: 'inbound',
        object_config: { type: 'sender', sub_type: 'individual', value: 'a@b.com' },
        time_window: '15min',
        dim_a: 'mail_count',
        threshold_a: 50,
        or_enabled: false,
      },
    } as unknown as Rule;

    const view = resolveBehaviorControlRule(rule);

    expect(view.is_complex).toBe(false);
    expect(view.meta?.direction).toBe('inbound');
    expect(view.meta?.object_config.value).toBe('a@b.com');
  });

  it('marks is_complex when feature missing', () => {
    const rule = {
      id: 2,
      action: 'audit',
      tags: [],
      page: 'behavior_control',
      stage: 'rcpt',
      condition_tree: '',
      metadata: JSON.stringify({ feature: 'sender_filter' }),
    } as unknown as Rule;
    const view = resolveBehaviorControlRule(rule);
    expect(view.is_complex).toBe(true);
  });

  it('resolves standard dimension metadata', () => {
    const rule = {
      id: 3,
      action: 'audit',
      tags: [],
      page: 'behavior_control',
      stage: 'rcpt',
      condition_tree: '',
      metadata: JSON.stringify({
        feature: 'behavior_control',
        direction: 'bidirectional',
        object_config: { type: 'global' },
        time_window: '15min',
        dim_a: 'attachment_size',
        threshold_a: 50,
        or_enabled: false,
      }),
    } as unknown as Rule;
    const view = resolveBehaviorControlRule(rule);
    expect(view.meta?.dim_a).toBe('attachment_size');
  });
});

describe('normalizeDomain', () => {
  it('strips @prefix', () => {
    expect(normalizeDomain('@example.com')).toBe('example.com');
  });
  it('strips *@', () => {
    expect(normalizeDomain('*@example.com')).toBe('example.com');
  });
  it('lowercases', () => {
    expect(normalizeDomain('EXAMPLE.COM')).toBe('example.com');
  });
});

describe('formToCreateBody', () => {
  it('maps action and includes metadata', () => {
    const body = formToCreateBody(baseForm);
    expect(body.action).toBe('audit');
    expect(body.metadata.direction).toBe('outbound');
    expect(body.metadata.feature).toBe('behavior_control');
    expect(body.page).toBe('behavior_control');
    expect(body.stage).toBe('rcpt');
    expect(body.rule_class).toBe('action');
  });
});

// GT-12707：conditions[]/relation 权威模型 + 旧字段镜像的序列化契约。
describe('formToCreateBody conditions/relation (GT-12707)', () => {
  it('single condition: no relation, mirror only dim_a', () => {
    const body = formToCreateBody(baseForm);
    expect(body.metadata.conditions).toEqual([{ dim: 'mail_count', threshold: 50 }]);
    expect(body.metadata.relation).toBeUndefined();
    expect(body.metadata.dim_a).toBe('mail_count');
    expect(body.metadata.threshold_a).toBe(50);
    expect(body.metadata.or_enabled).toBe(false);
    expect(body.metadata.dim_b).toBeUndefined();
  });

  it('two conditions OR: relation=or and legacy pair mirrors conditions[0..1]', () => {
    const body = formToCreateBody({
      ...baseForm,
      conditions: [
        { dim: 'mail_count', threshold: 50 },
        { dim: 'ip_count', threshold: 3 },
      ],
      or_enabled: true,
    });
    expect(body.metadata.relation).toBe('or');
    expect(body.metadata.or_enabled).toBe(true);
    expect(body.metadata.dim_b).toBe('ip_count');
    expect(body.metadata.threshold_b).toBe(3);
  });

  it('multi conditions AND: relation=and, or_enabled=false, no dim_b (后端镜像一致性要求)', () => {
    const body = formToCreateBody({
      ...baseForm,
      conditions: [
        { dim: 'mail_count', threshold: 50 },
        { dim: 'ip_count', threshold: 3 },
        { dim: 'recipient_count', threshold: 200 },
      ],
      or_enabled: false,
    });
    expect(body.metadata.conditions).toHaveLength(3);
    expect(body.metadata.relation).toBe('and');
    expect(body.metadata.or_enabled).toBe(false);
    expect(body.metadata.dim_b).toBeUndefined();
    expect(body.metadata.threshold_b).toBeUndefined();
  });

  it('resolve prefers metadata conditions over legacy synthesis', () => {
    const rule = {
      id: 9,
      action: 'audit',
      tags: [],
      page: 'behavior_control',
      stage: 'rcpt',
      condition_tree: '',
      metadata: JSON.stringify({
        feature: 'behavior_control',
        direction: 'outbound',
        object_config: { type: 'global' },
        time_window: '15min',
        conditions: [
          { dim: 'mail_count', threshold: 50 },
          { dim: 'ip_count', threshold: 3 },
          { dim: 'recipient_count', threshold: 200 },
        ],
        relation: 'and',
        dim_a: 'mail_count',
        threshold_a: 50,
        or_enabled: false,
      }),
    } as unknown as Rule;
    const view = resolveBehaviorControlRule(rule);
    expect(view.meta?.conditions).toHaveLength(3);
    expect(view.meta?.relation).toBe('and');
  });
});
