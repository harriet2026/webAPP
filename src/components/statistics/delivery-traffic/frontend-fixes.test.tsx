import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { DetailTable } from './DetailTable';
import en from '../../../../messages/en.json';
import th from '../../../../messages/th.json';
import ru from '../../../../messages/ru.json';

describe('delivery traffic frontend fixes', () => {
  it('keeps direction-specific headers and a localized empty row when there is no detail data (GT-12459)', () => {
    render(<DetailTable data={[]} direction="receive" isLoading={false} />);

    expect(screen.getByRole('columnheader', { name: 'date' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'userNotExist' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'mailboxFull' })).toBeInTheDocument();
    expect(screen.getByText('noData')).toBeInTheDocument();
  });

  it('localizes every visible core label called out by GT-12488', () => {
    const paths = [
      'title',
      'direction.label', 'direction.all', 'direction.receive', 'direction.send', 'direction.internal',
      'timeRange.label', 'timeRange.7d',
      'kpi.inboundTotal', 'kpi.outboundTotal', 'kpi.internalTotal', 'kpi.totalSuccessRate', 'kpi.queueBacklog',
      'queueHealth.title',
      'table.title', 'table.date', 'table.total', 'table.success', 'table.failure', 'table.deferred',
      'table.cancelled', 'table.successRate', 'table.change',
      'bottomActions.exportCsv',
    ] as const;

    const valueAt = (obj: unknown, path: string) => path.split('.').reduce<unknown>(
      (value, part) => (value as Record<string, unknown>)[part], obj,
    );

    for (const locale of [th.deliveryTraffic, ru.deliveryTraffic]) {
      for (const path of paths) {
        expect(valueAt(locale, path), path).not.toBe(valueAt(en.deliveryTraffic, path));
      }
    }
  });

  it('has a direction-specific receive-side bounce title in every locale (GT-12458)', () => {
    expect(th.deliveryTraffic.chart.receiveBounceReasons).toBeTruthy();
    expect(ru.deliveryTraffic.chart.receiveBounceReasons).toBeTruthy();
    expect(th.deliveryTraffic.chart.receiveBounceReasons).not.toBe(en.deliveryTraffic.chart.receiveBounceReasons);
    expect(ru.deliveryTraffic.chart.receiveBounceReasons).not.toBe(en.deliveryTraffic.chart.receiveBounceReasons);
  });
});
