import contract from './generated/phish_policy';
import type { PhishRiskPolicy } from '@/types/phishing-config';

export const phishPolicyContract = contract;
export const phishRiskLevels = contract.risk_levels;
export const phishDispositions = contract.dispositions.map((definition) => definition.value);
export const phishMarkPositions = contract.mark.positions;

export interface RiskPolicyError {
  code: typeof contract.error_codes[number];
  field: string;
  risk_level?: string;
  previous_risk_level?: string;
  disposition?: string;
  previous_disposition?: string;
  limit?: number;
}

// Validate the same serialized policy sent to the server, without changing it.
export function validateRiskPolicy(policy: PhishRiskPolicy | null): RiskPolicyError | null {
  if (!policy) return { code: 'policy_missing', field: '' };
  const cutoffs = policy.cutoffs;
  if (!cutoffs || ![cutoffs.low, cutoffs.medium, cutoffs.high].every(Number.isInteger)
    || !(cutoffs.low >= contract.cutoffs.minimum && cutoffs.low < cutoffs.medium
      && cutoffs.medium < cutoffs.high && cutoffs.high <= contract.cutoffs.maximum)) {
    return { code: 'cutoffs_invalid', field: 'cutoffs' };
  }
  if (!policy.policies || Object.keys(policy.policies).length !== contract.risk_levels.length) {
    return { code: 'levels_invalid', field: 'policies' };
  }
  let previousSeverity = -1;
  for (const [index, risk] of contract.risk_levels.entries()) {
    const band = policy.policies[risk];
    const field = `policies.${risk}`;
    const fail = (code: RiskPolicyError['code'], property: string, extra = {}): RiskPolicyError => ({ code, field: `${field}.${property}`, risk_level: risk, ...extra });
    if (!band) return { code: 'levels_invalid', field, risk_level: risk };
    const severity = contract.dispositions.find((definition) => definition.value === band.base_disposition)?.severity;
    if (severity === undefined) return fail('disposition_invalid', 'base_disposition', { disposition: band.base_disposition });
    if (severity < previousSeverity) {
      const previous = contract.risk_levels[index - 1];
      return fail('disposition_order_conflict', 'base_disposition', {
        previous_risk_level: previous, disposition: band.base_disposition,
        previous_disposition: policy.policies[previous].base_disposition,
      });
    }
    previousSeverity = severity;
    const positions = band.mark_positions ?? [];
    const text = band.mark_text ?? '';
    const hasMark = positions.length > 0 || text !== '';
    if (band.base_disposition !== contract.mark.disposition) {
      if (hasMark) return fail('mark_not_allowed', 'mark_positions');
      continue;
    }
    if (!hasMark) continue;
    if (positions.length === 0) return fail('mark_positions_required', 'mark_positions');
    if (positions.some((position) => !(contract.mark.positions as readonly string[]).includes(position))) return fail('mark_position_invalid', 'mark_positions');
    if (text === '') return fail('mark_text_required', 'mark_text');
    if (Array.from(text).length > contract.mark.max_text_length) return fail('mark_text_too_long', 'mark_text', { limit: contract.mark.max_text_length });
  }
  return null;
}
