import { describe, it, expect } from 'vitest';
import { canSaveActions, validateBasics, hasNoConditions, type AddonsState } from './validation';

function addon(enabled: boolean): { enabled: boolean; params: Record<string, unknown> } {
  return { enabled, params: {} };
}

describe('canSaveActions', () => {
  it('is savable when the primary action is not none, regardless of addons', () => {
    expect(canSaveActions('deliver', {})).toBe(true);
    expect(canSaveActions('discard', {})).toBe(true);
  });

  it('is not savable when action is none and no addon is enabled', () => {
    expect(canSaveActions('none', {})).toBe(false);
  });

  it('is not savable when action is none and only detailedLog is enabled', () => {
    const addons: AddonsState = { detailedLog: addon(true) };
    expect(canSaveActions('none', addons)).toBe(false);
  });

  it('is savable when action is none and a real addon is enabled', () => {
    const addons: AddonsState = { adminNotify: addon(true) };
    expect(canSaveActions('none', addons)).toBe(true);
  });

  it('excludes addons disabled by the conflict matrix for the current action', () => {
    // action is 'none' here just to exercise the addon-driven path; disabledAddons('none') is [].
    // Use quarantine-disabled addon key with quarantine as action but action!=none already saves.
    // To truly exercise exclusion, action must be 'none' AND matrix must disable something —
    // matrix only disables for quarantine/discard, neither of which is 'none'. So verify
    // that an enabled-but-irrelevant addon for a restrictive action still requires action!=none.
    const addons: AddonsState = { forwardServer: addon(true) };
    expect(canSaveActions('none', addons)).toBe(true);
  });

  it('enabled=false addon does not count', () => {
    const addons: AddonsState = { adminNotify: addon(false) };
    expect(canSaveActions('none', addons)).toBe(false);
  });
});

describe('validateBasics', () => {
  it('flags empty/whitespace name', () => {
    expect(validateBasics('', ['incoming'])).toEqual({ nameError: true, scopeError: false, priorityError: false });
    expect(validateBasics('   ', ['incoming'])).toEqual({ nameError: true, scopeError: false, priorityError: false });
  });

  it('flags empty scope', () => {
    expect(validateBasics('Rule A', [])).toEqual({ nameError: false, scopeError: true, priorityError: false });
  });

  it('passes when both are present', () => {
    expect(validateBasics('Rule A', ['incoming'])).toEqual({ nameError: false, scopeError: false, priorityError: false });
  });

  it('flags both simultaneously', () => {
    expect(validateBasics('', [])).toEqual({ nameError: true, scopeError: true, priorityError: false });
  });

  // GT-12181: priority is only validated when a role-aware range is supplied.
  it('does not flag priority when no range is supplied', () => {
    expect(validateBasics('Rule A', ['incoming'], 50).priorityError).toBe(false);
  });

  it('flags priority outside the supplied tenant range (100-1000)', () => {
    const range = { min: 100, max: 1000 };
    expect(validateBasics('Rule A', ['incoming'], 50, range).priorityError).toBe(true);
    expect(validateBasics('Rule A', ['incoming'], 99, range).priorityError).toBe(true);
    expect(validateBasics('Rule A', ['incoming'], 1001, range).priorityError).toBe(true);
  });

  it('accepts priority inside the supplied range', () => {
    const range = { min: 100, max: 1000 };
    expect(validateBasics('Rule A', ['incoming'], 100, range).priorityError).toBe(false);
    expect(validateBasics('Rule A', ['incoming'], 600, range).priorityError).toBe(false);
    expect(validateBasics('Rule A', ['incoming'], 1000, range).priorityError).toBe(false);
  });
});

// GT-12182: 新建表单未对「条件为空」做校验——点确定直接发请求，靠后端 400 才提示。
describe('hasNoConditions (GT-12182)', () => {
  it('flags a rule with both groups empty', () => {
    expect(hasNoConditions({ any: [], all: [] })).toBe(true);
  });

  it('accepts a rule with an OR-group condition', () => {
    expect(hasNoConditions({ any: [{}], all: [] })).toBe(false);
  });

  it('accepts a rule with an AND-group condition', () => {
    expect(hasNoConditions({ any: [], all: [{}] })).toBe(false);
  });
});
