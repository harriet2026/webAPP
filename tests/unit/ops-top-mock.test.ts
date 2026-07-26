import { describe, expect, it } from 'vitest';
import { dispatch, isMockable } from '@/lib/mock/dispatcher';
import { mockOpsTopFor } from '@/lib/mock/fixtures';
import { LEFT_PANEL_COLUMNS } from '@/components/statistics/ops-top-trend/columns';
import zh from '../../messages/zh.json';

describe('ops top trend mock contract', () => {
  it('keeps the demo row count without exposing the connection average as a page column', () => {
    const data = mockOpsTopFor('connection', '50', 'all');
    expect(data.total).toBe(50);
    expect(data.rows).toHaveLength(50);
    expect(data.trendLabels).toHaveLength(7);
    expect(data.rows[0].trend).toHaveLength(7);
    expect(data.rows[0].metrics.avgMessagesPerConnection).toEqual(expect.any(Number));
    expect(LEFT_PANEL_COLUMNS.connection.map((column) => column.key)).toEqual([
      'sourceIp',
      'geoLocation',
      'totalConn',
      'successCount',
      'failureCount',
      'failureRate',
      'firstConn',
      'lastConn',
      'change',
      'trend',
    ]);
  });

  it('uses the product-confirmed Chinese page title exactly', () => {
    expect(zh.opsTopTrend.title).toBe('运营TOP与趋势');
  });

  it('registers every endpoint used by the page', () => {
    const paths = [
      ['GET', '/statistics/ops-top?dimension=connection&direction=all&time_range=7d&top=10'],
      ['GET', '/statistics/ops-top/drilldown?dimension=connection&sub_dim=senderTop&key=1.2.3.4'],
      ['GET', '/statistics/ops-top/export.csv?dimension=connection&direction=all&time_range=7d&top=10'],
      ['POST', '/statistics/ops-top/ai-analysis'],
    ];
    for (const [method, path] of paths) {
      expect(isMockable(method, path), `${method} ${path}`).toBe(true);
    }
  });

  it('returns deterministic drilldown and AI fixtures', () => {
    const drill = dispatch({
      method: 'GET',
      path: '/statistics/ops-top/drilldown?dimension=connection&sub_dim=senderTop&key=1.2.3.4',
    });
    expect(drill.status).toBe(200);
    expect(drill.data).toMatchObject({ sub_dim: 'senderTop' });

    const ai = dispatch({ method: 'POST', path: '/statistics/ops-top/ai-analysis' });
    expect(ai.status).toBe(200);
    expect(ai.data).toMatchObject({ markdown: expect.stringContaining('运营趋势摘要') });
  });
});
