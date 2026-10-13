import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import zh from '@/../messages/zh.json';
import { KpiCards } from './kpi-cards';

describe('phishing KPI cards', () => {
  it('shows only the five primary metrics without secondary totals or hit rate', () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <KpiCards
          stats={{ today_detected: 80, today_quarantined: 12, pending_review: 3, today_recalled: 4, recall_success: 2, next_business_day_at: '2026-09-25T00:00:00Z' }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByTestId('phishing-kpi-hit_rate')).not.toBeInTheDocument();
    expect(screen.queryByText('检出率')).not.toBeInTheDocument();
    for (const label of ['总隔离', '总审核', '总召回', '总召回成功']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    for (const [key, label, value] of [
      ['today_detected', '今日检测', '80'],
      ['today_quarantined', '今日隔离', '12'],
      ['pending_review', '待审核', '3'],
      ['today_recalled', '今日召回', '4'],
      ['recall_success', '召回成功', '2'],
    ]) {
      expect(within(screen.getByTestId(`phishing-kpi-${key}`)).getByText(label)).toBeInTheDocument();
      expect(screen.getByTestId(`phishing-metric-value-${key}`)).toHaveTextContent(String(value));
    }
    expect(screen.getByTestId('phishing-kpi-today_detected').parentElement).toHaveClass('xl:grid-cols-5');
    expect(screen.getByTestId('phishing-kpi-today_detected')).toHaveTextContent(/^今日检测80$/);
  });
});
