// GT-12181: the advanced-filter-rules priority input previously hard-coded the
// html_spec range 1-100 (default 50), which has no role semantics. But
// internal/api.validatePriority (internal/api/unified_rules.go:2137-2153)
// enforces a *tenant_admin* range of 100-1000, so a tenant admin saving with
// the UI default (50) always failed with 400 "tenant admin priority must be
// between 100 and 1000". This mirrors GT-12165's behavior-control fix: keep the
// client-side range in step with the API, parameterized by the logged-in role.

export type PriorityRange = {
  min: number;
  max: number;
  defaultValue: number;
};

// Tenant administrators have a deliberately narrower priority namespace
// (validatePriority: 100-1000); system administrators keep the full
// project-wide range (0-9999). Defaults sit inside each range.
const tenantAdminPriorityRange: PriorityRange = {
  min: 100,
  max: 1000,
  defaultValue: 600,
};

const systemAdminPriorityRange: PriorityRange = {
  min: 0,
  max: 9999,
  defaultValue: 600,
};

// validatePriority 的角色收窄是**全局**的（对 rules 表的所有 page 一视同仁），
// 不是高级过滤规则专有。GT-12693 发现发信人黑白名单抽屉写死 1-9999、完全没有
// 角色判断，租户管理员手改优先级必然 400。所以这里给出一个不带模块名的入口，
// 供其它规则表单共用；getAdvancedRulesPriorityRange 保留为其别名，避免改动
// 既有调用点与它的单测。
export function getRulePriorityRange(isSystemAdmin: boolean): PriorityRange {
  return isSystemAdmin ? systemAdminPriorityRange : tenantAdminPriorityRange;
}

export function getAdvancedRulesPriorityRange(isSystemAdmin: boolean): PriorityRange {
  return getRulePriorityRange(isSystemAdmin);
}

export function isPriorityInRange(priority: number, range: Pick<PriorityRange, 'min' | 'max'>): boolean {
  return Number.isFinite(priority) && priority >= range.min && priority <= range.max;
}
