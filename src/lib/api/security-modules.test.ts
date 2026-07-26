import { describe, expect, it } from 'vitest';
import {
  GLOBAL_SECURITY_MODULE_PAGES,
  TENANT_SECURITY_MODULE_PAGES,
  canEditSecurityModule,
  securityModuleScope,
} from './security-modules';

describe('security module scope registry', () => {
  it('contains exactly four global and thirteen tenant pages', () => {
    expect(GLOBAL_SECURITY_MODULE_PAGES).toEqual([
      'ip_frequency',
      'ip_filter',
      'rbl_filter',
      'overseas_mail',
    ]);
    // GT-12189 增加 comprehensive_strategy 聚合开关后租户级页面从 12 增至 13，
    // 原计数断言未同步更新（陈旧测试），此处一并修正。
    expect(TENANT_SECURITY_MODULE_PAGES).toHaveLength(13);
    expect(new Set([...GLOBAL_SECURITY_MODULE_PAGES, ...TENANT_SECURITY_MODULE_PAGES]).size).toBe(17);
    expect(securityModuleScope('user_list')).toBe('tenant');
    expect(securityModuleScope('ip_filter')).toBe('global');
  });

  it('enforces the role, product-form, and tenant-selection matrix', () => {
    expect(canEditSecurityModule({ page: 'ip_filter', role: 'tenant_admin', viewer: 'tenant', multiTenant: true, selectedTenantId: 7 })).toBe(false);
    expect(canEditSecurityModule({ page: 'ip_filter', role: 'system_admin', viewer: 'platform', multiTenant: true, selectedTenantId: null })).toBe(true);
    expect(canEditSecurityModule({ page: 'ip_filter', role: 'system_admin', viewer: 'platform', multiTenant: true, selectedTenantId: 7 })).toBe(false);
    expect(canEditSecurityModule({ page: 'ip_filter', role: 'system_admin', viewer: 'tenant', multiTenant: true, selectedTenantId: 7 })).toBe(false);
    expect(canEditSecurityModule({ page: 'user_list', role: 'tenant_admin', viewer: 'tenant', multiTenant: true, selectedTenantId: null })).toBe(true);
    expect(canEditSecurityModule({ page: 'user_list', role: 'system_admin', viewer: 'platform', multiTenant: true, selectedTenantId: null })).toBe(false);
    expect(canEditSecurityModule({ page: 'user_list', role: 'system_admin', viewer: 'tenant', multiTenant: true, selectedTenantId: 7 })).toBe(true);
    expect(canEditSecurityModule({ page: 'user_list', role: 'system_admin', viewer: 'platform', multiTenant: false, selectedTenantId: null })).toBe(true);
  });
});
