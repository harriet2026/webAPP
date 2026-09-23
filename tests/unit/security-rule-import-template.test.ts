import { describe, expect, it } from 'vitest';
import { parseImportFile } from '@/lib/rule-import-export-helpers';
import {
  buildBehaviorControlImportTemplate,
  buildSenderFilterImportTemplate,
} from '@/lib/security-rule-import-templates';

async function parseTemplate(template: ReturnType<typeof buildSenderFilterImportTemplate>) {
  return parseImportFile(new File([JSON.stringify(template)], 'import-template.json', {
    type: 'application/json',
  }));
}

describe('security rule import templates', () => {
  const exportedAt = '2026-09-09T00:00:00.000Z';

  it('builds a parseable sender_filter template for the active tenant', async () => {
    const template = buildSenderFilterImportTemplate(42, exportedAt);

    await expect(parseTemplate(template)).resolves.toEqual(template);
    expect(template).toMatchObject({
      version: 'rule-settings/v1',
      exported_at: exportedAt,
      scope: 'sender_filter',
      tenant_context: { mode: 'single', tenant_id: 42 },
      data: {
        rules: [{
          tenant_id: 42,
          page: 'sender_filter',
          rule_class: 'action',
          stage: 'rcpt',
          action: 'reject',
          is_active: false,
        }],
      },
    });

    const rule = template.data.rules?.[0];
    expect(JSON.parse(rule?.metadata ?? '{}')).toEqual({
      feature: 'sender_filter',
      sender_config: { type: 'domain', value: 'example.com' },
      ip_range: { type: 'all' },
      list_type: 'blacklist',
    });
    expect(JSON.parse(rule?.condition_tree ?? '{}')).toEqual({
      type: 'condition',
      field: 'senderdomain',
      operator: 'eq',
      value: 'example.com',
    });
  });

  it('builds a parseable behavior_control template for the active tenant', async () => {
    const template = buildBehaviorControlImportTemplate(42, exportedAt);

    await expect(parseTemplate(template)).resolves.toEqual(template);
    expect(template).toMatchObject({
      version: 'rule-settings/v1',
      exported_at: exportedAt,
      scope: 'behavior_control',
      tenant_context: { mode: 'single', tenant_id: 42 },
      data: {
        rules: [{
          tenant_id: 42,
          page: 'behavior_control',
          rule_class: 'action',
          stage: 'rcpt',
          action: 'audit',
          is_active: false,
        }],
      },
    });

    const rule = template.data.rules?.[0];
    expect(JSON.parse(rule?.metadata ?? '{}')).toMatchObject({
      feature: 'behavior_control',
      direction: 'outbound',
      object_config: { type: 'global' },
      time_window: '15min',
      conditions: [{ dim: 'mail_count', threshold: 100 }],
      dim_a: 'mail_count',
      threshold_a: 100,
      or_enabled: false,
    });
    expect(JSON.parse(rule?.condition_tree ?? '{}')).toEqual({
      type: 'condition',
      field: 'sender',
      operator: 'isNotNull',
    });
  });

  it('uses multi-tenant context and omits tenant_id without an active tenant', () => {
    for (const template of [
      buildSenderFilterImportTemplate(null, exportedAt),
      buildBehaviorControlImportTemplate(undefined, exportedAt),
    ]) {
      expect(template.tenant_context).toEqual({ mode: 'multi' });
      expect(template.data.rules?.[0]).not.toHaveProperty('tenant_id');
    }
  });
});
