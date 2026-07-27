import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailTable } from './DetailTable';
import type { AttachmentDetailRow, LinkDetailRow } from '@/lib/api/link-attachment-security';

const messages: Record<string, string> = {
  detailTitle: '明细数据',
  'table.date': '日期',
  'table.totalLinkMail': '含链接邮件总量',
  'table.safeLinkMail': '安全链接邮件',
  'table.maliciousLinkMail': '恶意链接邮件',
  'table.phishingLink': '钓鱼链接',
  'table.malwareDownload': '恶意软件下载',
  'table.cAndCCommunication': 'C&C通信',
  'table.spamPromotion': '垃圾推广',
  'table.totalAttachmentMail': '含附件邮件总量',
  'table.safeAttachmentMail': '安全附件邮件',
  'table.maliciousAttachmentMail': '恶意附件邮件',
  'table.virusAttachment': '病毒附件',
  'table.macroDocument': '宏文档',
  'table.zipBomb': '压缩包炸弹',
  'table.exploit': '漏洞利用',
  'table.blockRate': '拦截率',
  'table.blockRateHelp': '帮助',
  'table.change': '环比变化',
  'table.expandRow': '展开 {date} 的威胁分布',
  'table.collapseRow': '收起 {date} 的威胁分布',
  'table.threatDistribution': '威胁类型分布',
  'linkType.phishing': '钓鱼链接',
  'linkType.malware_download': '恶意软件下载',
  'linkType.spam': '垃圾推广',
  'linkType.c2': 'C2通信',
  'linkType.qr_phishing': '二维码钓鱼',
  'attachmentThreatType.virus': '病毒附件',
  'attachmentThreatType.macro': '宏文档',
  'attachmentThreatType.zip_bomb': '压缩包炸弹',
  'attachmentThreatType.exploit': '漏洞利用',
  'attachmentThreatType.other': '其他恶意',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const template = messages[key] ?? key;
    return Object.entries(values ?? {}).reduce(
      (result, [name, value]) => result.replace(`{${name}}`, value),
      template,
    );
  },
}));

vi.mock('echarts-for-react', () => ({
  default: () => <canvas data-testid="row-donut" />,
}));

const linkRow: LinkDetailRow = {
  date: '2026-07-25',
  total_link_mail: 100,
  safe_link_mail: 80,
  malicious_link_mail: 20,
  phishing: 8,
  malware_download: 4,
  c2: 3,
  spam: 4,
  qr_phishing: 1,
  block_rate: 98,
  change: 2,
};

const attachmentRow: AttachmentDetailRow = {
  date: '2026-07-25',
  total_attachment_mail: 80,
  safe_attachment_mail: 65,
  malicious_attachment_mail: 15,
  virus: 6,
  macro: 4,
  zip_bomb: 2,
  exploit: 2,
  other: 1,
  block_rate: 97.5,
  change: -1,
};

describe('link and attachment detail table tickets', () => {
  it('renders the exact ten link columns and toggles the row distribution', () => {
    render(
      <DetailTable
        linkRows={[linkRow]}
        attachmentRows={[attachmentRow]}
        viewTab="link"
        isLoading={false}
      />,
    );

    expect(screen.getAllByRole('columnheader').map((node) => node.textContent?.trim())).toEqual([
      '日期', '含链接邮件总量', '安全链接邮件', '恶意链接邮件', '钓鱼链接', '恶意软件下载',
      'C&C通信', '垃圾推广', '拦截率', '环比变化',
    ]);

    const dataRow = screen.getByText(linkRow.date).closest('tr')!;
    fireEvent.click(dataRow);
    expect(screen.getByTestId(`threat-distribution-link-${linkRow.date}`)).toBeVisible();
    expect(screen.getByRole('button', { name: `收起 ${linkRow.date} 的威胁分布` })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(dataRow);
    expect(screen.queryByTestId(`threat-distribution-link-${linkRow.date}`)).not.toBeInTheDocument();
  });

  it('renders the exact ten attachment columns and exposes all distribution categories', () => {
    render(
      <DetailTable
        linkRows={[linkRow]}
        attachmentRows={[attachmentRow]}
        viewTab="attachment"
        isLoading={false}
      />,
    );

    expect(screen.getAllByRole('columnheader').map((node) => node.textContent?.trim())).toEqual([
      '日期', '含附件邮件总量', '安全附件邮件', '恶意附件邮件', '病毒附件', '宏文档',
      '压缩包炸弹', '漏洞利用', '拦截率', '环比变化',
    ]);

    fireEvent.click(screen.getByText(attachmentRow.date).closest('tr')!);
    expect(screen.getByTestId(`threat-distribution-attachment-${attachmentRow.date}`)).toBeVisible();
    expect(screen.getByText('其他恶意')).toBeVisible();
  });
});
