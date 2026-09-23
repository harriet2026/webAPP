import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildExecutePayload,
  buildPreviewPayload,
  getAvailableImportGroups,
  parseImportFile,
} from '@/lib/rule-import-export-helpers';
import type {
  RuleExportEnvelope,
  RuleImportExecuteResponse,
  RuleImportPreviewResponse,
} from '@/lib/api/unified-rules';
import { RuleImportExportDialog } from '@/components/rules/RuleImportExportDialog';
import { buildContentRuleImportTemplate } from '@/lib/content-rule-import-template';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    if (key === 'ruleImportExport.dialog.duplicateWillBeSkipped') {
      return `${key}:${params?.itemNumber}`;
    }
    if (key === 'ruleImportExport.dialog.invalidReason.scopeMismatch') {
      return `${key}:${params?.scopeLabel}`;
    }
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api/use-api-error-message', () => ({
  useApiErrorMessage: () => (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

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
  },
};

const mixedEnvelope: RuleExportEnvelope = {
  ...sampleEnvelope,
  data: {
    ...sampleEnvelope.data,
    detection_profiles: [{
      id: 2,
      config_type: 'rbl',
      name: 'Test profile',
      is_active: true,
      created_at: '2026-04-23T10:00:00Z',
      updated_at: '2026-04-23T10:00:00Z',
    }],
  },
};

const duplicatePreview: RuleImportPreviewResponse = {
  summary: {
    rules: { parsed: 2, importable: 0, duplicates: 2, invalid: 0 },
    detection_profiles: { parsed: 0, importable: 0, duplicates: 0, invalid: 0 },
  },
  tenant_mapping: {
    mode: 'restore_original_tenants',
    resolved: 1,
    failed: 0,
  },
  duplicates: {
    rules: [{
      preview_item_id: 'rules:0',
      reason: 'exact_match',
      source: sampleEnvelope.data.rules?.[0],
      existing: sampleEnvelope.data.rules?.[0],
      default_action: 'skip',
    }, {
      preview_item_id: 'rules:1',
      reason: 'exact_match',
      source: { ...sampleEnvelope.data.rules?.[0], id: 2, name: 'Second rule' },
      existing: { ...sampleEnvelope.data.rules?.[0], id: 2, name: 'Second rule' },
      default_action: 'skip',
    }],
    detection_profiles: [],
  },
  invalid_items: {
    rules: [],
    detection_profiles: [],
  },
};

const duplicateImportResult: RuleImportExecuteResponse = {
  ...duplicatePreview,
  imported: { rules: 0, detection_profiles: 0 },
  skipped_duplicates: { rules: 2, detection_profiles: 0 },
};

