export type DisplayStatus = 'pending' | 'active' | 'suspended' | 'expired';

export function displayStatus(t: { status: string; expired: boolean }): DisplayStatus {
  if (t.expired) return 'expired';
  return t.status as DisplayStatus;
}
