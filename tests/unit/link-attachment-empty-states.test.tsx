import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { DistItem, LinkTrendPoint } from '@/lib/api/link-attachment-security';

// GT-11996: 链接分析/附件分析 Tab 的分布类图表在"有邮件但无恶意/威胁数据"时
// 显示为空白图表区。根因：后端 distMapToOrdered 恒按规范 key 零填充，返回的
// 数组永远非空（如 5 个链接类型全 0）；前端空态守卫仅判 `data.length === 0`，
// 永不触发，于是把全零数组交给 ECharts 渲染出无扇区的饼图/零长度条形图。
// 修复：空态判据改为"无正值"(sum of counts === 0)，并给恶意类卡片正确文案。
//
// next-intl mock 直接回传 key，故断言用 key 字面量。ReactECharts mock 成一个
// 带 data-testid 的占位 div，用它区分"渲染了图表" vs "渲染了空态文案"。

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/ui/card', () => {
  const div = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return { Card: div, CardContent: div, CardHeader: div, CardTitle: div };
});
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));
vi.mock('echarts-for-react', () => ({
  default: () => createElement('div', { 'data-testid': 'echart' }),
}));

import { LinkTypePieCard } from '@/components/statistics/link-attachment-security/LinkTypePieCard';
import { UrlReputationBarsCard } from '@/components/statistics/link-attachment-security/UrlReputationBarsCard';
import { AttachmentTypePieCard } from '@/components/statistics/link-attachment-security/AttachmentTypePieCard';
import { AttachmentThreatTypePieCard } from '@/components/statistics/link-attachment-security/AttachmentThreatTypePieCard';
import { TrendChartCard } from '@/components/statistics/link-attachment-security/TrendChartCard';

function zeroDist(keys: string[]): DistItem[] {
  return keys.map((key) => ({ key, count: 0, percent: 0 }));
}

const LINK_TYPE_KEYS = ['phishing', 'malware_download', 'spam', 'c2', 'qr_phishing'];
const REP_KEYS = ['high_risk', 'unknown', 'normal'];
const ATT_EXT_KEYS = ['exe', 'doc', 'xls', 'pdf', 'zip', 'other'];
const ATT_THREAT_KEYS = ['virus', 'macro', 'zip_bomb', 'exploit', 'other'];

function zeroTrend(date: string): LinkTrendPoint {
  return {
    date,
    total_link_mail: 0,
    malicious_link_mail: 0,
    phishing: 0,
    malware_download: 0,
    spam: 0,
    c2: 0,
    qr_phishing: 0,
  };
}

describe('GT-11996 link/attachment distribution empty-state (zero-filled data)', () => {
  it('LinkTypePieCard: all-zero counts show the no-malicious-link message, not a blank chart', () => {
    render(createElement(LinkTypePieCard, { data: zeroDist(LINK_TYPE_KEYS), isLoading: false }));
    expect(screen.queryByTestId('echart')).toBeNull();
    expect(screen.getByText('empty.noMaliciousLink')).toBeInTheDocument();
  });

  it('LinkTypePieCard: a positive count still renders the chart', () => {
    const data = zeroDist(LINK_TYPE_KEYS);
    data[0] = { key: 'phishing', count: 3, percent: 100 };
    render(createElement(LinkTypePieCard, { data, isLoading: false }));
    expect(screen.getByTestId('echart')).toBeInTheDocument();
  });

  it('UrlReputationBarsCard: all-zero counts show the no-clicks message, not a blank chart', () => {
    render(createElement(UrlReputationBarsCard, { data: zeroDist(REP_KEYS), isLoading: false }));
    expect(screen.queryByTestId('echart')).toBeNull();
    expect(screen.getByText('empty.noClicks')).toBeInTheDocument();
  });

  it('AttachmentTypePieCard: all-zero counts show the no-malicious-attachment message', () => {
    render(createElement(AttachmentTypePieCard, { data: zeroDist(ATT_EXT_KEYS), isLoading: false }));
    expect(screen.queryByTestId('echart')).toBeNull();
    expect(screen.getByText('empty.noMaliciousAttachment')).toBeInTheDocument();
  });

  it('AttachmentThreatTypePieCard: all-zero counts show the no-malicious-attachment message', () => {
    render(createElement(AttachmentThreatTypePieCard, { data: zeroDist(ATT_THREAT_KEYS), isLoading: false }));
    expect(screen.queryByTestId('echart')).toBeNull();
    expect(screen.getByText('empty.noMaliciousAttachment')).toBeInTheDocument();
  });

  it('TrendChartCard (link): buckets exist but total_link_mail all zero shows the no-link-mail message', () => {
    render(createElement(TrendChartCard, {
      trendLink: [zeroTrend('2026-07-01'), zeroTrend('2026-07-02')],
      viewTab: 'link' as const,
      chartType: 'line' as const,
      isLoading: false,
    }));
    expect(screen.queryByTestId('echart')).toBeNull();
    expect(screen.getByText('empty.noLinkMail')).toBeInTheDocument();
  });

  it('TrendChartCard (link): a positive total_link_mail still renders the chart', () => {
    const pt = zeroTrend('2026-07-01');
    pt.total_link_mail = 12;
    render(createElement(TrendChartCard, {
      trendLink: [pt],
      viewTab: 'link' as const,
      chartType: 'line' as const,
      isLoading: false,
    }));
    expect(screen.getByTestId('echart')).toBeInTheDocument();
  });
});
