import { describe, it, expect } from 'vitest';
import { matchedConfigHref } from './auth-detail-drawer';

// GT-12437（重开轮）防回归：命中配置跳转目标——多租户带租户上下文时直达
// 租户中心下钻的发信认证页签；无租户上下文回退 /mail-routing。
describe('GT-12437 matchedConfigHref', () => {
  it('routes to tenants drill-down auth tab when tenant_id present', () => {
    expect(matchedConfigHref({ tenant_id: 298, matched_config_id: 7 }))
      .toBe('/tenants?view=routing&tenant_id=298&tab=auth&config=7');
  });
  it('falls back to /mail-routing without tenant context', () => {
    expect(matchedConfigHref({ matched_config_id: 7 }))
      .toBe('/mail-routing?tab=auth&config=7');
  });
});
