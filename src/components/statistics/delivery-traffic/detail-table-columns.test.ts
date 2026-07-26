import { describe, it, expect } from 'vitest';
import { COLUMNS_BY_DIRECTION } from './DetailTable';

// GT-11989: the 全部 (all) view rendered 6 columns while the prototype and the
// receive/send views had 8 — 延迟投递 (deferred) and 取消 (cancelled) were absent.
// `cancelled` was already returned by the backend for `all`; `deferred` was not
// computed for it at all (fixed in deliveryTrafficDetailAll).
describe('delivery-traffic detail table columns (GT-11989)', () => {
  const keysOf = (dir: keyof typeof COLUMNS_BY_DIRECTION) =>
    COLUMNS_BY_DIRECTION[dir].map((c) => c.key);

  it('全部 view exposes the delayed and cancelled delivery states', () => {
    expect(keysOf('all')).toContain('deferred');
    expect(keysOf('all')).toContain('cancelled');
  });

  it('全部 view has the 8 columns the prototype specifies, in order', () => {
    expect(keysOf('all')).toEqual([
      'date',
      'total',
      'success',
      'failure',
      'deferred',
      'cancelled',
      'success_rate',
      'change',
    ]);
  });

  it('every direction that can defer or cancel shows both states', () => {
    // internal delivery is local and cannot be deferred/cancelled upstream, so
    // it is deliberately excluded.
    for (const dir of ['all', 'receive', 'send'] as const) {
      expect(keysOf(dir), `${dir} must show deferred`).toContain('deferred');
      expect(keysOf(dir), `${dir} must show cancelled`).toContain('cancelled');
    }
  });
});
