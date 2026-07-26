import { describe, it, expect } from 'vitest';
import { dispatch, isMockable } from '@/lib/mock/dispatcher';
import type { RecipientLimitConfig, RecipientCheckConfig } from '@/types/behavior-control';

describe('recipient-check mock', () => {
  it('recipient-limit-config GET/PUT/DELETE 均被 mock 覆盖', () => {
    expect(isMockable('GET', '/behavior-control/recipient-limit-config')).toBe(true);
    expect(isMockable('PUT', '/behavior-control/recipient-limit-config')).toBe(true);
    expect(isMockable('DELETE', '/behavior-control/recipient-limit-config')).toBe(true);
  });

  it('recipient-check-config GET/PUT/DELETE 均被 mock 覆盖', () => {
    expect(isMockable('GET', '/behavior-control/recipient-check-config')).toBe(true);
    expect(isMockable('PUT', '/behavior-control/recipient-check-config')).toBe(true);
    expect(isMockable('DELETE', '/behavior-control/recipient-check-config')).toBe(true);
  });

  it('recipient-limit-config 默认值照抄 demo（30/50/20，阻断/审核/隔离，detailed 开启）', () => {
    const res = dispatch({ method: 'GET', path: '/behavior-control/recipient-limit-config' });
    const cfg = res.data as RecipientLimitConfig;
    expect(cfg.mode).toBe('detailed');
    expect(cfg.is_active).toBe(true);
    expect(cfg.inbound_limit).toEqual({ limit: 30, scope: 'local', action: 'reject' });
    expect(cfg.outbound_limit).toEqual({ limit: 50, scope: 'all', action: 'audit' });
    expect(cfg.internal_limit).toEqual({ limit: 20, scope: 'local', action: 'quarantine' });
    expect(cfg.merged_limit).toEqual({ limit: 50, action: 'audit' });
  });

  it('recipient-check-config 默认：模块开、存在性开、失败动作 阻断', () => {
    const res = dispatch({ method: 'GET', path: '/behavior-control/recipient-check-config' });
    const cfg = res.data as RecipientCheckConfig;
    expect(cfg).toEqual({ existence_enabled: true, existence_action: 'reject' });
  });

  it('PUT recipient-check-config 返回 status', () => {
    const res = dispatch({ method: 'PUT', path: '/behavior-control/recipient-check-config', body: {} });
    expect((res.data as { status: string }).status).toBe('updated');
  });
});
