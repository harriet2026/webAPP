'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useApiRequest, ApiError } from '@/lib/api/client';
import { getEngineConfig, putEngineConfig } from '@/lib/api/phishing-config';
import { getDisposalSettings, putDisposalSettings } from '@/lib/api/disposal-settings';
import type { PhishTenantEngineParams } from '@/types/phishing-config';
import type { DisposalSettings } from '@/types/disposal-settings';

type PresetKey = 'observe' | 'standard' | 'strict';
const PRESETS: PresetKey[] = ['observe', 'standard', 'strict'];

function isValidationError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  return err.message || null;
}

// Step 1 of the compressed admin flow ("防护方案选择"): applying a preset
// immediately persists sane defaults for run mode + timeout disposition, so
// the operator can jump straight to reviewing/adjusting detection scope
// instead of hand-assembling every runtime knob first. It writes through the
// same engine-config / disposal-settings endpoints the advanced editors use,
// so anything picked here remains fully editable afterwards — this is a
// starting point, not a locked mode.
export function PresetSelection() {
  const t = useTranslations('phishingConfig.preset');
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  const engineQuery = useQuery({
    queryKey: ['phish-engine-config'],
    queryFn: () => getEngineConfig(apiRequest),
  });
  const disposalQuery = useQuery({
    queryKey: ['disposal-settings'],
    queryFn: () => getDisposalSettings(apiRequest),
  });

  const applyMutation = useMutation({
    mutationFn: async (preset: PresetKey) => {
      const engine = engineQuery.data?.engine;
      const disposal = disposalQuery.data;
      if (!engine || !disposal) throw new Error('config not loaded');

      const nextEngine: PhishTenantEngineParams =
        preset === 'observe'
          ? { ...engine, enabled: true, run_mode: 'observe', observe_action: 'mark' }
          : { ...engine, enabled: true, run_mode: 'realtime', observe_action: 'deliver' };

      const nextDisposal: DisposalSettings = {
        ...disposal,
        review: {
          ...disposal.review,
          timeout_auto_deliver: preset === 'standard',
          timeout_temp_disposal: preset === 'strict' ? 'mark' : 'deliver',
        },
      };

      await putEngineConfig(nextEngine, apiRequest);
      await putDisposalSettings(nextDisposal, apiRequest);
    },
    onSuccess: (_data, preset) => {
      toast.success(t('applied', { name: t(`${preset}.title`) }));
      queryClient.invalidateQueries({ queryKey: ['phish-engine-config'] });
      queryClient.invalidateQueries({ queryKey: ['disposal-settings'] });
    },
    onError: (err) => toast.error(isValidationError(err) ?? t('applyFailed')),
  });

  const loaded = !!engineQuery.data && !!disposalQuery.data;

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4" data-testid="preset-selection">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">{t('title')}</h3>
        <p className="text-xs text-muted-foreground">{t('description')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {PRESETS.map((preset) => (
          <button
              key={preset}
              type="button"
              disabled={!loaded || applyMutation.isPending}
              className="rounded-lg border p-4 text-left transition-colors hover:bg-accent/40 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={() => applyMutation.mutate(preset)}
              data-testid={`phishing-preset-${preset}`}
            >
              <div className="font-medium">{t(`${preset}.title`)}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(`${preset}.description`)}
              </p>
            </button>
        ))}
      </div>
    </section>
  );
}
