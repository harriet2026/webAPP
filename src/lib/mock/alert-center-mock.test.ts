import { describe, expect, it } from 'vitest';
import { dispatch, isMockable } from '@/lib/mock/dispatcher';
import type { AlertEvent, AlertStats } from '@/types/alerts';

describe('alert-center mock contract', () => {
  it('covers list, stats, detail, lifecycle, rules and SMTP routes', () => {
    const routes: Array<[string, string]> = [
      ['GET', '/monitor/alerts'],
      ['GET', '/monitor/alerts/stats'],
      ['GET', '/monitor/alerts/1'],
      ['PUT', '/monitor/alerts/1/confirm'],
      ['PUT', '/monitor/alerts/1/process'],
      ['PUT', '/monitor/alerts/1/resolve'],
      ['POST', '/monitor/alerts/batch'],
      ['GET', '/monitor/alert-rules'],
      ['POST', '/monitor/alert-rules'],
      ['PUT', '/monitor/alert-rules/101'],
      ['DELETE', '/monitor/alert-rules/101'],
      ['GET', '/monitor/alert-rules/templates'],
      ['GET', '/monitor/alert-rules/metrics'],
      ['GET', '/monitor/alert-smtp-config'],
      ['PUT', '/monitor/alert-smtp-config'],
      ['POST', '/monitor/alert-smtp-config/test'],
    ];
    for (const [method, path] of routes) {
      expect(isMockable(method, path), `${method} ${path}`).toBe(true);
    }
  });

  it('returns a detail object and a real 404 for a missing id', () => {
    const found = dispatch({ method: 'GET', path: '/monitor/alerts/1' });
    expect(found.status).toBe(200);
    expect((found.data as AlertEvent).message).toContain('数据目录');

    const missing = dispatch({ method: 'GET', path: '/monitor/alerts/999999' });
    expect(missing.status).toBe(404);
  });

  it('enforces lifecycle preconditions and keeps stat buckets coherent', () => {
    const before = dispatch({ method: 'GET', path: '/monitor/alerts/stats' }).data as AlertStats;
    expect(dispatch({ method: 'PUT', path: '/monitor/alerts/1/confirm' }).status).toBe(204);
    expect(dispatch({ method: 'PUT', path: '/monitor/alerts/1/confirm' }).status).toBe(409);

    const afterConfirm = dispatch({ method: 'GET', path: '/monitor/alerts/stats' }).data as AlertStats;
    expect(afterConfirm.unconfirmed).toBe(before.unconfirmed - 1);
    expect(afterConfirm.processing).toBe(before.processing + 1);

    expect(dispatch({ method: 'PUT', path: '/monitor/alerts/1/process' }).status).toBe(204);
    expect(dispatch({ method: 'PUT', path: '/monitor/alerts/1/resolve' }).status).toBe(204);
    const afterResolve = dispatch({ method: 'GET', path: '/monitor/alerts/stats' }).data as AlertStats;
    expect(afterResolve.processing).toBe(before.processing);
    expect(afterResolve.resolved).toBe(before.resolved + 1);
    expect(afterResolve.critical).toBe(before.critical - 1);
  });
});
