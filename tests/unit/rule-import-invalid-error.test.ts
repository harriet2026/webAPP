import { describe, expect, it } from 'vitest';
import { classifyImportInvalidError } from '@/lib/rule-import-invalid-error';

describe('GT-13688 import invalid error localization', () => {
  it.each([
    ['rule does not match scope=sender_filter', { kind: 'scope-mismatch' }],
    ['rule does not match scope=behavior_control', { kind: 'scope-mismatch' }],
    ['invalid sender_filter rule: invalid IP address: not-an-ip', { kind: 'invalid-ip', value: 'not-an-ip' }],
    ['invalid sender_filter rule: invalid CIDR: 10.0.0.999/24', { kind: 'invalid-cidr', value: '10.0.0.999/24' }],
    ['duplicate sender_filter rule in import file: list_type=blacklist', { kind: 'duplicate-in-file' }],
    ['tenant-scoped rule page "sender_filter" requires a non-null tenant_id', { kind: 'tenant-missing' }],
    ['tenant admins cannot import "connect" stage rules', { kind: 'permission-denied' }],
    ['invalid sender_filter metadata: malformed payload', { kind: 'invalid-rule' }],
    [undefined, { kind: 'invalid-rule' }],
  ])('classifies %s without exposing backend implementation text', (error, expected) => {
    expect(classifyImportInvalidError(error)).toEqual(expected);
  });
});
