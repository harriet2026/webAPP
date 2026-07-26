import { apiRequest, type ApiRequestFn } from './client';
import type { Viewer } from '@/lib/product-form/resolve';

// 安全模块总开关的 page 标识。所有 page 都可以通过 GET /security/modules 一次
// 性读取开关状态，PUT /security/modules/:page 修改状态，但 `advanced_rules` 例
// 外——它进注册表仅为让后端执行闸门与快照派生统一走一条路径（spec §6.7），
// 前端不通过 /security/modules 读写其状态，而走专用端点
// /security/advanced-rules/enabled（AdvancedFilterRulesPage 内联实现）。
// 切勿"顺手"把 advanced_rules 迁移到 ModuleMasterSwitch，会破坏向后兼容。
export type SecurityModulePage =
  | 'ip_filter'
  | 'ip_frequency'
  | 'rbl_filter'
  | 'sender_filter'
  | 'user_list'
  | 'auth_spoofing'
  | 'content_rules'
  | 'behavior_control'
  | 'mail_marking'
  | 'overseas_mail'
  | 'similar_detection'
  | 'attachment_security'
  | 'recipient_check'
  | 'url_protection'
  | 'intent_engine'
  | 'advanced_rules'
  | 'comprehensive_strategy';

export type SecurityModuleMap = Record<SecurityModulePage, boolean>;

export const GLOBAL_SECURITY_MODULE_PAGES = [
  'ip_frequency',
  'ip_filter',
  'rbl_filter',
  'overseas_mail',
] as const satisfies readonly SecurityModulePage[];

export const TENANT_SECURITY_MODULE_PAGES = [
  'sender_filter',
  'auth_spoofing',
  'behavior_control',
  'recipient_check',
  'user_list',
  'attachment_security',
  'url_protection',
  'content_rules',
  'intent_engine',
  'similar_detection',
  'advanced_rules',
  'mail_marking',
  'comprehensive_strategy',
] as const satisfies readonly SecurityModulePage[];

const GLOBAL_SECURITY_MODULE_SET = new Set<SecurityModulePage>(GLOBAL_SECURITY_MODULE_PAGES);

export function securityModuleScope(page: SecurityModulePage): 'global' | 'tenant' {
  return GLOBAL_SECURITY_MODULE_SET.has(page) ? 'global' : 'tenant';
}

export function canEditSecurityModule({
  page,
  role,
  viewer,
  multiTenant,
  selectedTenantId,
}: {
  page: SecurityModulePage;
  role?: string;
  viewer: Viewer;
  multiTenant: boolean;
  selectedTenantId: number | null;
}): boolean {
  // A platform administrator keeps the authenticated system_admin role while
  // impersonating a tenant. The viewer is therefore part of the authorization
  // context: stage-1 stays platform-managed and must not expose a global write
  // from the tenant-management surface.
  if (securityModuleScope(page) === 'global') {
    return role === 'system_admin' && viewer === 'platform' && selectedTenantId === null;
  }
  if (role === 'tenant_admin') return true;
  if (role !== 'system_admin') return false;
  return !multiTenant || selectedTenantId !== null;
}

export async function getSecurityModules(requestFn: ApiRequestFn = apiRequest): Promise<SecurityModuleMap> {
  return requestFn<SecurityModuleMap>('/security/modules');
}

export async function setSecurityModuleEnabled(
  page: SecurityModulePage,
  enabled: boolean,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn(`/security/modules/${page}`, { method: 'PUT', body: { enabled } });
}

// 关闭这三个模块会连带停用它们的白名单 / accept 规则，
// 原本被放行或跳过内容检测的邮件会继续走完整检测链（spec §5.1）。
// 这一条反直觉，需在 UI 上单独提示。
export const WHITELIST_BEARING_MODULES: SecurityModulePage[] = [
  'ip_filter',
  'user_list',
  'sender_filter',
];
