import { describe, expect, it } from 'vitest';
import { deriveVisibility, resolveAgentFeatureAccess } from '../visibility';

const AGENT_FEATURES = [
  { id: 'phishing-detection', visibility: 'AI_ELSE_LOCK', scope: 'mixed', platformAccess: 'edit', tenantAccess: 'edit', platformHidden: true, grantable: true },
  { id: 'spoofing-detection', visibility: 'AI_ELSE_LOCK', scope: 'mixed', platformAccess: 'edit', tenantAccess: 'edit', platformHidden: true, grantable: true },
  { id: 'threat-retro', visibility: 'AI_ELSE_LOCK', scope: 'mixed', platformAccess: 'edit', tenantAccess: 'edit', platformHidden: true, grantable: true },
];

const AI_MULTI = { ai: true, multiTenant: true, saas: false };

describe('deriveVisibility', () => {
  it('tenant hides infra, collapses grid', () => {
    const v = deriveVisibility({ ai: true }, /* infraVisible */ false);
    expect(v.showAgents).toBe(true);
    expect(v.showInfra).toBe(false);
    expect(v.kpiCols).toBe(3);
    // agents + top5, no infra
    expect(v.overviewCols).toBe(2);
  });

  it('traditional hides agents and collapses the overview grid (F1 fix)', () => {
    const v = deriveVisibility({ ai: false }, true);
    expect(v.showAgents).toBe(false);
    expect(v.kpiCols).toBe(4);
    // top5 + infra only (no agents) — must be 2, not a stretched 3
    expect(v.overviewCols).toBe(2);
  });

  it('platform + ai shows everything at full grid', () => {
    const v = deriveVisibility({ ai: true }, true);
    expect(v.showAgents).toBe(true);
    expect(v.showInfra).toBe(true);
    expect(v.kpiCols).toBe(4);
    expect(v.overviewCols).toBe(3);
  });

  it('tenant + traditional collapses to a single overview card (F1 fix)', () => {
    const v = deriveVisibility({ ai: false }, false);
    expect(v.showAgents).toBe(false);
    expect(v.showInfra).toBe(false);
    expect(v.kpiCols).toBe(3);
    // top5 only — must be 1, not 2 (the old code left a dangling column)
    expect(v.overviewCols).toBe(1);
  });

  it('ai form but all agent rows hidden collapses the agents card (F1 edge)', () => {
    // caps.ai true, but the caller resolved every per-agent feature to hidden
    // (agent-overview renders null) -> agents card must not count toward the grid.
    const v = deriveVisibility({ ai: true }, true, /* agentsVisible */ false);
    expect(v.showAgents).toBe(false);
    // top5 + infra only
    expect(v.overviewCols).toBe(2);
  });

  it('ai form with agents visible keeps the agents card', () => {
    const v = deriveVisibility({ ai: true }, false, /* agentsVisible */ true);
    expect(v.showAgents).toBe(true);
    expect(v.overviewCols).toBe(2);
  });
});

describe('resolveAgentFeatureAccess', () => {
  it('fails closed before bootstrap supplies registry and grants', () => {
    const access = resolveAgentFeatureAccess([], AI_MULTI, 'platform', [], false);
    expect(Object.values(access).every((item) => !item.visible && !item.canRequest)).toBe(true);
  });

  it('does not request platform-hidden agents from an unscoped platform view', () => {
    const access = resolveAgentFeatureAccess(AGENT_FEATURES, AI_MULTI, 'platform', [], true);
    expect(Object.values(access).every((item) => !item.visible && !item.canRequest)).toBe(true);
  });

  it('requests only the feature granted to a tenant', () => {
    const access = resolveAgentFeatureAccess(
      AGENT_FEATURES,
      AI_MULTI,
      'tenant',
      ['phishing-detection'],
      true,
    );
    expect(access.phishing).toEqual({ visible: true, canRequest: true });
    expect(access.spoofing).toEqual({ visible: false, canRequest: false });
    expect(access['threat-retro']).toEqual({ visible: false, canRequest: false });
  });

  it('matches backend system-admin tenant-scope grant bypass', () => {
    const access = resolveAgentFeatureAccess(AGENT_FEATURES, AI_MULTI, 'tenant', [], true, true);
    expect(Object.values(access).every((item) => item.visible && item.canRequest)).toBe(true);
  });

  it('hides switcher-only agents and their requests when the product-form switcher is disabled', () => {
    const access = resolveAgentFeatureAccess(
      AGENT_FEATURES,
      AI_MULTI,
      'tenant',
      ['phishing-detection', 'spoofing-detection', 'threat-retro'],
      true,
      false,
      false,
    );
    expect(access.phishing).toEqual({ visible: true, canRequest: true });
    expect(access.spoofing).toEqual({ visible: false, canRequest: false });
    expect(access['threat-retro']).toEqual({ visible: false, canRequest: false });
  });

  it('keeps a SaaS upsell row visible without requesting its forbidden endpoint', () => {
    const access = resolveAgentFeatureAccess(
      AGENT_FEATURES,
      { ai: true, multiTenant: true, saas: true },
      'tenant',
      [],
      true,
    );
    expect(access.spoofing).toEqual({ visible: true, canRequest: false });
  });
});
