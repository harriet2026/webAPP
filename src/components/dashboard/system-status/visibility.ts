'use client';

// System-status dashboard visibility rules (Plan Task 5, spec §4.10 视角矩阵).
//
// The dashboard renders a different set of sections/grid width depending on
// two independent axes:
//   - Product form:  AI capability gates the agent-overview section.
//   - Viewer/scope:  the infrastructure/node section is a platform-only
//     `/monitor/*` surface (adminOnly on the backend — see hooks.ts's own
//     doc comment on why tenant viewers must never call it), so its
//     visibility is derived from the SAME feature-registry `resolve()`
//     mechanism the sidebar uses (`sidebar-visibility.ts`), not a bespoke
//     `viewer === 'tenant'` check — that keeps this page's infra gate in
//     lockstep with the `monitor-infrastructure` registry entry (spec's
//     single source of truth for form/viewer-based feature gating).
//
// `deriveVisibility` is the pure decision function (unit-testable without
// React); `useSystemStatusVisibility` wires it to the real product-form
// context + registry + the canonical `useSecurityScope` hook (Task 4 already
// established this reuse pattern in hooks.ts — this hook must NOT recompute
// `effectiveViewer` itself, since that logic already lives in
// `resolveSecurityScope` and duplicating it was flagged in Task 4's review).
import { useProductForm } from '@/contexts/product-form-context';
import { useAuth } from '@/contexts/auth-context';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import { resolve, type Capabilities, type FeatureDef, type Viewer } from '@/lib/product-form/resolve';

const INFRA_FEATURE_ID = 'monitor-infrastructure';

// agent-overview.tsx row keys -> registry feature ids. All three are
// `grantable: true` + `platformHidden: true` in the registry (unlike
// `monitor-infrastructure` above), so — unlike the page-level `showAgents`
// gate (which only checks the blanket `capabilities.ai`) — each row can
// resolve differently per viewer/tenant: a platform viewer in a multi-tenant
// AI form gets HIDDEN (platformHidden), and a SaaS tenant not granted a
// specific agent gets a locked/upsell result. Reviewer-flagged gap (Task 6
// review): agent-overview.tsx must gate each row individually against
// `resolve()`, the same mechanism `isItemVisibleByForm` uses per nav item.
const AGENT_FEATURE_IDS = {
  phishing: 'phishing-detection',
  spoofing: 'spoofing-detection',
  'threat-retro': 'threat-retro',
} as const;

export type AgentRowKey = keyof typeof AGENT_FEATURE_IDS;

export type AgentFeatureAccess = Record<
  AgentRowKey,
  { visible: boolean; canRequest: boolean }
>;

const NO_AGENT_ACCESS: AgentFeatureAccess = {
  phishing: { visible: false, canRequest: false },
  spoofing: { visible: false, canRequest: false },
  'threat-retro': { visible: false, canRequest: false },
};

/**
 * Resolve both display visibility and whether the backing endpoint may be
 * called. A SaaS upsell/locked feature is visible but cannot be requested;
 * the backend capability middleware represents that state as HTTP 403.
 *
 * Before bootstrap has delivered the registry/grants, fail closed. Treating
 * the initial empty registry as "unregistered = allowed" caused the dashboard
 * to fire capability-gated requests during hydration.
 */
export function resolveAgentFeatureAccess(
  registry: FeatureDef[],
  caps: Capabilities,
  viewer: Viewer,
  grants: string[],
  registryReady: boolean,
  bypassTenantGrants = false,
  switcherEnabled = true,
): AgentFeatureAccess {
  if (!registryReady || !caps.ai) return NO_AGENT_ACCESS;

  const effectiveGrants = bypassTenantGrants
    ? [...new Set([...grants, ...Object.values(AGENT_FEATURE_IDS)])]
    : grants;

  return Object.fromEntries(
    (Object.entries(AGENT_FEATURE_IDS) as [AgentRowKey, string][]).map(([key, featureId]) => {
      // 仿冒与威胁回溯目前只在产品形态切换器开启的演示/开发环境露出。
      // 在这里统一门控展示与接口请求，使运行概况、待办提醒及数据请求
      // 与智能体中心保持一致；钓鱼智能体不受该临时门控影响。
      if (!switcherEnabled && key !== 'phishing') {
        return [key, { visible: false, canRequest: false }];
      }
      const feature = registry.find((item) => item.id === featureId);
      // Preserve the registry's additive default only after bootstrap has
      // completed. AI capability still gates the fallback above.
      if (!feature) return [key, { visible: true, canRequest: true }];
      const access = resolve(feature, caps, viewer, effectiveGrants);
      return [key, { visible: access.visible, canRequest: access.visible && !access.locked }];
    }),
  ) as AgentFeatureAccess;
}

export function useAgentFeatureAccess(): AgentFeatureAccess {
  const { capabilities, registry, grants, registryReady, switcherEnabled } = useProductForm();
  const { isSystemAdmin } = useAuth();
  const scope = useSecurityScope(null);
  const caps = capabilities ?? { ai: false, multiTenant: false, saas: false };
  const bypassTenantGrants = isSystemAdmin && scope.resolvedScopeTenant != null;

  return resolveAgentFeatureAccess(
    registry,
    caps,
    scope.effectiveViewer,
    grants,
    registryReady,
    bypassTenantGrants,
    switcherEnabled,
  );
}

