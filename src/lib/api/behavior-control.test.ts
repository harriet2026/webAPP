import { describe, it, expect, vi } from 'vitest';
import type { ApiRequestFn } from './client';
import { toggleBehaviorControlRule, buildConditionTreeFromForm } from './behavior-control';

describe('toggleBehaviorControlRule (GT-11771 double-encode)', () => {
  it('PUTs is_active as object, not pre-stringified JSON string', async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const fake = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return { rule: { id: 7 } };
    });
    await toggleBehaviorControlRule(7, true, fake as unknown as ApiRequestFn);
    expect(calls[0].path).toBe('/unified-rules/7');
    expect(calls[0].init?.method).toBe('PUT');
    // GT-11771: body must be the object itself; apiRequest does the stringify.
    // Pre-fix this was JSON.stringify({ is_active }) and the backend's
    // bindJSON received a JSON string literal -> 'cannot unmarshal string' 400.
    const body = calls[0].init?.body as unknown as Record<string, unknown>;
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
    expect(body.is_active).toBe(true);
  });
});

describe('buildConditionTreeFromForm — demo-aligned object mapping', () => {
  it('group → rcpttags hasTag grp:<value>', () => {
    expect(buildConditionTreeFromForm({ object_config: { type: 'sender', sub_type: 'group', value: 'sg-1' } }))
      .toEqual({ type: 'condition', field: 'rcpttags', operator: 'hasTag', value: 'grp:sg-1' });
  });
  it('individual → sender eq', () => {
    expect(buildConditionTreeFromForm({ object_config: { type: 'sender', sub_type: 'individual', value: 'a@b.com' } }))
      .toEqual({ type: 'condition', field: 'sender', operator: 'eq', value: 'a@b.com' });
  });
  it('senderIp single → client_ip eq', () => {
    expect(buildConditionTreeFromForm({ object_config: { type: 'senderIp', sub_type: 'single', value: '1.2.3.4' } }))
      .toEqual({ type: 'condition', field: 'client_ip', operator: 'eq', value: '1.2.3.4' });
  });
  it('senderIp ipGroup → rcpttags hasTag grp:', () => {
    expect(buildConditionTreeFromForm({ object_config: { type: 'senderIp', sub_type: 'ipGroup', value: 'ip-1' } }))
      .toEqual({ type: 'condition', field: 'rcpttags', operator: 'hasTag', value: 'grp:ip-1' });
  });
  it('senderDomain → senderdomain eq (lowercased)', () => {
    expect(buildConditionTreeFromForm({ object_config: { type: 'senderDomain', value: 'Example.COM' } }))
      .toEqual({ type: 'condition', field: 'senderdomain', operator: 'eq', value: 'example.com' });
  });
});
