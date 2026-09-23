import { describe, expect, it, vi } from 'vitest';
import { exportUnifiedRules, type RuleExportEnvelope } from './unified-rules';

const envelope: RuleExportEnvelope = {
  version: 'rule-settings/v1',
  exported_at: '2026-09-11T00:00:00Z',
  scope: 'sender_filter',
  tenant_context: { mode: 'current_tenant' },
  data: {
    rules: [
      { id: 1, name: 'matched', rule_class: 'action', stage: 'rcpt', priority: 10, condition_tree: '{}', is_active: true, created_at: '', updated_at: '' },
      { id: 2, name: 'not matched', rule_class: 'action', stage: 'rcpt', priority: 20, condition_tree: '{}', is_active: false, created_at: '', updated_at: '' },
    ],
  },
};

describe('GT-13671 filtered unified-rule export', () => {
  it('keeps only rule ids present in the current filtered result', async () => {
    const request = vi.fn().mockResolvedValue(envelope);

    const exported = await exportUnifiedRules(
      { include_rules: true, include_detection_profiles: false },
      request,
      'sender_filter',
      new Set([1]),
    );

    expect(request).toHaveBeenCalledWith('/unified-rules/export?scope=sender_filter&include_rules=true&include_detection_profiles=false');
    expect(exported.data.rules?.map((rule) => rule.id)).toEqual([1]);
    expect(envelope.data.rules?.map((rule) => rule.id)).toEqual([1, 2]);
  });
});
