export function isBehaviorControlRuleExpired(
  validUntil?: string | null,
  now = new Date(),
): boolean {
  if (!validUntil) return false;
  const expiry = new Date(validUntil);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() <= now.getTime();
}
