import type { ThreatRetroRun } from '@/types/threat-retro';

export function isRunDegraded(run: Pick<ThreatRetroRun, 'failed_target_count' | 'failed_child_count'>): boolean {
  return (run.failed_target_count ?? 0) > 0 || (run.failed_child_count ?? 0) > 0;
}
