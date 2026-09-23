import contract from './generated/url-verdict.json';
import type { UrlFinding } from '@/types/phishing-detection';

export const urlVerdictDefinitions = contract.definitions;

// The browser consumes the generated contract, never the mail verdict aliases.
export function urlFindingState(finding: UrlFinding): { status: 'valid' | 'invalid' | 'unvalidated'; verdict?: string; code?: string } {
  const validation = finding.validation;
  if (!validation || !validation.status || validation.status === 'unvalidated' || validation.contract_version !== contract.version) {
    return { status: 'unvalidated' };
  }
  if (validation.status !== 'valid' || validation.code) return { status: 'invalid', code: validation.code };
  const verdict = finding.agent?.verdict;
  const definition = contract.definitions.find((entry) => entry.value === verdict);
  if (!definition) return { status: 'invalid', code: verdict ? 'verdict_unknown' : 'verdict_missing' };
  const risk = finding.agent?.risk_level;
  if (!risk) return { status: 'invalid', code: 'risk_missing' };
  if (!contract.definitions.some((entry) => entry.risks.includes(risk))) return { status: 'invalid', code: 'risk_unknown' };
  if (!definition.risks.includes(risk)) return { status: 'invalid', code: 'verdict_risk_conflict' };
  return { status: 'valid', verdict };
}

export const urlVerdictClass: Record<string, string> = {
  phishing: 'text-destructive',
  malicious: 'text-destructive',
  suspicious: 'text-warning-foreground dark:text-warning',
  safe: 'text-success-foreground dark:text-success',
  needs_review: 'text-muted-foreground',
  invalid: 'text-warning-foreground dark:text-warning',
  unvalidated: 'text-muted-foreground',
};
