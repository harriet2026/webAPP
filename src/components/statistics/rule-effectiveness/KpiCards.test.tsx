import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import zh from '@/../messages/zh.json';
import { KpiCards } from './KpiCards';

// GT-14083：按原型恢复指标文案；观察策略数移至明细表头，KPI 保留其余三个指标。
describe('rule effectiveness KPI card titles', () => {
  it('uses the prototype KPI names in zh', () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <KpiCards
          data={{
            observing_count: 4, observing_count_delta: null, total_hits: 9, total_hits_delta: null,
            avg_observed_days: 23, pending_review_count: 0,
          } as never}
          isLoading={false}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByTestId('rule-effectiveness-kpi-card-observingCount')).not.toBeInTheDocument();
    expect(screen.getByTestId('rule-effectiveness-kpi-card-totalHits')).toHaveTextContent('总命中数');
    expect(screen.getByTestId('rule-effectiveness-kpi-card-avgObservedDays')).toHaveTextContent('平均观察时长');
    expect(screen.getByTestId('rule-effectiveness-kpi-card-pendingReviewCount')).toHaveTextContent('待转正策略数');
  });
});
