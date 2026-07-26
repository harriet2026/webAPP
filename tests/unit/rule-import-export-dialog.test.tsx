import { describe, expect, it } from 'vitest';
import {
  buildExecutePayload,
  buildPreviewPayload,
  getAvailableImportGroups,
  parseImportFile,
} from '@/lib/rule-import-export-helpers';
import type { RuleExportEnvelope } from '@/lib/api/unified-rules';

const sampleEnvelope: RuleExportEnvelope = {
  version: 'rule-settings/v1',
  exported_at: '2026-04-23T10:00:00Z',
  scope: 'tenant',
  tenant_context: {
    mode: 'single',
    tenant_id: 42,
    tenant_name: 'Tenant 42',
  },
  data: {
    rules: [
      {
        id: 1,
        name: 'Test rule',
        description: 'desc',
        rule_class: 'action',
        stage: 'data',
        priority: 100,
        condition_tree: '{"type":"AND","children":[{"type":"condition","field":"client_ip","operator":"eq","value":"1.2.3.4"}]}',
        action: 'reject',
        is_active: true,
        created_at: '2026-04-23T10:00:00Z',
        updated_at: '2026-04-23T10:00:00Z',
      },
    ],
    detection_profiles: [],
    bounce_dsn_settings: [],
  },
};

function createImportFile(envelope: Partial<RuleExportEnvelope> | Record<string, unknown>): File {
  return new File([JSON.stringify(envelope)], 'test.json', { type: 'application/json' });
}

describe('rule-import-export-helpers', () => {
  describe('parseImportFile', () => {
    it('parses a valid v1 envelope', async () => {
      const result = await parseImportFile(createImportFile(sampleEnvelope));
      expect(result.version).toBe('rule-settings/v1');
      expect(result.scope).toBe('tenant');
      expect(result.data.rules).toHaveLength(1);
    });

    it('rejects non-JSON files', async () => {
      const file = new File(['not json'], 'bad.txt', { type: 'text/plain' });
      await expect(parseImportFile(file)).rejects.toThrow();
    });

    it('rejects malformed file payloads with invalid group shapes', async () => {
      await expect(
        parseImportFile(createImportFile({
          ...sampleEnvelope,
          data: {
            ...sampleEnvelope.data,
            rules: { not: 'an array' },
          },
        }))
      ).rejects.toThrow('Invalid import file');

      await expect(
        parseImportFile(createImportFile({
          ...sampleEnvelope,
          data: {
            ...sampleEnvelope.data,
            bounce_dsn_settings: ['bad-item'],
          },
        }))
      ).rejects.toThrow('Invalid import file');
    });

    it('rejects unsupported import file versions', async () => {
      await expect(
        parseImportFile(createImportFile({
          ...sampleEnvelope,
          version: 'rule-settings/v9',
        }))
      ).rejects.toThrow('Unsupported import file version');
    });
  });

  describe('getAvailableImportGroups', () => {
    it('returns true only for groups with data', () => {
      const groups = getAvailableImportGroups(sampleEnvelope);
      expect(groups.rules).toBe(true);
      expect(groups.detection_profiles).toBe(false);
      expect(groups.bounce_dsn_settings).toBe(false);
    });

    it('returns all true when all groups have data', () => {
      const full: RuleExportEnvelope = {
        ...sampleEnvelope,
        data: {
          rules: sampleEnvelope.data.rules,
          detection_profiles: [{ id: 1, config_type: 'rbl' as const, name: 'test', is_active: true, created_at: '', updated_at: '' }],
          bounce_dsn_settings: [{ id: 1, tenant_id: 1, domain: 'a.com', enabled: true, language: 'zh', include_original_headers: true, created_at: '', updated_at: '' }],
        },
      };
      const groups = getAvailableImportGroups(full);
      expect(groups.rules).toBe(true);
      expect(groups.detection_profiles).toBe(true);
      expect(groups.bounce_dsn_settings).toBe(true);
    });
  });

  describe('buildPreviewPayload', () => {
    it('builds payload with selected groups', () => {
      const payload = buildPreviewPayload({
        file: sampleEnvelope,
        selection: {
          rules: true,
          detection_profiles: false,
          bounce_dsn_settings: false,
        },
        importMode: {
          mode: 'restore_original_tenants',
          targetTenantId: null,
        },
      });
      expect(payload.file).toBe(sampleEnvelope);
      expect(payload.selection).toEqual({
        include_rules: true,
        include_detection_profiles: false,
        include_bounce_dsn_settings: false,
      });
      expect(payload.import_mode).toEqual({
        mode: 'restore_original_tenants',
      });
    });

    it('includes target_tenant_id for import_to_selected_tenant mode', () => {
      const payload = buildPreviewPayload({
        file: sampleEnvelope,
        selection: { rules: true, detection_profiles: false, bounce_dsn_settings: false },
        importMode: { mode: 'import_to_selected_tenant', targetTenantId: 9 },
      });
      expect(payload.import_mode).toEqual({
        mode: 'import_to_selected_tenant',
        target_tenant_id: 9,
      });
    });
  });

  describe('buildExecutePayload', () => {
    it('builds execute payload with specific skipped duplicates', () => {
      const payload = buildExecutePayload({
        file: sampleEnvelope,
        selection: {
          rules: true,
          detection_profiles: false,
          bounce_dsn_settings: false,
        },
        importMode: {
          mode: 'import_to_selected_tenant',
          targetTenantId: 9,
        },
        skippedDuplicateIds: ['dup-rule-1', 'dup-profile-2'],
      });
      expect(payload.duplicate_resolutions).toEqual({
        items: [
          { preview_item_id: 'dup-rule-1', action: 'skip' },
          { preview_item_id: 'dup-profile-2', action: 'skip' },
        ],
      });
    });

    it('builds execute payload with skip all remaining duplicates', () => {
      const payload = buildExecutePayload({
        file: sampleEnvelope,
        selection: {
          rules: true,
          detection_profiles: true,
          bounce_dsn_settings: false,
        },
        importMode: {
          mode: 'restore_original_tenants',
          targetTenantId: null,
        },
        skippedDuplicateIds: [],
        skipAllRemainingDuplicates: true,
      });
      expect(payload.duplicate_resolutions).toEqual({
        apply_to_remaining: 'skip',
        items: [],
      });
    });
  });
});
