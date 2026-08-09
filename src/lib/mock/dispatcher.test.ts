import { describe, expect, it } from 'vitest';

import { dispatch, isMockable } from '@/lib/mock/dispatcher';

describe('agent center overview mock', () => {
  it('returns the complete overview for the base path', () => {
    expect(isMockable('GET', '/agent-center/overview')).toBe(true);

    const response = dispatch({ method: 'GET', path: '/agent-center/overview' });
    const data = response.data as { agents: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(data.agents).toHaveLength(3);
    expect(data.agents.map((agent) => agent.key)).toEqual([
      'phishing',
      'spoofing',
      'threat-retro',
    ]);
    expect(data.agents[0]).toMatchObject({
      feature_id: 'phishing-detection',
      access: 'enabled',
      status: 'running',
      stage_position: '4.0',
      today_processed: 12,
      hit_count: 3,
      processed_count: 12,
      hit_rate: 0.25,
    });
  });

  it('matches the overview route when the request contains a query string', () => {
    expect(isMockable('GET', '/agent-center/overview?tenant_id=42')).toBe(true);

    const response = dispatch({
      method: 'GET',
      path: '/agent-center/overview?tenant_id=42',
    });

    expect((response.data as { agents: unknown[] }).agents).toHaveLength(3);
  });
});
