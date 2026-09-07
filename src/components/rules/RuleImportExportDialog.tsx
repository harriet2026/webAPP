'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileJson, Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  RuleExportEnvelope,
  RuleExportSelection,
  RuleImportExecuteRequest,
  RuleImportExecuteResponse,
  RuleImportPreviewRequest,
  RuleImportPreviewResponse,
} from '@/lib/api/unified-rules';

export type {
  ImportGroupKey,
  ImportSelectionState,
  DialogImportModeState,
} from '@/lib/rule-import-export-helpers';
export {
  parseImportFile,
  getAvailableImportGroups,
  buildPreviewPayload,
  buildExecutePayload,
} from '@/lib/rule-import-export-helpers';

import type {
  ImportGroupKey,
  ImportSelectionState,
  DialogImportModeState,
} from '@/lib/rule-import-export-helpers';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import {
  parseImportFile,
  getAvailableImportGroups,
  buildPreviewPayload,
  buildExecutePayload,
} from '@/lib/rule-import-export-helpers';

export interface TenantOption {
  id: number;
  name: string;
}

export interface RuleImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeLabel: string;
  variant: 'rules' | 'unified-rules';
  adminContext: 'system-admin' | 'tenant-admin';
  tenantOptions?: TenantOption[];
  initialTab?: 'export' | 'import';
  importTemplate?: RuleExportEnvelope;
  onExport?: (selection: RuleExportSelection) => Promise<RuleExportEnvelope>;
  onPreviewImport?: (payload: RuleImportPreviewRequest) => Promise<RuleImportPreviewResponse>;
  onExecuteImport?: (payload: RuleImportExecuteRequest) => Promise<RuleImportExecuteResponse>;
}

const EMPTY_SELECTION: ImportSelectionState = {
  rules: false,
  detection_profiles: false,
};

