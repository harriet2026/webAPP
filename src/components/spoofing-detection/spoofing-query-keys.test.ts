import { describe, expect, it } from 'vitest';
import { spoofingQueryKeys } from './spoofing-query-keys';

describe('spoofing query keys', () => {
  it('isolates every cache family by effective tenant', () => {
    const tenantA = [
      spoofingQueryKeys.engine(1),
      spoofingQueryKeys.stats(1, { start: 'a' }),
      spoofingQueryKeys.logs(1, { page: 1 }),
      spoofingQueryKeys.detail(1, 'log-1'),
      spoofingQueryKeys.persons(1, 'alice'),
      spoofingQueryKeys.brands(1, 'brand'),
      spoofingQueryKeys.whitelist(1),
      spoofingQueryKeys.routingScope(1),
      spoofingQueryKeys.importContacts(1, null, { page: 1 }),
      spoofingQueryKeys.importPersons(1, null),
    ];
    const tenantB = [
      spoofingQueryKeys.engine(2),
      spoofingQueryKeys.stats(2, { start: 'a' }),
      spoofingQueryKeys.logs(2, { page: 1 }),
      spoofingQueryKeys.detail(2, 'log-1'),
      spoofingQueryKeys.persons(2, 'alice'),
      spoofingQueryKeys.brands(2, 'brand'),
      spoofingQueryKeys.whitelist(2),
      spoofingQueryKeys.routingScope(2),
      spoofingQueryKeys.importContacts(2, null, { page: 1 }),
      spoofingQueryKeys.importPersons(2, null),
    ];

    tenantA.forEach((key, index) => expect(key).not.toEqual(tenantB[index]));
  });

  it('returns tenant-scoped cache-family prefixes for invalidation', () => {
    expect(spoofingQueryKeys.stats(7)).toEqual(['spoof-stats', 7]);
    expect(spoofingQueryKeys.logs(7)).toEqual(['spoof-logs', 7]);
    expect(spoofingQueryKeys.persons(7)).toEqual(['spoof-persons', 7]);
    expect(spoofingQueryKeys.brands(7)).toEqual(['spoof-brands', 7]);
  });
});