/**
 * Real-hook wrapper, same inputs as `useSystemStatusVisibility` (`registry`
 * + `grants` from `useProductForm()`, `effectiveViewer` from the shared
 * `useSecurityScope(null)`) — does not recompute or duplicate scope
 * derivation, per the same constraint documented on
 * `useSystemStatusVisibility` above.
 */
export function useAgentRowVisibility(): Record<AgentRowKey, boolean> {
  const access = useAgentFeatureAccess();

  return Object.fromEntries(
    (Object.keys(AGENT_FEATURE_IDS) as AgentRowKey[]).map((key) => [key, access[key].visible]),
  ) as Record<AgentRowKey, boolean>;
}

export interface SystemStatusVisibility {
  showAgents: boolean;
  showInfra: boolean;
  kpiCols: number;
  overviewCols: number;
}

// Static, fully-literal Tailwind class strings per bottom-overview column count
// — matches the house pattern in kpi-cards.tsx (`gridCols` ternary), required
// so the Tailwind JIT scanner can see the class names at build time (an
// interpolated `xl:grid-cols-${n}` would not be picked up). xl is deliberate:
// with the 256px sidebar, viewport-level lg leaves only a narrow page body.
const OVERVIEW_GRID_COLS: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
};

/**
 * Resolve the bottom-overview grid class for a given visible-card count.
 * `deriveVisibility` can return `overviewCols=1` (traditional form, tenant
 * viewer: only threat-top5 renders), so the map MUST cover 1 — otherwise the
 * single card stretches across a 3-col grid, re-introducing the empty columns
 * the visibility logic exists to prevent (spec §4.10/§4.11.8 "无空缺列").
 */
export function overviewGridClass(cols: number): string {
  return OVERVIEW_GRID_COLS[cols] ?? 'xl:grid-cols-3';
}

/**
 * Pure visibility derivation: `caps.ai` gates the agent-overview section;
 * `infraVisible` (already resolved by the caller against the current
 * viewer) gates the infra/node section. Both the KPI grid and the bottom
 * overview grid collapse to exactly the number of visible cards so there is
 * never an empty/stretched column (spec §4.10 / §4.11.8 "无空缺列").
 *
 * The bottom overview row holds up to three cards: agent-overview
 * (`showAgents`), threat-top5 (always), and system-health (`showInfra`).
 * `overviewCols` must therefore count `showAgents` too — omitting it left a
 * dangling column in the traditional form (no agents card) and in the AI
 * form when every agent row resolves hidden.
 *
 * `agentsVisible` lets the caller collapse the agents card when `caps.ai` is
 * true but every per-agent `resolve()` came back hidden (agent-overview
 * renders `null` in that case); it defaults to `true` so pure unit tests can
 * pass just `(caps, infraVisible)`.
 */
export function deriveVisibility(
  caps: { ai: boolean },
  infraVisible: boolean,
  agentsVisible: boolean = true,
): SystemStatusVisibility {
  const showInfra = infraVisible;
  const showAgents = caps.ai && agentsVisible;
  return {
    showAgents,
    showInfra,
    kpiCols: showInfra ? 4 : 3,
    overviewCols: (showAgents ? 1 : 0) + 1 + (showInfra ? 1 : 0),
  };
}

/**
 * Real-hook wrapper: `capabilities.ai` from `useProductForm()`, and
 * `infraVisible` from resolving the `monitor-infrastructure` registry
 * feature for `effectiveViewer` (via the shared `useSecurityScope`, the
 * same normalization `useSystemStatusData` uses — NOT the raw `viewer`
 * context value, so "platform admin + viewer=tenant + no selected tenant"
 * is normalized the same way everywhere on this page).
 *
 * A feature missing from the registry is treated as visible (additive
 * "未登记=放行" default), mirroring `isItemVisibleByForm` in
 * `sidebar-visibility.ts`.
 */
export function useSystemStatusVisibility(): SystemStatusVisibility {
  const { capabilities, registry, registryReady, grants } = useProductForm();
  const { effectiveViewer } = useSecurityScope(null);
  const agentAccess = useAgentFeatureAccess();

  const caps = capabilities ?? { ai: false, multiTenant: false, saas: false };

  // GT-12013: `registry` is [] until /bootstrap answers, while `capabilities`
  // has a non-null fallback — so without this guard the "未登记=放行" default
  // below fired during that window and a tenant_admin briefly saw the
  // platform-only 系统在线节点 / 系统与服务健康 cards, complete with live links
  // to /monitoring/infrastructure (which then 403s). Fail closed until the
  // registry is actually loaded; the additive default is only meant for a
  // feature that genuinely is not registered.
  const infraFeature = registry.find((f) => f.id === INFRA_FEATURE_ID);
  const infraVisible = !registryReady
    ? false
    : infraFeature
      ? resolve(infraFeature, caps, effectiveViewer, grants).visible
      : true;

  // Whether the agent-overview section actually renders: caps.ai gates it at
  // the page level, but agent-overview.tsx returns null when every per-agent
  // resolve() is hidden — mirror that here so overviewCols doesn't leave a
  // dangling column for an AI form whose agent rows all resolved hidden.
  const anyAgentVisible = Object.values(agentAccess).some((access) => access.visible);

  return deriveVisibility({ ai: caps.ai === true }, infraVisible, anyAgentVisible);
}
