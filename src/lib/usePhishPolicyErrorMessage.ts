'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api/client';
import { phishPolicyContract } from './phish_policy';

// Domain errors carry raw enums. Translate them here, at the product Adapter,
// before rendering the shared API error template in the selected locale.
export function usePhishPolicyErrorMessage() {
  const t = useTranslations();
  return useCallback((error: unknown): string | null => {
    if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') return null;
    const prefix = 'phishing_agent.risk_policy.';
    const code = error instanceof ApiError ? error.code?.slice(prefix.length) : error.code;
    if (error instanceof ApiError && !error.code?.startsWith(prefix)) return null;
    if (!(phishPolicyContract.error_codes as readonly string[]).includes(code ?? '')) return null;
    const raw = error instanceof ApiError ? error.params ?? {} : error as unknown as Record<string, unknown>;
    const values: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string' || typeof value === 'number') values[key] = value;
    }
    for (const key of ['risk_level', 'previous_risk_level']) {
      if ((phishPolicyContract.risk_levels as readonly unknown[]).includes(raw[key])) values[key] = t(`phishingConfig.runtime.riskLevel.${raw[key]}`);
    }
    for (const key of ['disposition', 'previous_disposition']) {
      if (phishPolicyContract.dispositions.some((definition) => definition.value === raw[key])) values[key] = t(`phishingConfig.runtime.disposition.${raw[key]}`);
    }
    return t(`apiErrors.${prefix}${code}`, values);
  }, [t]);
}
