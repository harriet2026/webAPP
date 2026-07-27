// 演示部署的登录绕过开关。
// 当 OSGATEWAY_PRODUCT_FORM_SWITCHER 环境变量为真值时，
// proxy 和 layout 均跳过 HttpOnly JWT cookie 检查，以便无需登录即可预览产品形态。
// 与 dashboard layout 中的 SWITCHER_TRUTHY 集合保持一致。
const SWITCHER_TRUTHY = new Set(['1', 'true', 'TRUE', 'yes']);

/**
 * 返回 true 时表示当前部署已启用演示用登录绕过，
 * 无需有效的 osgateway_token cookie 即可访问受保护路由。
 */
export function isDemoAuthBypassEnabled(
  switcherEnvValue: string | undefined,
): boolean {
  return SWITCHER_TRUTHY.has(switcherEnvValue ?? '');
}
