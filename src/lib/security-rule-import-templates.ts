import { buildConditionTree as buildSenderFilterConditionTree } from '@/lib/api/sender-filter';
import { buildConditionTreeFromForm as buildBehaviorControlConditionTree } from '@/lib/api/behavior-control';
import type { RuleExportEnvelope } from '@/lib/api/unified-rules';
import type { BehaviorControlMetadata } from '@/types/behavior-control';
import type { SenderFilterMetadata } from '@/types/sender-filter';

function tenantContext(tenantId?: number | null) {
  return tenantId != null
    ? { mode: 'single', tenant_id: tenantId }
    : { mode: 'multi' };
}

export function buildSenderFilterImportTemplate(
  tenantId?: number | null,
  exportedAt = new Date().toISOString(),
): RuleExportEnvelope {
  const metadata: SenderFilterMetadata = {
    feature: 'sender_filter',
    sender_config: { type: 'domain', value: 'example.com' },
    ip_range: { type: 'all' },
    list_type: 'blacklist',
  };

  return {
    version: 'rule-settings/v1',
    exported_at: exportedAt,
    scope: 'sender_filter',
    tenant_context: tenantContext(tenantId),
    data: {
      rules: [{
        id: 0,
        name: 'Example sender blacklist rule - edit before import',
        description: 'Reject messages from example.com; replace the sample domain before import.',
        ...(tenantId != null ? { tenant_id: tenantId } : {}),
        page: 'sender_filter',
        rule_class: 'action',
        stage: 'rcpt',
        priority: 100,
        condition_tree: JSON.stringify(buildSenderFilterConditionTree(metadata)),
        tags: [],
        action: 'reject',
        metadata: JSON.stringify(metadata),
        is_active: false,
        created_at: exportedAt,
        updated_at: exportedAt,
      }],
    },
  };
}

export function buildBehaviorControlImportTemplate(
  tenantId?: number | null,
  exportedAt = new Date().toISOString(),
): RuleExportEnvelope {
  const objectConfig = { type: 'global' as const };
  const metadata: BehaviorControlMetadata = {
    feature: 'behavior_control',
    direction: 'outbound',
    object_config: objectConfig,
    time_window: '15min',
    conditions: [{ dim: 'mail_count', threshold: 100 }],
    dim_a: 'mail_count',
    threshold_a: 100,
    or_enabled: false,
  };

  return {
    version: 'rule-settings/v1',
    exported_at: exportedAt,
    scope: 'behavior_control',
    tenant_context: tenantContext(tenantId),
    data: {
      rules: [{
        id: 0,
        name: 'Example sending behavior rule - edit before import',
        description: 'Audit when an outbound sender exceeds 100 messages in 15 minutes; edit before import.',
        ...(tenantId != null ? { tenant_id: tenantId } : {}),
        page: 'behavior_control',
        rule_class: 'action',
        stage: 'rcpt',
        priority: 100,
        condition_tree: JSON.stringify(buildBehaviorControlConditionTree({ object_config: objectConfig })),
        tags: [],
        action: 'audit',
        metadata: JSON.stringify(metadata),
        is_active: false,
        created_at: exportedAt,
        updated_at: exportedAt,
      }],
    },
  };
}
