import { describe, it, expect } from 'vitest';
import { formatActionKey, protocolActionKey, flowSubKey } from './auth-spoofing-labels';

describe('auth-spoofing label mapping', () => {
  // Keys are relative to the `authSpoofing` namespace (resolved via
  // useTranslations('authSpoofing')) — no leading `authSpoofing.` prefix.
  it('flow sub: discard->drop, reject->block, else quarantine; ptr non-discard->check', () => {
    expect(flowSubKey('discard', false)).toBe('flowSub.drop');
    expect(flowSubKey('reject', false)).toBe('flowSub.block');
    expect(flowSubKey('quarantine', false)).toBe('flowSub.quarantine');
    expect(flowSubKey('quarantine', true)).toBe('flowSub.check');
    expect(flowSubKey('discard', true)).toBe('flowSub.drop');
  });
  it('context keys', () => {
    expect(formatActionKey('accept')).toBe('formatActionLabel.accept');
    expect(protocolActionKey('audit')).toBe('protocolActionLabel.audit');
  });
});
