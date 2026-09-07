import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { TopTable } from '@/components/statistics/ops-top-trend/TopTable';
import type { OpsTopRow } from '@/lib/api/ops-top';

function connectionRows(count: number): OpsTopRow[] {
  return Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    key: `192.0.2.${index + 1}`,
    name: `192.0.2.${index + 1}`,
    metrics: {
      sourceIp: `192.0.2.${index + 1}`,
      geoLocation: '测试',
      totalConn: 1000 - index,
      successCount: 900 - index,
      failureCount: 10,
      failureRate: 10,
      firstConn: '2026-07-26 09:00',
      lastConn: '2026-07-26 10:00',
    },
    change: 0,
    changePercent: 0,
    isSpike: false,
    trend: [],
  }));
}

describe('TopTable', () => {
  it.each([50, 100])('renders every row returned for TOP%s instead of truncating at 15', (count) => {
    const { container } = render(
      <TopTable
        dimension="connection"
        rows={connectionRows(count)}
        total={count}
        expandedKey={null}
        onToggleRow={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('tbody > tr')).toHaveLength(count);
    expect(container.querySelector('tbody > tr:last-child')?.textContent).toContain(String(count));
  });

  it('keeps the rank badge in the same leading position for spike and regular rows', () => {
    const rows = connectionRows(2);
    rows[0].isSpike = true;
    const { container } = render(
      <TopTable
        dimension="connection"
        rows={rows}
        total={rows.length}
        expandedKey={null}
        onToggleRow={vi.fn()}
      />,
    );

    const rankCells = container.querySelectorAll('tbody > tr > td:first-child');
    expect(rankCells[0].firstElementChild?.firstElementChild).toHaveTextContent('1');
    expect(rankCells[1].firstElementChild?.firstElementChild).toHaveTextContent('2');
    expect(rankCells[0].querySelector('.lucide-flame')).toBeInTheDocument();
    expect(rankCells[1].querySelector('.lucide-flame')).not.toBeInTheDocument();
  });

  it('renders the internal marker only in the geo-location column', () => {
    const rows = connectionRows(1);
    rows[0].metrics.isInternal = true;
    rows[0].metrics.geoLocation = 'internal';
    const { container } = render(
      <TopTable
        dimension="connection"
        rows={rows}
        total={rows.length}
        expandedKey={null}
        onToggleRow={vi.fn()}
      />,
    );

    const cells = container.querySelectorAll('tbody > tr > td');
    expect(cells[1]).not.toHaveTextContent('internal');
    expect(cells[2]).toHaveTextContent('internal');
  });
});
