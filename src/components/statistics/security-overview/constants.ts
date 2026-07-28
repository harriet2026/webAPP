import type { ViewBy } from '@/lib/api/security-overview';

// Shared constants for the security-overview feature.
//
// The threat / action color map is intentionally hard-coded hex
// (per DESIGN.md §"Threat Semantic Palette" — these constants "must stay
// identical everywhere they recur"). Keeping a single source here is what
// makes that contract enforceable, instead of copy-pasting per component.

export const SERIES_COLORS: Record<string, string> = {
  // threat_type view
  normal: '#9CA3AF',
  spam: '#3B82F6',
  suspicious: '#EAB308',
  high_risk_spam: '#F97316',
  phishing: '#EF4444',
  virus: '#7C3AED',
  malicious: '#DC2626',
  invalid: '#6B7280',
  // unified email_type view
  subscription: '#06B6D4',
  advertising: '#8B5CF6',
  harmful: '#F97316',
  sensitive: '#EC4899',
  spoofing: '#F59E0B',
  account_compromised: '#B91C1C',
  // threat_level view
  low: '#3B82F6',
  medium: '#EAB308',
  high: '#F97316',
  critical: '#DC2626',
  // action view
  deliver: '#10B981',
  mark_deliver: '#06B6D4',
  quarantine: '#F59E0B',
  review: '#8B5CF6',
  block: '#EF4444',
  drop: '#DC2626',
  recall: '#0ea5e9',
  greylist: '#64748B',
  // delivery_result view
  delivered: '#10B981',
  failed: '#EF4444',
  cancelled: '#9CA3AF',
  in_delivery: '#3B82F6',
  partial_delivered: '#F59E0B',
  unknown: '#6B7280',
};

// Only these two perspectives are user-facing. `threat_type`,
// `threat_level`, and `delivery_result` remain in the wire contract for
// compatibility, but are not rendered as tabs.
export const TREND_VIEW_BY_OPTIONS: ViewBy[] = ['email_type', 'action'];
export const PRINT_VIEW_BY_OPTIONS: ViewBy[] = TREND_VIEW_BY_OPTIONS;

export function seriesColor(key: string): string {
  return SERIES_COLORS[key] ?? '#6b7280';
}

// Block-rate tier — single source of truth for the DESIGN.md rule:
// ≥98% → good (success), 95–97.9% → warn (warning), <95% → bad (danger).
export type BlockRateTier = 'good' | 'warn' | 'bad';

export function blockRateTier(rate: number): BlockRateTier {
  if (rate >= 98) return 'good';
  if (rate >= 95) return 'warn';
  return 'bad';
}

// Per-surface token classes derived from the tier, so every surface
// (KPI text, geo bar, table dot) agrees and themes consistently.
const TIER_TEXT: Record<BlockRateTier, string> = {
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-danger',
};
const TIER_BG: Record<BlockRateTier, string> = {
  good: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-danger',
};
const TIER_BADGE: Record<BlockRateTier, 'default' | 'secondary' | 'destructive'> = {
  good: 'default',
  warn: 'secondary',
  bad: 'destructive',
};

export const blockRateTextClass = (rate: number) => TIER_TEXT[blockRateTier(rate)];
export const blockRateBgClass = (rate: number) => TIER_BG[blockRateTier(rate)];
export const blockRateBadgeVariant = (rate: number) => TIER_BADGE[blockRateTier(rate)];

// Geo ranking uses the separately confirmed PRD threshold: ≥97% is good,
// 95–96.9% warns, and <95% is bad.
export function geoBlockRateTier(rate: number): BlockRateTier {
  if (rate >= 97) return 'good';
  if (rate >= 95) return 'warn';
  return 'bad';
}

export const geoBlockRateTextClass = (rate: number) => TIER_TEXT[geoBlockRateTier(rate)];
export const geoBlockRateBgClass = (rate: number) => TIER_BG[geoBlockRateTier(rate)];
export const geoBlockRateBadgeVariant = (rate: number) => TIER_BADGE[geoBlockRateTier(rate)];
