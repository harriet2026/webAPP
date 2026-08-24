import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import zh from '@/../messages/zh.json';
import { KpiCards } from './kpi-cards';

describe('phishing KPI cards', () => {
  it('renders the sixth hit-rate card with the established metric definition', () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <KpiCards
          stats={{ today_detected: 80, today_quarantined: 12, pending_review: 3, today_recalled: 4, recall_success: 2 }}
          hitRate={0.125}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('检出率')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByLabelText(/检出率表示已分析样本中/)).toBeInTheDocument();
  });
});
