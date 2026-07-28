import registryMirror from './__fixtures__/registry_for_test.json';
import type { FeatureDef } from './resolve';

/**
 * Canonical, backend-free feature-registry mirror (the Go/TypeScript parity
 * test guards it against internal/productform.Registry), reused here as a
 * FAIL-CLOSED fallback for form-visibility gating.
 *
 * Why this exists: the live registry comes from /bootstrap and is `[]` until
 * that answers (and stays `[]` if it 500s or there is no apiserver, e.g. a
 * preview session). An empty registry makes every form-gated nav item fall
 * through `isItemVisibleByForm`'s additive "未登记=放行" default, so
 * `platformHidden` groups (安全策略 / 智能体中心) LEAK into the platform-admin
 * sidebar — visible when the spec says they must be hidden. `registryReady`
 * (GT-12013) is the signal that the live registry has NOT arrived; when it is
 * false we gate against this mirror instead of an empty array, reproducing the
 * exact production gating rather than failing open.
 *
 * This is the SAME mirror `createOfflineDemoBootstrap` already ships as
 * production (demo) code, so it is not a test-only asset. In a healthy session
 * the live registry loads, `registryReady` is true, and this is never read.
 */
export const FALLBACK_FEATURE_REGISTRY = registryMirror as FeatureDef[];
