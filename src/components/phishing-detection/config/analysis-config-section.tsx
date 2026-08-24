'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useApiRequest } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { getPhishingAnalysisConfig, putPhishingAnalysisConfig } from '@/lib/api/phishing-analysis-config';
import { phishingQueryKeys } from '../phishing-query-keys';
import type { PhishAnalysisConfig } from '@/types/phishing-config';

const FIELDS = ['netdisk_domain', 'netdisk_extract', 'netdisk_spoof'] as const;

// These versioned fields already exist in the server contract, but the actual
// net-disk analysis pipeline is a later-phase plan. Keep that status visible in
// the UI and do not present the switches as proof that the capability is live.

export function updateAnalysisConfig(
  current: PhishAnalysisConfig,
  field: typeof FIELDS[number],
  checked: boolean,
): PhishAnalysisConfig {
  // 后期规划：网盘识别链路接通前，仍保持服务端契约要求的依赖关系，
  // 避免占位 UI 构造 netdisk_extract=true / netdisk_domain=false。
  return field === 'netdisk_domain' && !checked
    ? { ...current, netdisk_domain: false, netdisk_extract: false }
    : { ...current, [field]: checked };
}

export function AnalysisConfigSection({ readOnly = false }: { readOnly?: boolean }) {
  const t = useTranslations('phishingConfig.analysis');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: phishingQueryKeys.analysisConfig(effectiveTenantId),
    queryFn: () => getPhishingAnalysisConfig(apiRequest),
  });
  const [draft, setDraft] = useState<PhishAnalysisConfig | null>(null);
  const mutation = useMutation({
    mutationFn: (value: PhishAnalysisConfig) => putPhishingAnalysisConfig({
      netdisk_domain: value.netdisk_domain,
      netdisk_extract: value.netdisk_extract,
      netdisk_spoof: value.netdisk_spoof,
      expected_version: value.version,
    }, apiRequest),
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: phishingQueryKeys.analysisConfig(effectiveTenantId) });
      toast.success(t('saved'));
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, t('saveFailed')));
      setDraft(null);
    },
  });
  const update = (field: typeof FIELDS[number], checked: boolean) => {
    const current = draft ?? query.data;
    if (!current || readOnly) return;
    const next = updateAnalysisConfig(current, field, checked);
    setDraft(next);
    mutation.mutate(next);
  };
  const displayed = draft ?? query.data;
  return (
    <Card className="rounded-xl border-border shadow-sm" data-testid="analysis-config-section">
      <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-primary" />{t('title')}<Badge variant="secondary">{t('planned')}</Badge></CardTitle><CardDescription>{t('description')}</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {query.isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : query.isError || !displayed ? <p className="text-sm text-destructive">{query.isError ? apiErrorMessage(query.error, t('loadFailed')) : t('loadFailed')}</p> : FIELDS.map((field) => (
          <div key={field} className="flex items-start justify-between gap-3 rounded-lg border border-border p-4">
            <div><p className="text-sm font-medium">{t(`${field}.title`)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t(`${field}.description`)}</p></div>
            <Switch checked={displayed[field]} disabled={readOnly || mutation.isPending || (field === 'netdisk_extract' && !displayed.netdisk_domain)} onCheckedChange={(checked) => update(field, checked)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