const scopeMismatchPreview: RuleImportPreviewResponse = {
  summary: {
    rules: { parsed: 1, importable: 0, duplicates: 0, invalid: 1 },
    detection_profiles: { parsed: 0, importable: 0, duplicates: 0, invalid: 0 },
  },
  tenant_mapping: {
    mode: 'restore_original_tenants',
    resolved: 1,
    failed: 0,
  },
  duplicates: {
    rules: [],
    detection_profiles: [],
  },
  invalid_items: {
    rules: [{
      preview_item_id: 'rules:0',
      reason: 'invalid',
      source: sampleEnvelope.data.rules?.[0],
      default_action: 'skip',
      error: 'rule does not match scope=sender_filter',
    }],
    detection_profiles: [],
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
            detection_profiles: ['bad-item'],
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
    });

    it('returns all true when all groups have data', () => {
      const full: RuleExportEnvelope = {
        ...sampleEnvelope,
        data: {
          rules: sampleEnvelope.data.rules,
          detection_profiles: [{ id: 1, config_type: 'rbl' as const, name: 'test', is_active: true, created_at: '', updated_at: '' }],
        },
      };
      const groups = getAvailableImportGroups(full);
      expect(groups.rules).toBe(true);
      expect(groups.detection_profiles).toBe(true);
    });
  });

  describe('buildPreviewPayload', () => {
    it('builds payload with selected groups', () => {
      const payload = buildPreviewPayload({
        file: sampleEnvelope,
        selection: {
          rules: true,
          detection_profiles: false,
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
      });
      expect(payload.import_mode).toEqual({
        mode: 'restore_original_tenants',
      });
    });

    it('includes target_tenant_id for import_to_selected_tenant mode', () => {
      const payload = buildPreviewPayload({
        file: sampleEnvelope,
        selection: { rules: true, detection_profiles: false },
        importMode: { mode: 'import_to_selected_tenant', targetTenantId: 9 },
      });
      expect(payload.import_mode).toEqual({
        mode: 'import_to_selected_tenant',
        target_tenant_id: 9,
      });
    });
  });

  describe('buildExecutePayload', () => {
    it('always skips duplicate items because overwrite is unsupported', () => {
      const payload = buildExecutePayload({
        file: sampleEnvelope,
        selection: {
          rules: true,
          detection_profiles: false,
        },
        importMode: {
          mode: 'import_to_selected_tenant',
          targetTenantId: 9,
        },
      });
      expect(payload.duplicate_resolutions).toEqual({
        apply_to_remaining: 'skip',
      });
    });
  });
});

