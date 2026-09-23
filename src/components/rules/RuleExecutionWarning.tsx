'use client';

import { useTranslations } from 'next-intl';

/** The server decides whether the whole stored rule is executable. */
export function RuleExecutionWarning({ reason }: { reason?: string }) {
  const t = useTranslations('advancedRules');
  if (!reason) return null;
  return (
    <p role="status" className="text-xs text-destructive" title={reason} data-testid="rule-execution-warning">
      {t('retiredFieldExecutionBlocked')}
    </p>
  );
}
