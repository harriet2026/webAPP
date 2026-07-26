import type { DimensionType } from './columns';

/**
 * Platform scope for the connection dimension.
 *
 * MUST mirror the backend guard `denyConnectionDimOutOfPlatformScope`
 * (`internal/api/ops_top.go`): `role == "system_admin" && effectiveTenantID == nil`.
 * Notably it is NOT `is_super_admin` - a `platform_auditor` has
 * `role=system_admin, is_super_admin=false` and the backend serves it the
 * connection dimension, so narrowing the frontend to a true super admin would
 * hide a tab the account is authorized to see.
 */
export function computeIsPlatformScope(
  isSystemAdmin: boolean,
  selectedTenantId: number | string | null | undefined,
): boolean {
  return isSystemAdmin && selectedTenantId == null;
}

/**
 * Normalizes a requested dimension to one the current scope may query.
 *
 * Applied BEFORE the `useOpsTop` query is created, not in a post-render effect:
 * an effect-based downgrade still lets the first render fire a
 * `dimension=connection` request that the backend answers with 403.
 */
export function effectiveDimension(
  dimension: DimensionType,
  isPlatformScope: boolean,
): DimensionType {
  if (dimension === 'connection' && !isPlatformScope) return 'subject';
  return dimension;
}
