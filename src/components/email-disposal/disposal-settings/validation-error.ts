/** Returns the first actionable message from a nested React Hook Form error tree. */
export function firstValidationMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  for (const [key, nested] of Object.entries(record)) {
    // RHF's ref can point at a DOM node and must not be traversed.
    if (key === 'ref' || key === 'type' || key === 'types') continue;
    const message = firstValidationMessage(nested);
    if (message) return message;
  }
  return undefined;
}
