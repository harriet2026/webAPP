'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { LoadingPanel } from '@/components/shared/state-panel';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useApiRequest } from '@/lib/api/client';
import {
  getConfigFiles,
  getConfigOverridesForFile,
  createConfigOverride,
  updateConfigOverride,
  deleteConfigOverride,
  type ConfigFile,
  type ConfigOverride,
  type ConfigEntry,
  type ConfigSection,
} from '@/lib/api/config-files';
import { getRuleSyncStatus } from '@/lib/api/rule-sync';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

// Task 9b: [rule_sync] lives in apiserver.cf, and switching its `role` to
// `replica` is destructive (spec §2: first sync overwrites this node's local
// global rules wholesale). This page is the generic config-override editor
// for every *.cf file, so the "is this THE dangerous edit" check is
// special-cased here rather than generalized — see root AGENTS.md's note on
// this file for why that's the intended shape, not a layering violation.
const RULE_SYNC_CONFIG_FILE = 'apiserver.cf';
const RULE_SYNC_SECTION = 'rule_sync';

// Exported for webapp/tests/unit/config-management-replica-switch.test.ts.
export function isSwitchingToReplica(sectionName: string, key: string, value: string, activeFile: string): boolean {
  return (
    activeFile === RULE_SYNC_CONFIG_FILE &&
    sectionName === RULE_SYNC_SECTION &&
    key === 'role' &&
    // Case-insensitive on PURPOSE, even though the backend's role comparison
    // (storage.RuleSyncRole.Valid()) is an exact-match on lowercase
    // "replica": an admin typing "Replica"/"REPLICA" into this GENERIC *.cf
    // editor must still trip the destructive confirm dialog here. Without
    // this, a case-sensitive check silently skips the confirm, the write
    // goes straight to the config API, and the admin sees only a raw 400
    // (invalid role) with no "this replaces every local global rule" warning
    // ever shown -- worse UX for a typo than for the intended value.
    value.trim().toLowerCase() === 'replica'
  );
}

type ValueType = 'string' | 'int' | 'float' | 'bool';

interface EditState {
  sectionName: string;
  key: string;
  value: string;
  valueType: ValueType;
  isActive: boolean;
  description: string;
  overrideId?: number;
}

function inferValueType(raw: string): ValueType {
  if (raw === 'true' || raw === 'false') return 'bool';
  if (/^\d+$/.test(raw)) return 'int';
  if (/^\d+\.\d+$/.test(raw)) return 'float';
  return 'string';
}

