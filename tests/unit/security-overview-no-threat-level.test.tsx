import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { TrendData } from '@/lib/api/security-overview';

// The page and print report expose only 威胁态势趋势 / 执行动作. The other
// dimensions remain wire-compatible but are not user-facing tabs.

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/ui/card', () => {
  const div = ({ children }: { children?: React.ReactNode }) => createElement('div', null, children);
  return { Card: div, CardContent: div, CardHeader: div, CardTitle: div };
});
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));
vi.mock('@/components/ui/tabs', () => {
  const div = ({ children }: { children?: React.ReactNode }) => createElement('div', null, children);
  return {
    Tabs: div, TabsList: div,
    TabsTrigger: ({ children }: { children?: React.ReactNode }) => createElement('button', null, children),
  };
});
vi.mock('@/components/shared/smart-summary-badge', () => ({
  SmartSummaryBadge: ({ children }: { children?: React.ReactNode }) => createElement('span', null, children),
}));

import { TrendChartCard } from '@/components/statistics/security-overview/TrendChartCard';
import { TREND_VIEW_BY_OPTIONS, PRINT_VIEW_BY_OPTIONS, SERIES_COLORS } from '@/components/statistics/security-overview/constants';

// Empty series everywhere: with no data rows the card renders no legend buttons,
// so every <button> in the DOM is a view-by Tab.
const trend = { threat_type: [], action: [], threat_level: [], delivery_result: [], email_type: [] } as unknown as TrendData;

const LOCALES = ['zh', 'en', 'th', 'ru'] as const;

function loadMessages(locale: string): Record<string, unknown> {
  const file = path.join(process.cwd(), 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

describe('security-overview: two user-facing perspectives', () => {
  it('trend card renders only the two source view-by tabs', () => {
    const { container } = render(createElement(TrendChartCard, {
      trend, isLoading: false, viewBy: 'threat_type' as const,
      onViewByChange: vi.fn(), hiddenSeries: new Set<string>(), onToggleSeries: vi.fn(),
    }));
    const tabs = Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(tabs).toEqual([
      'viewBy.email_type',
      'viewBy.action',
    ]);
  });

  it('keeps the interactive page and print report on the same two views', () => {
    const expected = ['email_type', 'action'];
    expect(TREND_VIEW_BY_OPTIONS).toEqual(expected);
    expect(PRINT_VIEW_BY_OPTIONS).toEqual(expected);
  });

  it('ships threat-level labels and semantic colors in every locale', () => {
    for (const locale of LOCALES) {
      const so = loadMessages(locale).securityOverview as Record<string, unknown>;
      expect(so, `${locale} securityOverview`).toBeTruthy();
      expect(so.threatLevels, `${locale} securityOverview.threatLevels`).toBeTruthy();
      expect(Object.keys(so.viewBy as object), `${locale} securityOverview.viewBy`).toContain('threat_level');
    }
    for (const key of ['low', 'medium', 'high', 'critical']) {
      expect(SERIES_COLORS[key], `SERIES_COLORS.${key}`).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
