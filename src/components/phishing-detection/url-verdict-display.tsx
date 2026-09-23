'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { urlFindingState, urlVerdictClass } from '@/lib/url-verdict';
import type { UrlFinding } from '@/types/phishing-detection';

export function UrlVerdictDisplay({ finding }: { finding: UrlFinding }) {
  const t = useTranslations('phishingDetection');
  const state = urlFindingState(finding);
  const label = state.status === 'valid' ? state.verdict! : state.status;
  const raw = `${finding.agent?.verdict || '∅'} / ${finding.agent?.risk_level || '∅'}`;
  const reason = state.code && t.has(`urlValidation.reasons.${state.code}`) ? t(`urlValidation.reasons.${state.code}`) : state.code;
  return <div className="space-y-1">
    <Badge variant="outline" data-testid="url-verdict" className={urlVerdictClass[label]}>{t(`urlValidation.labels.${label}`)}</Badge>
    {state.status === 'invalid' && reason ? <p className="text-xs text-muted-foreground">{reason}</p> : null}
    {state.status !== 'valid' ? <p className="break-all text-xs text-muted-foreground">{t('urlValidation.raw', { value: raw })}</p> : null}
  </div>;
}
