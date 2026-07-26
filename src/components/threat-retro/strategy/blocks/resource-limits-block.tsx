'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { SectionTitle } from './basic-info-block';
import type { ThreatRetroStrategy, ThreatRetroAgentState } from '@/types/threat-retro';

interface Props {
  draft: ThreatRetroStrategy;
  patch: (p: Partial<ThreatRetroStrategy>) => void;
  isAdmin: boolean;
  agentState?: ThreatRetroAgentState;
  errors: { maxToolCalls?: string; maxUrlFetches?: string };
}

export function ResourceLimitsBlock({ draft, patch, isAdmin, agentState, errors }: Props) {
  const t = useTranslations('threatRetroStrategy.resourceLimits');
  return (
    <section className="space-y-4">
      <SectionTitle index={3} title={t('title')} />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="max-tool-calls">{t('maxToolCalls')}</Label>
          <Input
            id="max-tool-calls"
            type="number"
            min={1}
            value={draft.resource_limits.max_tool_calls}
            disabled={!isAdmin}
            onChange={(e) =>
              patch({
                resource_limits: {
                  ...draft.resource_limits,
                  max_tool_calls: Number(e.target.value) || 0,
                },
              })
            }
            className={cn(errors.maxToolCalls && 'border-destructive')}
          />
          {errors.maxToolCalls ? (
            <p className="text-xs text-destructive">{t('maxToolCallsInvalid')}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max-url-fetches">{t('maxUrlFetches')}</Label>
          <Input
            id="max-url-fetches"
            type="number"
			min={1}
			max={1000}
            value={draft.resource_limits.max_url_fetches}
            disabled={!isAdmin}
            onChange={(e) =>
              patch({
                resource_limits: {
                  ...draft.resource_limits,
                  max_url_fetches: Number(e.target.value) || 0,
                },
              })
            }
            className={cn(errors.maxUrlFetches && 'border-destructive')}
          />
          {errors.maxUrlFetches ? (
            <p className="text-xs text-destructive">{t('maxUrlFetchesInvalid')}</p>
          ) : null}
        </div>
      </div>

      {agentState ? (
        <p className="text-xs text-muted-foreground">
          {t('globalDefaults', {
            tool: agentState.default_max_tool_calls,
            url: agentState.default_max_url_fetches,
          })}
        </p>
      ) : null}
      {!isAdmin ? <p className="text-xs text-muted-foreground">{t('readOnly')}</p> : null}
    </section>
  );
}
