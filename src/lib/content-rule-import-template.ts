import { buildConditionTree } from '@/lib/api/content-rules';
import type { RuleExportEnvelope } from '@/lib/api/unified-rules';
import type { ContentRulesMetadata } from '@/types/content-rules';

export function buildContentRuleImportTemplate(
  tenantId?: number | null,
  exportedAt = new Date().toISOString(),
): RuleExportEnvelope {
  const metadata: ContentRulesMetadata = {
    feature: 'content_rules',
    match_type: 'keyword',
    match_content: 'example-keyword',
    scopes: ['subject'],
    directions: {
      receive: {
        enabled: true,
        action: 'reject',
      },
    },
  };

  return {
    version: 'rule-settings/v1',
    exported_at: exportedAt,
    scope: 'content_rules',
    tenant_context: tenantId
      ? {
          mode: 'single',
          tenant_id: tenantId,
        }
      : {
          mode: 'multi',
        },
    data: {
      rules: [
        {
          id: 0,
          name: 'Example content rule - edit before import',
          description: 'Reject inbound messages whose subject contains example-keyword.',
          ...(tenantId ? { tenant_id: tenantId } : {}),
          page: 'content_rules',
          rule_class: 'action',
          stage: 'data',
          priority: 100,
          condition_tree: JSON.stringify(buildConditionTree(metadata)),
          action: 'reject',
          metadata: JSON.stringify(metadata),
          is_active: false,
          created_at: exportedAt,
          updated_at: exportedAt,
        },
      ],
    },
  };
}