function downloadJSON(file: RuleExportEnvelope, fileName: string) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function RuleImportExportDialog({
  open,
  onOpenChange,
  scopeLabel,
  variant,
  adminContext,
  tenantOptions = [],
  initialTab = 'export',
  importTemplate,
  onExport,
  onPreviewImport,
  onExecuteImport,
}: RuleImportExportDialogProps) {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [exportSelection, setExportSelection] = useState<ImportSelectionState>({
    rules: true,
    detection_profiles: true,
  });
  const [importFile, setImportFile] = useState<RuleExportEnvelope | null>(null);
  const [selection, setSelection] = useState<ImportSelectionState>(EMPTY_SELECTION);
  const [importMode, setImportMode] = useState<DialogImportModeState>({
    mode: 'restore_original_tenants',
    targetTenantId: null,
  });
  const [preview, setPreview] = useState<RuleImportPreviewResponse | null>(null);
  const previewRequestId = useRef(0);

  const availableGroups = useMemo(
    () => (importFile ? getAvailableImportGroups(importFile) : EMPTY_SELECTION),
    [importFile],
  );

  const groupLabels: Record<ImportGroupKey, string> = {
    rules: t('ruleImportExport.dialog.group.rules'),
    detection_profiles: t('ruleImportExport.dialog.group.detectionProfiles'),
  };

  const clearPreviewState = useCallback(() => {
    previewRequestId.current += 1;
    setPreview(null);
    setIsPreviewing(false);
  }, []);

  const requestPreview = useCallback(async (
    file: RuleExportEnvelope,
    nextSelection: ImportSelectionState,
    nextImportMode: DialogImportModeState,
  ) => {
    const requestId = ++previewRequestId.current;
    setPreview(null);

    if (!Object.values(nextSelection).some(Boolean)) {
      setIsPreviewing(false);
      return;
    }
    if (
      adminContext === 'system-admin'
      && nextImportMode.mode === 'import_to_selected_tenant'
      && nextImportMode.targetTenantId === null
    ) {
      setIsPreviewing(false);
      toast.error(t('ruleImportExport.dialog.toast.chooseTargetTenant'));
      return;
    }
    if (!onPreviewImport) {
      setIsPreviewing(false);
      toast.error(t('ruleImportExport.dialog.toast.previewNotWired', { variant }));
      return;
    }

    setIsPreviewing(true);
    try {
      const nextPreview = await onPreviewImport(buildPreviewPayload({
        file,
        selection: nextSelection,
        importMode: nextImportMode,
      }));
      if (previewRequestId.current === requestId) {
        setPreview(nextPreview);
      }
    } catch (error) {
      if (previewRequestId.current === requestId) {
        toast.error(apiErrorMessage(error, t('ruleImportExport.dialog.toast.previewFailed')));
      }
    } finally {
      if (previewRequestId.current === requestId) {
        setIsPreviewing(false);
      }
    }
  }, [adminContext, apiErrorMessage, onPreviewImport, t, variant]);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      return;
    }
    if (!open) {
      setActiveTab('export');
      setIsExporting(false);
      setIsPreviewing(false);
      setIsImporting(false);
      setFileName('');
      setExportSelection({
        rules: true,
        detection_profiles: true,
      });
      setImportFile(null);
      setSelection(EMPTY_SELECTION);
      setImportMode({ mode: 'restore_original_tenants', targetTenantId: null });
      clearPreviewState();
    }
  }, [clearPreviewState, initialTab, open]);

  useEffect(() => {
    if (adminContext === 'tenant-admin') {
      if (importMode.mode !== 'restore_original_tenants' || importMode.targetTenantId !== null) {
        const nextMode: DialogImportModeState = {
          mode: 'restore_original_tenants',
          targetTenantId: null,
        };
        setImportMode(nextMode);
        if (importFile) {
          void requestPreview(importFile, selection, nextMode);
        }
      }
      return;
    }
    if (importMode.mode === 'import_to_selected_tenant' && importMode.targetTenantId === null && tenantOptions.length > 0) {
      const nextMode = { ...importMode, targetTenantId: tenantOptions[0].id };
      setImportMode(nextMode);
      if (importFile) {
        void requestPreview(importFile, selection, nextMode);
      }
    }
  }, [adminContext, importFile, importMode, requestPreview, selection, tenantOptions]);

  // Base UI's <Select.Value> shows the raw value unless the Root gets `items`,
  // which rendered the tenant id instead of its name (GT-12021).
  const targetTenantItems = useMemo(
    () => Object.fromEntries(tenantOptions.map((tenant) => [tenant.id.toString(), tenant.name])),
    [tenantOptions],
  );

  const duplicateEntries = useMemo(
    () => (Object.entries(preview?.duplicates ?? {}) as Array<[
      string,
      NonNullable<RuleImportPreviewResponse['duplicates'][string]>,
    ]>).filter(([, items]) => items.length > 0),
    [preview],
  );

  const invalidEntries = useMemo(
    () => (Object.entries(preview?.invalid_items ?? {}) as Array<[
      string,
      NonNullable<RuleImportPreviewResponse['invalid_items'][string]>,
    ]>).filter(([, items]) => items.length > 0),
    [preview],
  );

  const hasSelection = Object.values(selection).some(Boolean);

	async function handleExport() {
		if (!onExport) {
			toast.error(`${variant} export is not wired yet`);
			return;
		}
		if (!Object.values(exportSelection).some(Boolean)) {
			toast.error(t('ruleImportExport.dialog.toast.selectAtLeastOneType'));
			return;
		}

		setIsExporting(true);
		try {
			const file = await onExport({
				include_rules: exportSelection.rules,
				include_detection_profiles: exportSelection.detection_profiles,
			});
			const safeScope = scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			downloadJSON(file, `${safeScope || 'rule-settings'}-export.json`);
      toast.success(t('ruleImportExport.dialog.toast.exportDownloaded'));
    } catch (error) {
      toast.error(apiErrorMessage(error, t('ruleImportExport.dialog.toast.exportFailed')));
    } finally {
      setIsExporting(false);
    }
  }

  function handleDownloadImportTemplate() {
    if (!importTemplate) return;
    const safeScope = scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    downloadJSON(importTemplate, `${safeScope || 'rule-settings'}-import-template.json`);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const input = event.currentTarget;

    try {
      const parsedFile = await parseImportFile(file);
      const nextSelection = getAvailableImportGroups(parsedFile);
      const nextImportMode =
        adminContext === 'system-admin'
        && importMode.mode === 'import_to_selected_tenant'
        && importMode.targetTenantId === null
        && tenantOptions.length > 0
          ? { ...importMode, targetTenantId: tenantOptions[0].id }
          : importMode;

      setFileName(file.name);
      setImportFile(parsedFile);
      setSelection(nextSelection);
      setImportMode(nextImportMode);
      setActiveTab('import');
      await requestPreview(parsedFile, nextSelection, nextImportMode);
    } catch (error) {
      setFileName('');
      setImportFile(null);
      setSelection(EMPTY_SELECTION);
      clearPreviewState();
      toast.error(apiErrorMessage(error, t('ruleImportExport.dialog.toast.parseFailed')));
    } finally {
      input.value = '';
    }
  }

  async function handleImport() {
    if (!importFile || !preview) {
      toast.error(t('ruleImportExport.dialog.toast.runPreviewFirst'));
      return;
    }
    if (!onExecuteImport) {
      toast.error(t('ruleImportExport.dialog.toast.importNotWired', { variant }));
      return;
    }

    setIsImporting(true);
    try {
      await onExecuteImport(buildExecutePayload({
        file: importFile,
        selection,
        importMode,
      }));

      toast.success(t('ruleImportExport.dialog.toast.importFinished'));
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, t('ruleImportExport.dialog.toast.importFailed')));
    } finally {
      setIsImporting(false);
    }
  }

	function toggleSelection(group: ImportGroupKey, checked: boolean) {
		const nextSelection = { ...selection, [group]: checked };
		setSelection(nextSelection);
		if (importFile) {
			void requestPreview(importFile, nextSelection, importMode);
		}
	}

  function handleImportModeChange(value: DialogImportModeState['mode']) {
    const nextMode: DialogImportModeState = {
      mode: value,
      targetTenantId:
        value === 'import_to_selected_tenant'
          ? importMode.targetTenantId ?? tenantOptions[0]?.id ?? null
          : null,
    };
    setImportMode(nextMode);
    if (importFile) {
      void requestPreview(importFile, selection, nextMode);
    }
  }

  function handleTargetTenantChange(value: string | null) {
    const nextMode = {
      ...importMode,
      targetTenantId: value ? Number(value) : null,
    };
    setImportMode(nextMode);
    if (importFile) {
      void requestPreview(importFile, selection, nextMode);
    }
  }

	function toggleExportSelection(group: ImportGroupKey, checked: boolean) {
		setExportSelection((current) => ({ ...current, [group]: checked }));
	}
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
        data-testid="rule-import-export-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t('ruleImportExport.dialog.title', { scopeLabel })}</DialogTitle>
          <DialogDescription>
            {t('ruleImportExport.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'export' | 'import')}
          className="min-h-0 overflow-y-auto overscroll-contain pr-1"
          data-testid="rule-import-export-scroll"
        >
          <TabsList>
            <TabsTrigger data-testid="rule-import-export-tab-export" value="export">{t('ruleImportExport.dialog.tabs.export')}</TabsTrigger>
            <TabsTrigger data-testid="rule-import-export-tab-import" value="import">{t('ruleImportExport.dialog.tabs.import')}</TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4">
            <Alert>
              <AlertTitle>{t('ruleImportExport.dialog.exportFileTitle')}</AlertTitle>
              <AlertDescription>
                {t('ruleImportExport.dialog.exportFileDescription', { scopeLabel: scopeLabel.toLowerCase() })}
              </AlertDescription>
            </Alert>

			<div className="space-y-3 rounded-lg border p-4">
			  <div>
			    <h3 className="font-medium">{t('ruleImportExport.dialog.exportTypesTitle')}</h3>
			    <p className="text-sm text-muted-foreground">{t('ruleImportExport.dialog.exportTypesDescription')}</p>
			  </div>
			  <div className="grid gap-3 sm:grid-cols-2">
			    {(Object.keys(groupLabels) as ImportGroupKey[]).map((group) => (
			      <label key={group} className="flex items-center gap-3 rounded-md border p-3 text-sm" data-testid={`export-${group}`}>
			        <Checkbox
			          checked={exportSelection[group]}
			          onCheckedChange={(checked) => toggleExportSelection(group, checked === true)}
			        />
			        <span>{groupLabels[group]}</span>
			      </label>
			    ))}
			  </div>
			</div>

            <Button data-testid="rule-export-execute" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {t('ruleImportExport.dialog.exportButton')}
            </Button>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rule-import-file">{t('ruleImportExport.dialog.importFileLabel')}</Label>
              <Input id="rule-import-file" data-testid="rule-import-file" type="file" accept="application/json" onChange={handleFileChange} />
              {fileName ? <p className="text-sm text-muted-foreground">{t('ruleImportExport.dialog.loadedFile', { fileName })}</p> : null}
            </div>

            {adminContext === 'system-admin' ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">{t('ruleImportExport.dialog.tenantModeTitle')}</h3>
                  <p className="text-sm text-muted-foreground">{t('ruleImportExport.dialog.tenantModeDescription')}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('ruleImportExport.dialog.importModeLabel')}</Label>
                    <Select
                      value={importMode.mode}
                      onValueChange={(value) => handleImportModeChange(
                        value as DialogImportModeState['mode'],
                      )}
                    >
                      <SelectTrigger className="w-full" data-testid="rule-import-mode">
                        <SelectValue>
                          {importMode.mode === 'restore_original_tenants'
                            ? t('ruleImportExport.dialog.restoreOriginalTenants')
                            : t('ruleImportExport.dialog.importToSelectedTenant')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent data-testid="rule-import-mode-options">
                        <SelectItem value="restore_original_tenants" data-testid="rule-import-mode-restore_original_tenants">{t('ruleImportExport.dialog.restoreOriginalTenants')}</SelectItem>
                        <SelectItem value="import_to_selected_tenant" data-testid="rule-import-mode-import_to_selected_tenant">{t('ruleImportExport.dialog.importToSelectedTenant')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {importMode.mode === 'import_to_selected_tenant' ? (
                    <div className="space-y-2">
                      <Label>{t('ruleImportExport.dialog.targetTenantLabel')}</Label>
                      <Select
                        items={targetTenantItems}
                        value={importMode.targetTenantId?.toString() ?? ''}
                        onValueChange={handleTargetTenantChange}
                      >
                        <SelectTrigger className="w-full" data-testid="rule-import-target-tenant">
                          <SelectValue placeholder={t('ruleImportExport.dialog.targetTenantPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent data-testid="rule-import-target-tenant-options">
                          {tenantOptions.map((tenant) => (
                            <SelectItem key={tenant.id} value={tenant.id.toString()} data-testid={`rule-import-target-tenant-${tenant.id}`}>
                              {tenant.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {importFile ? (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="space-y-3">
                  <div>
                    <h3 className="font-medium">{t('ruleImportExport.dialog.importTypesTitle')}</h3>
                    <p className="text-sm text-muted-foreground">{t('ruleImportExport.dialog.importTypesDescription')}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(Object.keys(groupLabels) as ImportGroupKey[]).map((group) => (
                      <label key={group} className="flex items-center gap-3 rounded-md border p-3 text-sm" data-testid={`import-${group}`}>
                        <Checkbox
                          checked={selection[group]}
                          disabled={!availableGroups[group]}
                          onCheckedChange={(checked) => toggleSelection(group, checked === true)}
                        />
                        <span>{groupLabels[group]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {isPreviewing ? (
                  <div
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                    data-testid="rule-import-preview-loading"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('ruleImportExport.dialog.previewLoading')}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {preview ? (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="space-y-2">
                  <h3 className="font-medium">{t('ruleImportExport.dialog.previewSummaryTitle')}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.entries(preview.summary) as Array<[ImportGroupKey, RuleImportPreviewResponse['summary'][ImportGroupKey]]>).map(([group, summary]) => (
                      <div key={group} className="rounded-md border p-3 text-sm">
                        <div className="font-medium">{groupLabels[group]}</div>
                        <div className="mt-1 text-muted-foreground">
                          {t('ruleImportExport.dialog.summaryLine', {
                            parsed: String(summary.parsed),
                            importable: String(summary.importable),
                            duplicates: String(summary.duplicates),
                            invalid: String(summary.invalid),
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {duplicateEntries.length > 0 ? (
                  <div className="space-y-3">
                    <Alert data-testid="rule-import-duplicate-policy">
                      <AlertTitle>{t('ruleImportExport.dialog.duplicateHandlingTitle')}</AlertTitle>
                      <AlertDescription>
                        {t('ruleImportExport.dialog.duplicatesWillBeSkipped')}
                      </AlertDescription>
                    </Alert>
                    {duplicateEntries.map(([group, items]) => (
                      <div key={group} className="space-y-2 rounded-md border p-3">
                        <div className="text-sm font-medium">{groupLabels[group as ImportGroupKey]}</div>
                        {items.map((item) => (
                          <div key={item.preview_item_id} className="space-y-2 rounded-md border p-3">
                            <div className="text-sm">
                              <span className="font-medium">
                                {t('ruleImportExport.dialog.duplicateWillBeSkipped', {
                                  previewItemId: item.preview_item_id,
                                })}
                              </span>
                              {item.reason ? <span className="block text-muted-foreground">{item.reason}</span> : null}
                            </div>
                            <details className="rounded-md border bg-muted/30 p-3 text-xs">
                              <summary className="cursor-pointer font-medium">{t('ruleImportExport.dialog.showDetails')}</summary>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <div>
                                  <div className="mb-1 font-medium">{t('ruleImportExport.dialog.sourcePayload')}</div>
                                  <pre className="overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(item.source, null, 2)}</pre>
                                </div>
                                {item.existing ? (
                                  <div>
                                    <div className="mb-1 font-medium">{t('ruleImportExport.dialog.existingItem')}</div>
                                    <pre className="overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(item.existing, null, 2)}</pre>
                                  </div>
                                ) : null}
                              </div>
                            </details>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}

                {invalidEntries.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="font-medium">{t('ruleImportExport.dialog.invalidItemsTitle')}</h3>
                    {invalidEntries.map(([group, items]) => (
                      <div key={group} className="rounded-md border p-3 text-sm">
                        <div className="font-medium">{groupLabels[group as ImportGroupKey]}</div>
                        <ul className="mt-2 space-y-1 text-muted-foreground">
                          {items.map((item) => (
                            <li key={item.preview_item_id}>{item.error || item.reason || item.preview_item_id}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0" data-testid="rule-import-export-actions">
          <Button data-testid="rule-import-export-close" variant="outline" onClick={() => onOpenChange(false)}>
            {t('ruleImportExport.dialog.closeButton')}
          </Button>
          {activeTab === 'import' && importTemplate ? (
            <Button
              variant="outline"
              onClick={handleDownloadImportTemplate}
              data-testid="rule-import-template-download"
            >
              <FileJson className="mr-2 h-4 w-4" />
              {t('ruleImportExport.dialog.importTemplateButton')}
            </Button>
          ) : null}
          {activeTab === 'import' ? (
            <Button
              onClick={handleImport}
              disabled={!preview || isPreviewing || isImporting || !hasSelection}
              data-testid="rule-import-execute"
            >
              {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t('ruleImportExport.dialog.importButton')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
