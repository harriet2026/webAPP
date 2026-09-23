'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type PhishingVerdict = 'phishing_suspected' | 'suspicious' | 'safe' | 'needs_review';
type VerdictDisplay = {
  value: PhishingVerdict | null;
  state: 'standard' | 'legacy' | 'missing' | 'unmapped' | 'observed' | 'invalid';
  raw: string;
};

// Display compatibility only: never mutate API data or infer a verdict from
// risk, confidence, a policy action, or an empty tool result.
export function resolvePhishingVerdict(raw?: string | null): VerdictDisplay {
  const original = raw ?? '';
  switch (original) {
    case 'phishing_suspected':
    case 'suspicious':
    case 'safe':
    case 'needs_review':
      return { value: original, state: 'standard', raw: original };
    case 'phishing':
      return { value: 'phishing_suspected', state: 'legacy', raw: original };
    case 'benign':
    case 'normal':
      return { value: 'safe', state: 'legacy', raw: original };
    case 'malicious':
      return { value: null, state: 'unmapped', raw: original };
    case 'observed':
      return { value: null, state: 'observed', raw: original };
    default:
      return { value: null, state: original.trim() ? 'invalid' : 'missing', raw: original };
  }
}

const verdictColors: Record<PhishingVerdict, string> = {
  phishing_suspected: 'border-destructive/30 bg-destructive/10 text-destructive',
  suspicious: 'border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning',
  safe: 'border-success/30 bg-success/10 text-success-foreground dark:text-success',
  needs_review: 'border-border bg-muted/50 text-foreground',
};

export function VerdictDisplay({ verdict }: { verdict?: string | null }) {
  const t = useTranslations('phishingDetection.verdict');
  const display = resolvePhishingVerdict(verdict);
  const showOriginal = display.state !== 'standard' && display.state !== 'missing';
  return <div className="min-w-0 space-y-1" data-testid="phishing-verdict-display" data-verdict-state={display.state}>
    <Badge variant="outline" className={cn('h-auto max-w-full whitespace-normal', display.value ? verdictColors[display.value] : 'border-border bg-muted/30 text-muted-foreground')}>
      {display.value ? t(`values.${display.value}`) : t(`states.${display.state}`)}
    </Badge>
    {display.state === 'legacy' ? <p className="text-xs text-muted-foreground">{t('legacyConverted')}</p> : null}
    {display.value === 'safe' ? <p className="text-xs text-muted-foreground">{t('safeScope')}</p> : null}
    {showOriginal ? <details className="text-xs">
      <summary className="cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">{t('rawValue')}</summary>
      <p className="whitespace-pre-wrap break-words pt-1 [overflow-wrap:anywhere]">{display.raw}</p>
    </details> : null}
  </div>;
}
