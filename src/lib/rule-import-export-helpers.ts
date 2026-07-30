import type {
  RuleExportEnvelope,
  RuleExportSelection,
  RuleImportExecuteRequest,
  RuleImportPreviewRequest,
} from '@/lib/api/unified-rules';

export type ImportGroupKey =
  | 'rules'
  | 'detection_profiles';

export type ImportSelectionState = Record<ImportGroupKey, boolean>;

export interface DialogImportModeState {
  mode: 'restore_original_tenants' | 'import_to_selected_tenant';
  targetTenantId: number | null;
}

const SUPPORTED_IMPORT_FILE_VERSION = 'rule-settings/v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalRecordArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isRecord));
}

function isRuleExportEnvelope(value: unknown): value is RuleExportEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.version !== 'string' || typeof value.exported_at !== 'string' || typeof value.scope !== 'string') {
    return false;
  }

  if (!isRecord(value.tenant_context) || typeof value.tenant_context.mode !== 'string') {
    return false;
  }

  if (!isRecord(value.data)) {
    return false;
  }

  return (
    isOptionalRecordArray(value.data.rules)
    && isOptionalRecordArray(value.data.detection_profiles)
  );
}

function toSelectionPayload(selection: ImportSelectionState): RuleExportSelection {
  return {
    include_rules: selection.rules,
    include_detection_profiles: selection.detection_profiles,
  };
}

function toImportModePayload(importMode: DialogImportModeState) {
  return {
    mode: importMode.mode,
    ...(importMode.mode === 'import_to_selected_tenant' && importMode.targetTenantId !== null
      ? { target_tenant_id: importMode.targetTenantId }
      : {}),
  };
}

export async function parseImportFile(file: File): Promise<RuleExportEnvelope> {
  const raw = JSON.parse(await file.text()) as unknown;
  if (!isRuleExportEnvelope(raw)) {
    throw new Error('Invalid import file');
  }
  if (raw.version !== SUPPORTED_IMPORT_FILE_VERSION) {
    throw new Error('Unsupported import file version');
  }
  return raw;
}

export function getAvailableImportGroups(file: RuleExportEnvelope): Record<ImportGroupKey, boolean> {
  const data = file.data ?? {};
  return {
    rules: Array.isArray(data.rules) && data.rules.length > 0,
    detection_profiles: Array.isArray(data.detection_profiles) && data.detection_profiles.length > 0,
  };
}

export function buildPreviewPayload(args: {
  file: RuleExportEnvelope;
  selection: ImportSelectionState;
  importMode: DialogImportModeState;
}): RuleImportPreviewRequest {
  return {
    file: args.file,
    selection: toSelectionPayload(args.selection),
    import_mode: toImportModePayload(args.importMode),
  };
}

export function buildExecutePayload(args: {
  file: RuleExportEnvelope;
  selection: ImportSelectionState;
  importMode: DialogImportModeState;
  skippedDuplicateIds: string[];
  skipAllRemainingDuplicates?: boolean;
}): RuleImportExecuteRequest {
  return {
    ...buildPreviewPayload(args),
    duplicate_resolutions: {
      ...(args.skipAllRemainingDuplicates ? { apply_to_remaining: 'skip' as const } : {}),
      items: args.skippedDuplicateIds.map((previewItemID) => ({
        preview_item_id: previewItemID,
        action: 'skip' as const,
      })),
    },
  };
}
