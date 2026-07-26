import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { TrendData } from '@/lib/api/security-overview';

// GT-11888: 产品要求「邮件安全总览」去掉「威胁等级」数据统计模块。
// 该视角原本出现在三处：趋势图的视角 Tab、明细表（跟随 Tab）、打印报告的分节。
// 这里同时守住「Tab 不再渲染」「视角清单不再包含它」「i18n 文案已删干净」三层，
// 任一处回潮都会红。

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
const trend = { threat_type: [], action: [], delivery_result: [], email_type: [] } as unknown as TrendData;

const LOCALES = ['zh', 'en', 'th', 'ru'] as const;

function loadMessages(locale: string): Record<string, unknown> {
  const file = path.join(process.cwd(), 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

describe('security-overview: 威胁等级 statistics module removed (GT-11888)', () => {
  it('trend card renders no 威胁等级 view-by tab', () => {
    const { container } = render(createElement(TrendChartCard, {
      trend, isLoading: false, viewBy: 'threat_type' as const,
      onViewByChange: vi.fn(), hiddenSeries: new Set<string>(), onToggleSeries: vi.fn(),
    }));
    const tabs = Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(tabs).not.toContain('viewBy.threat_level');
    // PRD v3 收敛为两视角（邮件类型 / 处置动作）——threat_type 也随威胁等级一并下线,
    // 现存视角即 SECURITY_OVERVIEW_VIEW_OPTIONS = ['email_type','action']。
    expect(tabs).toEqual(['viewBy.email_type', 'viewBy.action']);
  });

  it('neither the page nor the print report lists threat_level as a view', () => {
    expect(TREND_VIEW_BY_OPTIONS).not.toContain('threat_level');
    expect(PRINT_VIEW_BY_OPTIONS).not.toContain('threat_level');
    expect(TREND_VIEW_BY_OPTIONS.length).toBeGreaterThan(0);
    expect(PRINT_VIEW_BY_OPTIONS.length).toBeGreaterThan(0);
  });

  it('drops the threat-level labels and colors from every locale', () => {
    for (const locale of LOCALES) {
      const so = loadMessages(locale).securityOverview as Record<string, unknown>;
      expect(so, `${locale} securityOverview`).toBeTruthy();
      expect(so.threatLevels, `${locale} securityOverview.threatLevels`).toBeUndefined();
      expect(Object.keys(so.viewBy as object), `${locale} securityOverview.viewBy`).not.toContain('threat_level');
    }
    // The 5 level series colors only ever fed the threat_level view.
    for (const key of ['low', 'medium', 'high', 'critical']) {
      expect(SERIES_COLORS[key], `SERIES_COLORS.${key}`).toBeUndefined();
    }
  });
});
