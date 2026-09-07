import type { CheckStatus } from '@/types/email-disposal-detail';

const CHECK_STATUS_PRIORITY: readonly CheckStatus[] = [
  'threat',
  'suspicious',
  'processing',
  'pass',
  'skipped',
];

export function aggregateCheckStatus(
  checks: readonly { status: CheckStatus }[],
): CheckStatus {
  return CHECK_STATUS_PRIORITY.find((status) => (
    checks.some((check) => check.status === status)
  )) ?? 'skipped';
}
