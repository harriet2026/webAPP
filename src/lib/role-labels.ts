/**
 * i18n key (under the `users` namespace) for a human-readable role label.
 * Reused by 个人中心账号信息（GT-11970）and 用户管理 so role labels have a
 * single source of truth (`users.systemAdmin` / `users.tenantAdmin`).
 */
export type RoleLabelKey = 'systemAdmin' | 'tenantAdmin';

const ROLE_LABEL_KEYS: Record<string, RoleLabelKey> = {
  system_admin: 'systemAdmin',
  tenant_admin: 'tenantAdmin',
};

/**
 * Map a backend role string to its `users.<key>` i18n label key.
 *
 * Returns null for unknown roles so the caller can fall back to the raw value
 * rather than rendering an empty / MISSING_MESSAGE label. Extracted as a pure
 * function so the role->label mapping is unit-testable at the lib layer
 * without rendering React components or depending on next-intl.
 */
export function roleLabelKey(role: string): RoleLabelKey | null {
  return ROLE_LABEL_KEYS[role] ?? null;
}
