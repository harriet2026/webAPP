import { describe, it, expect } from 'vitest';
import { canManageContentRules } from './access';

// GT-12174 收尾对齐：后端在多租户下对 system_admin 的 content_rules 写入，
// 仅当"没有租户上下文（平台视角/未选租户）"时才 403；平台管理员"以租户管理"
// 下钻（X-Tenant-ID 存在）时后端放行（internal/api/unified_rules.go CreateUnifiedRule
// 只在 GetEffectiveTenantID(c) == nil 时 respondForbidden）。前端入口此前只按
// 角色+形态判定（!multiTenant），忽略了下钻，导致平台管理员以租户管理时看得到
// 内容规则和总开关、后端也会接受写入，却没有新建/导入/导出/编辑/删除入口。
//
// GT-12334：本不变量与 canEditSecurityModule('content_rules', ...) 对齐——
// 二者是同一租户级模块的同一授权矩阵，必须一致，否则会再次漂移。
describe('canManageContentRules (GT-12174 / GT-12334)', () => {
  const base = {
    isSystemAdmin: false,
    isTenantAdmin: false,
    multiTenant: true,
    capabilitiesLoaded: true,
    selectedTenantId: null as number | null,
  };

  it('tenant admin can always manage (own tenant, backend pins tenant_id)', () => {
    expect(canManageContentRules({ ...base, isTenantAdmin: true, multiTenant: true })).toBe(true);
    expect(canManageContentRules({ ...base, isTenantAdmin: true, multiTenant: false })).toBe(true);
  });

  it('platform admin CANNOT manage in multi-tenant from PLATFORM scope (no tenant selected → backend 403)', () => {
    expect(
      canManageContentRules({ ...base, isSystemAdmin: true, multiTenant: true, selectedTenantId: null }),
    ).toBe(false);
  });

  it('platform admin CAN manage in multi-tenant when drilled into a tenant (以租户管理; backend returns 201)', () => {
    // GT-12334: 平台管理员下钻租户后，X-Tenant-ID 存在，后端放行内容规则写入，
    // 入口必须出现——与 canEditSecurityModule / canAccessPolicyPipeline 一致。
    expect(
      canManageContentRules({ ...base, isSystemAdmin: true, multiTenant: true, selectedTenantId: 7 }),
    ).toBe(true);
  });

  it('platform admin CAN manage in single-tenant (no tenant layer, legacy access kept)', () => {
    expect(
      canManageContentRules({ ...base, isSystemAdmin: true, multiTenant: false, selectedTenantId: null }),
    ).toBe(true);
  });

  it('fails closed for platform admin while capabilities are still loading', () => {
    // 未加载完成时不能先放行——否则会闪现随后 403 的入口。
    expect(
      canManageContentRules({
        ...base,
        isSystemAdmin: true,
        multiTenant: false,
        capabilitiesLoaded: false,
      }),
    ).toBe(false);
  });

  it('tenant admin is unaffected by the capabilities load state', () => {
    expect(
      canManageContentRules({ ...base, isTenantAdmin: true, capabilitiesLoaded: false }),
    ).toBe(true);
  });

  it('other roles cannot manage', () => {
    expect(canManageContentRules({ ...base, multiTenant: false })).toBe(false);
    expect(canManageContentRules({ ...base, multiTenant: false, selectedTenantId: 7 })).toBe(false);
  });
});
