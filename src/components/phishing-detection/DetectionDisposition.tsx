'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { actionToVariant, recipientActionLabelKey } from '@/lib/email-log-action';
import type { DetectionLogItem } from '@/types/phishing-detection';

export function DetectionDisposition({ item, testId }: { item: DetectionLogItem; testId?: string }) {
  const t = useTranslations('phishingDetection');
  const td = useTranslations('emailDisposal');
  // Policy is a frozen recommendation, not proof of execution (outbound
  // quarantine downgrades to audit; observe mode can simply deliver).
  const rawActions = item.recipient_dispositions?.length
    ? item.recipient_dispositions.map((recipient) => recipient.final_action)
    : item.disposition_actions ?? [];
  const actions = [...new Set(rawActions.map((raw) => {
    const action = raw?.trim().toLowerCase();
    if (action === 'inbound_audit' || action === 'outbound_audit') return 'audit';
    if (action === 'deliver') return 'accept';
    return action || 'unknown';
  }))].sort();
  if (!actions.length) actions.push('unknown');

  return <div className="space-y-1">
    <div className="flex flex-wrap gap-1" data-testid={testId}>
      {actions.map((action) => {
        const key = recipientActionLabelKey(action);
        return <Badge key={action} variant={actionToVariant(action)} className={key === 'recipientStatusBar.other' ? 'border-border bg-muted/40 text-muted-foreground' : undefined}>
          {key === 'recipientStatusBar.other' ? t('disposition.unknown') : td(key)}
        </Badge>;
      })}
    </div>
    <p className="text-xs text-muted-foreground">{t('policyAction', { action: t(`policyDisposition.${item.policy_disposition ?? 'undecided'}`) })}</p>
  </div>;
}
