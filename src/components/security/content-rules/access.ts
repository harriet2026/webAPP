// GT-12174 / GT-12334: 内容规则是策略流水线阶段3（模块A），tenant 级安全模块。
// 多租户形态下：
//   - 租户管理员恒可管理本租户内容规则（归属由后端钉死）。
//   - 平台管理员在*平台视角/未选租户*时不可管理——后端
//     internal/api/unified_rules.go CreateUnifiedRule 在 GetEffectiveTenantID(c)
//     == nil 时 respondForbidden("Content rules can only be managed within a
//     tenant context")，此时若显示入口，点击必然 403（GT-12174）。
//   - 平台管理员"以租户管理"*下钻某租户*时（X-Tenant-ID 存在）后端放行写入
//     （返回 201），入口必须出现——否则平台管理员能进策略流水线、能拨模块总开关、
//     后端也接受写入，却唯独没有新建/导入/导出/编辑/删除入口（GT-12334）。
// 单租户形态没有租户层，平台管理员本就拥有全部编辑权，维持原样。
//
// 授权矩阵与 canEditSecurityModule('content_rules', ...) 完全一致——二者是同一
// 租户级模块的同一套授权，此前分成两份手写逻辑，GT-12151 只把 canEditSecurityModule
// 改成了下钻感知、漏了本文件，导致漂移。这里直接委托给 canEditSecurityModule，
// 作为单一事实源，避免再次漂移。
import { canEditSecurityModule } from "@/lib/api/security-modules";

export interface ContentRulesAccessInput {
  isSystemAdmin: boolean;
  isTenantAdmin: boolean;
  multiTenant: boolean;
  /** capabilities 尚未加载完成时为 false；此时对平台管理员 fail-closed。 */
  capabilitiesLoaded: boolean;
  /** 平台管理员"以租户管理"下钻时选中的租户；null = 平台视角/未选租户。 */
  selectedTenantId: number | null;
}

/**
 * 是否可以管理（新建/导入导出/编辑/启停/删除/批量）内容规则。
 *
 * - 租户管理员：恒可管理本租户内容规则。
 * - 平台管理员：单租户形态可管理；多租户下仅在下钻某租户（selectedTenantId != null）
 *   时可管理，平台视角不可（与后端 403 对齐）。capabilities 未加载完成时按
 *   fail-closed 处理，避免闪现随后会 403 的入口。
 */
export function canManageContentRules(i: ContentRulesAccessInput): boolean {
  if (i.isTenantAdmin) return true;
  // 未加载完成时不能先放行——否则会闪现随后 403 的入口。
  if (i.isSystemAdmin && !i.capabilitiesLoaded) return false;
  return canEditSecurityModule({
    page: "content_rules",
    role: i.isSystemAdmin ? "system_admin" : undefined,
    viewer: i.selectedTenantId != null ? "tenant" : "platform",
    multiTenant: i.multiTenant,
    selectedTenantId: i.selectedTenantId,
  });
}
