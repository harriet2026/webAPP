import type { InvestigationType } from '@/types/investigation';

// genericAgentTypes are the agents served by the /investigations console.
// threat_traceback is intentionally excluded — it is threat-retro-only (spec §6.2).
export const genericAgentTypes: Array<{ value: InvestigationType; labelKey: string; descriptionKey: string }> = [
  { value: 'phish_analysis', labelKey: 'investigations.types.phish_analysis', descriptionKey: 'investigations.typeDescriptions.phish_analysis' },
  { value: 'account_anomaly_analysis', labelKey: 'investigations.types.account_anomaly_analysis', descriptionKey: 'investigations.typeDescriptions.account_anomaly_analysis' },
  { value: 'rule_analysis', labelKey: 'investigations.types.rule_analysis', descriptionKey: 'investigations.typeDescriptions.rule_analysis' },
];