export default function ConfigManagementPage() {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();

  const [activeFile, setActiveFile] = useState<string>('');
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConfigOverride | null>(null);
  const [saving, setSaving] = useState(false);
  // Task 9b: non-null while the "switch to replica" destructive confirm is
  // open; carries the local global-rule count fetched fresh at click time
  // (not from a stale background query) so the number the admin sees is the
  // number that is actually about to become read-only / get overwritten.
  const [replicaSwitchConfirm, setReplicaSwitchConfirm] = useState<{ globalRuleCount: number } | null>(null);

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['config-files'],
    queryFn: () => getConfigFiles(apiRequest),
  });

  const files = filesData?.files ?? [];

  useEffect(() => {
    if (files.length > 0 && !activeFile) {
      setActiveFile(files[0].name);
    }
  }, [files, activeFile]);

  const { data: overrides = [], isLoading: overridesLoading } = useQuery({
    queryKey: ['config-overrides', activeFile],
    queryFn: () => getConfigOverridesForFile(activeFile, apiRequest),
    enabled: !!activeFile,
  });

  const overrideMap = useMemo(() => {
    const m = new Map<string, ConfigOverride>();
    for (const o of overrides) {
      m.set(`${o.section_name}::${o.config_key}`, o);
    }
    return m;
  }, [overrides]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteConfigOverride(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config-overrides', activeFile] });
      toast.success(t('common.deleteSuccess'));
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(apiErrorMessage(err)),
  });

  const openEdit = (sectionName: string, entry: ConfigEntry, existing?: ConfigOverride) => {
    setEditState({
      sectionName,
      key: entry.key,
      value: existing ? existing.config_value : entry.file_value,
      valueType: existing ? existing.value_type : inferValueType(entry.file_value),
      isActive: existing ? existing.is_active : true,
      description: existing ? existing.description : '',
      overrideId: existing?.id,
    });
  };

  const openAdd = (sectionName: string) => {
    setEditState({
      sectionName,
      key: '',
      value: '',
      valueType: 'string',
      isActive: true,
      description: '',
    });
  };

  const performSave = async () => {
    if (!editState || !activeFile) return;
    setSaving(true);
    try {
      if (editState.overrideId != null) {
        await updateConfigOverride(editState.overrideId, {
          config_value: editState.value,
          value_type: editState.valueType,
          is_active: editState.isActive,
          description: editState.description,
        }, apiRequest);
        toast.success(t('common.updateSuccess'));
      } else {
        await createConfigOverride({
          config_file: activeFile,
          section_name: editState.sectionName,
          config_key: editState.key,
          config_value: editState.value,
          value_type: editState.valueType,
          is_active: editState.isActive,
          description: editState.description,
        }, apiRequest);
        toast.success(t('common.createSuccess'));
      }
      queryClient.invalidateQueries({ queryKey: ['config-overrides', activeFile] });
      setEditState(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editState || !activeFile) return;
    // Task 9b: [rule_sync] role -> replica is destructive (spec §2) — gate it
    // behind an explicit confirm listing how many local global rules will be
    // replaced, instead of saving immediately like every other config key.
    if (isSwitchingToReplica(editState.sectionName, editState.key, editState.value, activeFile)) {
      setSaving(true);
      try {
        const status = await getRuleSyncStatus(apiRequest);
        setReplicaSwitchConfirm({ globalRuleCount: status.global_rule_count });
      } catch (err) {
        toast.error(apiErrorMessage(err, t('common.error')));
      } finally {
        setSaving(false);
      }
      return;
    }
    await performSave();
  };

  const confirmReplicaSwitch = async () => {
    setReplicaSwitchConfirm(null);
    await performSave();
  };

  const activeFileData = files.find((f) => f.name === activeFile);

  if (filesLoading) return <LoadingPanel />;

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('configManagement.eyebrow')}
        title={t('configManagement.title')}
        description={t('configManagement.description')}
      />

      {files.length === 0 ? (
        <PageSurface>
          <p className="text-sm text-muted-foreground">{t('configManagement.noFiles')}</p>
        </PageSurface>
      ) : (
        <Tabs value={activeFile} onValueChange={setActiveFile}>
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            {files.map((f: ConfigFile) => (
              <TabsTrigger key={f.name} value={f.name} className="font-mono text-xs">
                {f.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {files.map((f: ConfigFile) => (
            <TabsContent key={f.name} value={f.name}>
              {overridesLoading && f.name === activeFile ? (
                <LoadingPanel />
              ) : (
                <div className="space-y-4">
                  {(f.sections ?? []).map((section: ConfigSection) => (
                    <PageSurface key={section.name} className="space-y-0 p-0 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border/60">
                        <span className="font-mono text-sm font-semibold text-foreground/80">
                          [{section.name}]
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAdd(section.name)}
                          className="h-7 text-xs"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {t('configManagement.addOverride')}
                        </Button>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/40">
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/4">
                              {t('configManagement.key')}
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/4">
                              {t('configManagement.fileValue')}
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/4">
                              {t('configManagement.overrideValue')}
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/6">
                              {t('configManagement.status')}
                            </th>
                            <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                              {t('common.actions')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(section.entries ?? []).map((entry: ConfigEntry) => {
                            const override = overrideMap.get(`${section.name}::${entry.key}`);
                            return (
                              <tr key={entry.key} className="border-b border-border/20 hover:bg-muted/20">
                                <td className="px-4 py-2 font-mono text-xs">{entry.key}</td>
                                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                  {entry.file_value || <span className="italic text-muted-foreground/50">—</span>}
                                </td>
                                <td className="px-4 py-2 font-mono text-xs">
                                  {override ? (
                                    <span className={override.is_active ? 'text-foreground' : 'text-muted-foreground line-through'}>
                                      {override.config_value}
                                    </span>
                                  ) : (
                                    <span className="italic text-muted-foreground/50">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  {override ? (
                                    <Badge variant={override.is_active ? 'default' : 'secondary'} className="text-xs">
                                      {override.is_active ? t('configManagement.overridden') : t('configManagement.inactive')}
                                    </Badge>
                                  ) : null}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => openEdit(section.name, entry, override)}
                                    aria-label={t('common.edit')}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  {override && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive"
                                      onClick={() => setDeleteTarget(override)}
                                      aria-label={t('common.delete')}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </PageSurface>
                  ))}

                  {/* Overrides that don't match any file key (extra DB overrides) */}
                  {(() => {
                    const fileKeys = new Set(
                      (activeFileData?.sections ?? []).flatMap((s: ConfigSection) =>
                        s.entries.map((e: ConfigEntry) => `${s.name}::${e.key}`),
                      ),
                    );
                    const extras = overrides.filter((o) => !fileKeys.has(`${o.section_name}::${o.config_key}`));
                    if (extras.length === 0) return null;
                    return (
                      <PageSurface className="space-y-0 p-0 overflow-hidden">
                        <div className="px-4 py-2 bg-muted/40 border-b border-border/60">
                          <span className="font-mono text-sm font-semibold text-foreground/80">
                            {t('configManagement.extraOverrides')}
                          </span>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/40">
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/5">{t('configManagement.section')}</th>
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/5">{t('configManagement.key')}</th>
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground">{t('configManagement.overrideValue')}</th>
                              <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/6">{t('configManagement.status')}</th>
                              <th className="px-4 py-2 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {extras.map((o) => (
                              <tr key={o.id} className="border-b border-border/20 hover:bg-muted/20">
                                <td className="px-4 py-2 font-mono text-xs">{o.section_name}</td>
                                <td className="px-4 py-2 font-mono text-xs">{o.config_key}</td>
                                <td className="px-4 py-2 font-mono text-xs">{o.config_value}</td>
                                <td className="px-4 py-2">
                                  <Badge variant={o.is_active ? 'default' : 'secondary'} className="text-xs">
                                    {o.is_active ? t('configManagement.overridden') : t('configManagement.inactive')}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => openEdit(o.section_name, { key: o.config_key, file_value: '' }, o)}
                                    aria-label={t('common.edit')}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => setDeleteTarget(o)}
                                    aria-label={t('common.delete')}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </PageSurface>
                    );
                  })()}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Edit / Add Override Dialog */}
      {editState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-background p-6 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold">
              {editState.overrideId != null ? t('configManagement.editOverride') : t('configManagement.addOverride')}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('configManagement.section')}</Label>
                  <Input value={editState.sectionName} readOnly className="font-mono text-xs bg-muted" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('configManagement.key')} *</Label>
                  <Input
                    value={editState.key}
                    readOnly={editState.overrideId != null}
                    onChange={(e) => setEditState({ ...editState, key: e.target.value })}
                    className="font-mono text-xs"
                    placeholder="config_key"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('configManagement.overrideValue')} *</Label>
                  <Input
                    value={editState.value}
                    onChange={(e) => setEditState({ ...editState, value: e.target.value })}
                    className="font-mono text-xs"
                  />
                  {editState.sectionName === RULE_SYNC_SECTION &&
                    activeFile === RULE_SYNC_CONFIG_FILE &&
                    editState.key === 'site_id' && (
                      <p
                        data-testid="rule-sync-site-id-hint"
                        className="text-xs text-amber-600 dark:text-amber-400"
                      >
                        {t('ruleSync.siteIdHint')}
                      </p>
                    )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('configManagement.valueType')}</Label>
                  <Select
                    value={editState.valueType}
                    onValueChange={(v) => setEditState({ ...editState, valueType: v as ValueType })}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">string</SelectItem>
                      <SelectItem value="int">int</SelectItem>
                      <SelectItem value="float">float</SelectItem>
                      <SelectItem value="bool">bool</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('configManagement.noteLabel')}</Label>
                <Input
                  value={editState.description}
                  onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="override-active"
                  checked={editState.isActive}
                  onCheckedChange={(v) => setEditState({ ...editState, isActive: v })}
                />
                <Label htmlFor="override-active" className="text-xs">{t('common.enabled')}</Label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditState(null)}>
                <X className="mr-1 h-3 w-3" />
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('configManagement.deleteOverride')}
        description={t('common.confirmDelete')}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        variant="destructive"
      />

      <ConfirmDialog
        open={!!replicaSwitchConfirm}
        onOpenChange={(open) => !open && setReplicaSwitchConfirm(null)}
        title={t('ruleSync.switchConfirm.title')}
        description={t('ruleSync.switchConfirm.description', {
          count: replicaSwitchConfirm?.globalRuleCount ?? 0,
        })}
        confirmText={t('ruleSync.switchConfirm.confirmText')}
        cancelText={t('ruleSync.switchConfirm.cancelText')}
        onConfirm={confirmReplicaSwitch}
        variant="destructive"
      />
    </PageShell>
  );
}