describe('RuleImportExportDialog actions', () => {
  const createObjectURL = vi.fn(() => 'blob:rule-template');
  const revokeObjectURL = vi.fn();
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    clickSpy.mockRestore();
  });

  it('shows export actions only on export tab and import/template actions only on import tab', async () => {
    render(
      <RuleImportExportDialog
        open
        onOpenChange={vi.fn()}
        scopeLabel="Content Rules"
        variant="unified-rules"
        adminContext="tenant-admin"
        tenantOptions={[]}
        initialTab="export"
        importTemplate={sampleEnvelope}
      />,
    );

    expect(screen.getByRole('button', { name: 'ruleImportExport.dialog.exportButton' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'ruleImportExport.dialog.importButton' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ruleImportExport.dialog.importTemplateButton' })).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: 'ruleImportExport.dialog.tabs.import' }));

    const templateButton = screen.getByRole('button', {
      name: 'ruleImportExport.dialog.importTemplateButton',
    });
    expect(templateButton).toBeVisible();
    expect(screen.getByRole('button', { name: 'ruleImportExport.dialog.importButton' })).toBeVisible();

    await userEvent.click(templateButton);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rule-template');
  });

  it('keeps actions in a fixed dialog row while only the body scrolls', () => {
    render(
      <RuleImportExportDialog
        open
        onOpenChange={vi.fn()}
        scopeLabel="Content Rules"
        variant="unified-rules"
        adminContext="tenant-admin"
        tenantOptions={[]}
        initialTab="import"
        importTemplate={sampleEnvelope}
      />,
    );

    expect(screen.getByTestId('rule-import-export-dialog')).toHaveClass(
      'max-h-[calc(100dvh-2rem)]',
      'grid-rows-[auto_minmax(0,1fr)_auto]',
      'overflow-hidden',
    );
    expect(screen.getByTestId('rule-import-export-scroll')).toHaveClass(
      'min-h-0',
      'overflow-y-auto',
    );
    expect(screen.getByTestId('rule-import-export-actions')).toHaveClass('shrink-0');
  });

  it('GT-13670 hides unsupported detection profiles for rule-only scopes', async () => {
    const onExport = vi.fn().mockResolvedValue(sampleEnvelope);
    render(
      <RuleImportExportDialog
        open
        onOpenChange={vi.fn()}
        scopeLabel="发信人黑白名单"
        variant="unified-rules"
        adminContext="tenant-admin"
        tenantOptions={[]}
        initialTab="export"
        rulesOnly
        onExport={onExport}
        onPreviewImport={vi.fn().mockResolvedValue(duplicatePreview)}
      />,
    );

    expect(screen.getByTestId('export-rules')).toBeVisible();
    expect(screen.queryByTestId('export-detection_profiles')).toBeNull();

    await userEvent.click(screen.getByTestId('rule-export-execute'));
    expect(onExport).toHaveBeenCalledWith({
      include_rules: true,
      include_detection_profiles: false,
    });

    await userEvent.click(screen.getByRole('tab', { name: 'ruleImportExport.dialog.tabs.import' }));
    await userEvent.upload(
      screen.getByLabelText('ruleImportExport.dialog.importFileLabel'),
      createImportFile(mixedEnvelope),
    );
    expect(await screen.findByTestId('import-rules')).toBeVisible();
    expect(screen.queryByTestId('import-detection_profiles')).toBeNull();
  });

  it('GT-13674 keeps the selected file visible after a successful preview', async () => {
    const onPreviewImport = vi.fn().mockResolvedValue(duplicatePreview);
    render(
      <RuleImportExportDialog
        open
        onOpenChange={vi.fn()}
        scopeLabel="发信人黑白名单"
        variant="unified-rules"
        adminContext="tenant-admin"
        tenantOptions={[]}
        initialTab="import"
        rulesOnly
        onPreviewImport={onPreviewImport}
      />,
    );

    const fileInput = screen.getByLabelText(
      'ruleImportExport.dialog.importFileLabel',
    ) as HTMLInputElement;
    await userEvent.upload(fileInput, createImportFile(sampleEnvelope));
    await waitFor(() => expect(onPreviewImport).toHaveBeenCalledOnce());

    expect(fileInput.files?.[0]?.name).toBe('test.json');
    expect(fileInput).toHaveValue('C:\\fakepath\\test.json');
  });

  it('GT-13674 clears the selected file when parsing fails', async () => {
    render(
      <RuleImportExportDialog
        open
        onOpenChange={vi.fn()}
        scopeLabel="发信人黑白名单"
        variant="unified-rules"
        adminContext="tenant-admin"
        tenantOptions={[]}
        initialTab="import"
        rulesOnly
      />,
    );

    const fileInput = screen.getByLabelText(
      'ruleImportExport.dialog.importFileLabel',
    ) as HTMLInputElement;
    await userEvent.upload(
      fileInput,
      new File(['not json'], 'invalid.json', { type: 'application/json' }),
    );

    await waitFor(() => expect(fileInput.files).toHaveLength(0));
    expect(fileInput).toHaveValue('');
  });

  it('shows duplicates as forced skips and always submits the skip policy', async () => {
    const onPreviewImport = vi.fn().mockResolvedValue(duplicatePreview);
    const onExecuteImport = vi.fn().mockResolvedValue(duplicateImportResult);

    render(
      <RuleImportExportDialog
        open
        onOpenChange={vi.fn()}
        scopeLabel="Content Rules"
        variant="unified-rules"
        adminContext="tenant-admin"
        tenantOptions={[]}
        initialTab="import"
        onPreviewImport={onPreviewImport}
        onExecuteImport={onExecuteImport}
      />,
    );

    await userEvent.upload(
      screen.getByLabelText('ruleImportExport.dialog.importFileLabel'),
      createImportFile(sampleEnvelope),
    );

    const duplicatePolicy = await screen.findByTestId('rule-import-duplicate-policy');
    expect(screen.queryByRole('button', {
      name: 'ruleImportExport.dialog.previewButton',
    })).toBeNull();
    expect(onPreviewImport).toHaveBeenCalledOnce();
    expect(within(duplicatePolicy).getByText(
      'ruleImportExport.dialog.duplicatesWillBeSkipped',
    )).toBeVisible();
    expect(within(duplicatePolicy).queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('ruleImportExport.dialog.duplicateWillBeSkipped:1')).toBeVisible();
    expect(screen.getByText('ruleImportExport.dialog.duplicateWillBeSkipped:2')).toBeVisible();
    expect(screen.queryByText(/rules:0/)).toBeNull();
    expect(screen.getAllByText('ruleImportExport.dialog.duplicateReason.exactMatch')).toHaveLength(2);
    expect(screen.queryByText('exact_match')).toBeNull();

    await userEvent.click(screen.getByTestId('rule-import-execute'));

    expect(onExecuteImport).toHaveBeenCalledWith(expect.objectContaining({
      duplicate_resolutions: { apply_to_remaining: 'skip' },
    }));
  });

  it('renders a localized module mismatch instead of the backend scope error', async () => {
    const onPreviewImport = vi.fn().mockResolvedValue(scopeMismatchPreview);

    render(
      <RuleImportExportDialog
        open
        onOpenChange={vi.fn()}
        scopeLabel="Sender Filter"
        variant="unified-rules"
        adminContext="tenant-admin"
        onPreviewImport={onPreviewImport}
        initialTab="import"
        rulesOnly
      />,
    );

    await userEvent.upload(
      screen.getByLabelText('ruleImportExport.dialog.importFileLabel'),
      createImportFile(sampleEnvelope),
    );

    expect(await screen.findByTestId('rule-import-invalid-item-1')).toHaveTextContent(
      'ruleImportExport.dialog.invalidReason.scopeMismatch:Sender Filter',
    );
    expect(screen.queryByText('rule does not match scope=sender_filter')).toBeNull();
  });

  it('automatically refreshes the preview when import types change', async () => {
    const onPreviewImport = vi.fn().mockResolvedValue(duplicatePreview);

    render(
      <RuleImportExportDialog
        open
        onOpenChange={vi.fn()}
        scopeLabel="Content Rules"
        variant="unified-rules"
        adminContext="tenant-admin"
        tenantOptions={[]}
        initialTab="import"
        onPreviewImport={onPreviewImport}
      />,
    );

    await userEvent.upload(
      screen.getByLabelText('ruleImportExport.dialog.importFileLabel'),
      createImportFile(mixedEnvelope),
    );
    await waitFor(() => expect(onPreviewImport).toHaveBeenCalledOnce());

    await userEvent.click(within(screen.getByTestId('import-detection_profiles')).getByRole('checkbox'));

    await waitFor(() => expect(onPreviewImport).toHaveBeenCalledTimes(2));
    expect(onPreviewImport).toHaveBeenLastCalledWith(expect.objectContaining({
      selection: {
        include_rules: true,
        include_detection_profiles: false,
      },
    }));
  });
});

describe('content rule import template', () => {
  it('builds a parseable content_rules envelope for the active tenant', async () => {
    const exportedAt = '2026-08-31T00:00:00.000Z';
    const template = buildContentRuleImportTemplate(42, exportedAt);
    const parsed = await parseImportFile(
      new File([JSON.stringify(template)], 'content-rules-import-template.json', {
        type: 'application/json',
      }),
    );

    expect(parsed).toEqual(template);
    expect(template).toMatchObject({
      version: 'rule-settings/v1',
      exported_at: exportedAt,
      scope: 'content_rules',
      tenant_context: { mode: 'single', tenant_id: 42 },
      data: {
        rules: [
          {
            tenant_id: 42,
            page: 'content_rules',
            rule_class: 'action',
            stage: 'data',
            action: 'reject',
            is_active: false,
          },
        ],
      },
    });

    const rule = template.data.rules?.[0];
    expect(JSON.parse(rule?.metadata ?? '{}')).toMatchObject({
      feature: 'content_rules',
      match_type: 'keyword',
      match_content: 'example-keyword',
    });
    expect(JSON.parse(rule?.condition_tree ?? '{}')).toEqual({
      type: 'AND',
      children: [
        { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
        { type: 'condition', field: 'subject', operator: 'contain', value: 'example-keyword' },
      ],
    });
  });
});
