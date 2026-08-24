'use client';

import { useTranslations } from 'next-intl';
import { History, Sparkles, Server } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useApiRequest } from '@/lib/api/client';
import { getAgentState, putAgentState, getModelInfo } from '@/lib/api/threat-retro';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { useThreatRetroAccess } from './access';

export function TopBar() {
  const t = useTranslations('threatRetro');
  const apiErrorMessage = useApiErrorMessage();
  const { apiRequest } = useApiRequest();
  const { canEdit } = useThreatRetroAccess();
  const qc = useQueryClient();

  const stateQuery = useQuery({
    queryKey: ['tr-agent-state'],
    queryFn: () => getAgentState(apiRequest),
  });
  const modelQuery = useQuery({
    queryKey: ['tr-model-info'],
    queryFn: () => getModelInfo(apiRequest),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      putAgentState(
        {
          ...(stateQuery.data ?? { default_max_tool_calls: 20, default_max_url_fetches: 10 }),
          enabled,
        },
        apiRequest,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tr-agent-state'] });
      toast.success(t('toast.stateSaved'));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t('toast.stateError'))),
  });

  const enabled = stateQuery.data?.enabled ?? false;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
            <History className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{t('agentName')}</h2>
          <Badge
            variant="outline"
            className="ml-1 gap-1 border-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-950/40"
          >
            <Sparkles className="h-3 w-3" /> {t('asyncTag')}
          </Badge>
          <Badge
            variant="outline"
            data-testid="threat-retro-status-badge"
            className={cn(
              'ml-1',
              enabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {enabled ? t('status.running') : t('status.paused')}
          </Badge>
        </div>
        <p className="ml-1 mt-1 text-sm text-muted-foreground">{t('description')}</p>
        {modelQuery.data && (
          <div className="ml-1 mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Server className="h-3 w-3" />
            <span>{t('model.label')}:</span>
            <code className="rounded bg-muted px-1.5 py-0.5">{modelQuery.data.model}</code>
            <span className="text-muted-foreground/70">@ {modelQuery.data.api_url}</span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('toggle.label')}</span>
          <Switch
            checked={enabled}
            disabled={!canEdit || toggle.isPending}
            onCheckedChange={(c) => toggle.mutate(c)}
          />
        </div>
      </div>
    </div>
  );
}
