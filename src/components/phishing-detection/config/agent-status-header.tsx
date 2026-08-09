'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApiRequest, ApiError } from '@/lib/api/client';
import { getEngineConfig, putEngineConfig, listAdmissionRules } from '@/lib/api/phishing-config';
import { getDisposalSettings } from '@/lib/api/disposal-settings';

function isValidationError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  return err.message || null;
}

// Top-of-page module switch + plain-language policy summary. Replaces the
// old per-section "agentStatus" block — enable/disable is a page-level
// concern (it gates whether admission rules and runtime mode do anything at
// all), so it now lives once, above both sections.
export function AgentStatusHeader() {
  const t = useTranslations('phishingConfig.status');
  const tRuntime = useTranslations('phishingConfig.runtime');
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  const [confirmValue, setConfirmValue] = useState<boolean | null>(null);

  const engineQuery = useQuery({
    queryKey: ['phish-engine-config'],
    queryFn: () => getEngineConfig(apiRequest),
  });
  const rulesQuery = useQuery({
    queryKey: ['phish-admission-rules'],
    queryFn: () => listAdmissionRules(apiRequest),
  });
  const disposalQuery = useQuery({
    queryKey: ['disposal-settings'],
    queryFn: () => getDisposalSettings(apiRequest),
  });

  const engine = engineQuery.data?.engine ?? null;
  const enabledRuleCount = (rulesQuery.data ?? []).filter((r) => r.enabled).length;

  const toggleMutation = useMutation({
    mutationFn: (nextEnabled: boolean) => {
      if (!engine) throw new Error('engine not loaded');
      return putEngineConfig({ ...engine, enabled: nextEnabled }, apiRequest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phish-engine-config'] });
    },
    onError: (err) => toast.error(isValidationError(err) ?? t('toggleFailed')),
  });

  const requestToggle = (next: boolean) => setConfirmValue(next);

  const confirmToggle = () => {
    if (confirmValue !== null) toggleMutation.mutate(confirmValue);
    setConfirmValue(null);
  };

  // Confirming to *enable* while there are zero active scope rules gets a
  // softer secondary action ("continue enabling") instead of the normal
  // confirm button, since it is a no-op state worth flagging but not
  // blocking.
  const enablingWithNoScope = confirmValue === true && enabledRuleCount === 0;

  const summaryText = useMemo(() => {
    if (!engine) return t('summary.loading');
    if (!engine.enabled) return t('summary.disabled');
    if (enabledRuleCount === 0) return t('summary.noScope');

    if (engine.run_mode === 'observe') {
      const action = tRuntime(`observeActionValue.${engine.observe_action}` as 'deliver');
      return t('summary.observe', { count: enabledRuleCount, action });
    }

    const disposal = disposalQuery.data ?? null;
    const timeout = disposal
      ? t('summary.timeoutPart', {
          minutes: disposal.review.custom_minutes,
          temp: tRuntime(`timeoutTempValue.${disposal.review.timeout_temp_disposal || 'deliver'}` as 'deliver'),
          recheck: disposal.review.max_recheck_minutes,
        })
      : '';
    return t('summary.realtime', { count: enabledRuleCount, timeout });
  }, [engine, enabledRuleCount, disposalQuery.data, t, tRuntime]);

  return (
    <Card data-testid="agent-status-header">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription data-testid="agent-status-summary">
            {engineQuery.isError ? t('loadFailed') : summaryText}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={engine?.enabled ? 'default' : 'secondary'}
            data-testid="agent-status-badge"
          >
            {engine?.enabled ? t('enabledLabel') : t('disabledLabel')}
          </Badge>
          <Switch
            checked={!!engine?.enabled}
            disabled={!engine}
            onCheckedChange={requestToggle}
            data-testid="agent-status-switch"
          />
        </div>
      </CardHeader>

      <AlertDialog
        open={confirmValue !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmValue(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmValue ? t('enableConfirmTitle') : t('disableConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmValue
                ? enablingWithNoScope
                  ? t('enableNoScopeConfirmDescription')
                  : t('enableConfirmDescription')
                : t('disableConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggle} data-testid="agent-status-confirm">
              {enablingWithNoScope ? t('continueEnable') : t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
