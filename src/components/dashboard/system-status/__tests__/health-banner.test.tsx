import { describe, expect, it } from 'vitest';
import { resolveHealthLevel } from '../health-banner';

describe('resolveHealthLevel', () => {
  it('danger wins over warning, n counts only danger items', () => {
    const r = resolveHealthLevel([{ level: 'danger' }, { level: 'warning' }] as never);
    expect(r.level).toBe('danger');
    expect(r.n).toBe(1);
  });

  it('danger wins with multiple danger items, n counts all of them', () => {
    const r = resolveHealthLevel([{ level: 'danger' }, { level: 'danger' }, { level: 'warning' }] as never);
    expect(r.level).toBe('danger');
    expect(r.n).toBe(2);
  });

  it('warning when no danger', () => {
    const r = resolveHealthLevel([{ level: 'warning' }] as never);
    expect(r.level).toBe('warning');
    expect(r.n).toBe(1);
  });

  it('info-only alerts do not escalate past normal', () => {
    const r = resolveHealthLevel([{ level: 'info' }, { level: 'info' }] as never);
    expect(r.level).toBe('normal');
  });

  it('normal when empty', () => {
    const r = resolveHealthLevel([]);
    expect(r.level).toBe('normal');
    expect(r.n).toBe(0);
  });
});
