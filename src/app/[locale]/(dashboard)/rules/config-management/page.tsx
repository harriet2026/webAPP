'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { LoadingPanel } from '@/components/shared/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiRequest } from '@/lib/api/client';
import {
  getPlatformConfig,
  listConfigSchemas,
  patchPlatformConfig,
  acceptScopedConfigMutation,
  type ConfigNamespaceSchema,
  type ConfigSchemaKey,
} from '@/lib/api/scoped-configs';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

// Kept as an exported compatibility guard for callers that still render a
// dedicated rule-sync transition confirmation. rule_sync is system/cluster
// configuration now and is intentionally not editable on this page.
export function isSwitchingToReplica(sectionName: string, key: string, value: string, activeFile: string): boolean {
  return activeFile === 'apiserver.cf' && sectionName === 'rule_sync' && key === 'role' && value.trim().toLowerCase() === 'replica';
}

interface EditState {
  key: ConfigSchemaKey;
  value: string;
}

const EMPTY_SCHEMAS: ConfigNamespaceSchema[] = [];

function valueAtPath(document: Record<string, unknown> | undefined, path: string): unknown {
  let current: unknown = document;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseValue(key: ConfigSchemaKey, raw: string): unknown {
  switch (key.type) {
    case 'bool':
      if (raw !== 'true' && raw !== 'false') throw new Error('bool value must be true or false');
      return raw === 'true';
    case 'int': {
      if (!/^-?\d+$/.test(raw.trim())) throw new Error('integer value is required');
      return Number.parseInt(raw, 10);
    }
    case 'float': {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error('number value is required');
      return value;
    }
    case 'string_list': {
      const value = JSON.parse(raw);
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error('JSON string array is required');
      return value;
    }
    case 'object': {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object is required');
      return value;
    }
    case 'any':
      return JSON.parse(raw);
    default:
      return raw;
  }
}

export default function ConfigManagementPage() {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const [activeNamespace, setActiveNamespace] = useState('');
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const schemasQuery = useQuery({
    queryKey: ['config-schemas'],
    queryFn: () => listConfigSchemas(apiRequest),
  });
  const schemas = schemasQuery.data ?? EMPTY_SCHEMAS;

  useEffect(() => {
    if (!activeNamespace && schemas.length > 0) setActiveNamespace(schemas[0].namespace);
  }, [activeNamespace, schemas]);

  const configQuery = useQuery({
    queryKey: ['platform-config', activeNamespace],
    queryFn: () => getPlatformConfig(activeNamespace, apiRequest),
    enabled: activeNamespace !== '',
  });

  const activeSchema = schemas.find((schema) => schema.namespace === activeNamespace);
  const effective = configQuery.data?.effective;

  const save = async () => {
    if (!editState || !activeSchema || !configQuery.data?.stored) return;
    setSaving(true);
    try {
      const value = parseValue(editState.key, editState.value);
      const operations = [{ op: 'set' as const, path: editState.key.path, value }];
      const result = await patchPlatformConfig(
        activeSchema.namespace,
        configQuery.data.stored.version,
        operations,
        apiRequest,
      );
      queryClient.setQueryData(
        ['platform-config', activeSchema.namespace],
        acceptScopedConfigMutation(configQuery.data, result, operations),
      );
      setEditState(null);
      toast.success(t('common.updateSuccess'));
    } catch (error) {
      toast.error(error instanceof Error ? apiErrorMessage(error) : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (schemasQuery.isLoading) return <LoadingPanel />;

  return (
    <PageShell data-testid="config-management-page">
      <PageHeader
        eyebrow={t('configManagement.eyebrow')}
        title={t('configManagement.title')}
        description={t('configManagement.description')}
      />

      {schemas.length === 0 ? (
        <PageSurface><p className="text-sm text-muted-foreground">{t('configManagement.noFiles')}</p></PageSurface>
      ) : (
        <Tabs value={activeNamespace} onValueChange={(value) => { setActiveNamespace(value); setEditState(null); }}>
          <TabsList className="mb-4 h-auto flex-wrap gap-1">
            {schemas.map((schema: ConfigNamespaceSchema) => (
              <TabsTrigger key={schema.namespace} value={schema.namespace} className="font-mono text-xs">
                {schema.namespace}
              </TabsTrigger>
            ))}
          </TabsList>

          {configQuery.isLoading || !activeSchema || !effective ? <LoadingPanel /> : (
            <PageSurface className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{activeSchema.namespace}</p>
                  <p className="text-xs text-muted-foreground">schema v{activeSchema.schema_version} · config v{configQuery.data?.stored?.version ?? 0}</p>
                </div>
                <Badge variant={configQuery.data?.published ? 'default' : 'secondary'}>
                  {configQuery.data?.published ? 'published' : 'pending'}
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40">
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">{t('configManagement.key')}</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">scope</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">type</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">effective value</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">source</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSchema.keys.map((key) => {
                      const value = valueAtPath(effective.document, key.path);
                      const editable = key.scope !== 'system_only' && !key.secret;
                      return (
                        <tr
                          key={key.path}
                          data-testid={`config-row-${activeSchema.namespace}-${key.path}`}
                          className="border-b border-border/20 hover:bg-muted/20"
                        >
                          <td className="px-4 py-2 font-mono text-xs">{key.path}</td>
                          <td className="px-4 py-2"><Badge variant="outline" className="font-mono text-[10px]">{key.scope}</Badge></td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{key.type}</td>
                          <td className="max-w-md truncate px-4 py-2 font-mono text-xs" title={displayValue(value)}>
                            {key.secret ? '[REDACTED]' : displayValue(value) || '—'}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{effective.provenance[key.path] ?? '—'}</td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              data-testid={`config-edit-${activeSchema.namespace}-${key.path}`}
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={!editable}
                              onClick={() => setEditState({ key, value: displayValue(value) })}
                              aria-label={t('common.edit')}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PageSurface>
          )}
        </Tabs>
      )}

      {editState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div data-testid="config-edit-dialog" className="w-full max-w-lg rounded-2xl border border-border/70 bg-background p-6 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold">{t('common.edit')}</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('configManagement.key')}</Label>
                <Input value={editState.key.path} readOnly className="bg-muted font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">value ({editState.key.type})</Label>
                <Input
                  data-testid="config-edit-value"
                  value={editState.value}
                  onChange={(event) => setEditState({ ...editState, value: event.target.value })}
                  className="font-mono text-xs"
                />
                {(editState.key.type === 'object' || editState.key.type === 'string_list') && (
                  <p className="text-xs text-muted-foreground">JSON</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button data-testid="config-edit-cancel" variant="outline" size="sm" onClick={() => setEditState(null)}>
                <X className="mr-1 h-3 w-3" />{t('common.cancel')}
              </Button>
              <Button data-testid="config-edit-save" size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
