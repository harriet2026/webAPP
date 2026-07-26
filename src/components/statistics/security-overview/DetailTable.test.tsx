import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DetailTable } from './DetailTable';
import { NON_SERIES_KEYS } from '@/lib/api/security-overview';

// Render the real zh labels so a missing key shows up as the raw key path, the
// way next-intl behaves in the browser (it does not throw — it renders the key).
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const dict: Record<string, string> = {
      'table.date': '日期',
      'table.total': '过滤邮件总量',
      'table.blockRate': '拦截率',
      'table.change': '环比变化',
      'threatTypes.phishing': '钓鱼',
      'threatTypes.virus': '病毒',
      'emailTypes.normal': '正常',
      'emailTypes.subscription': '订阅资讯',
      'emailTypes.advertising': '广告邮件',
      'emailTypes.spam': '垃圾邮件',
      'emailTypes.harmful': '有害内容邮件',
      'emailTypes.suspicious': '可疑邮件',
      'emailTypes.sensitive': '敏感内容邮件',
      'emailTypes.spoofing': '仿冒邮件',
      'emailTypes.phishing': '钓鱼邮件',
      'emailTypes.virus': '病毒邮件',
      'emailTypes.account_compromised': '账号被盗',
      'detailTitle': '明细表',
    };
    return (key: string) => dict[key] ?? `${ns}.${key}`;
  },
}));

// One day of threat_type detail: two real series plus the three backend summary
// fields the ticket says were being rendered as series columns.
const data = {
  threat_type: [
    { date: '2026-07-01', phishing: 30, virus: 10, total: 40, block_rate: 25, change: -5, change_pct: -12.5 },
  ],
} as never;

describe('DetailTable summary columns (GT-11934)', () => {
  it('treats total/block_rate/change/change_pct as non-series keys', () => {
    // Guards the root cause directly: if these fall out of NON_SERIES_KEYS they
    // become "series" again and get sent through the threatTypes.* i18n lookup.
    expect(NON_SERIES_KEYS.has('total')).toBe(true);
    expect(NON_SERIES_KEYS.has('block_rate')).toBe(true);
    expect(NON_SERIES_KEYS.has('change')).toBe(true);
    expect(NON_SERIES_KEYS.has('change_pct')).toBe(true);
  });

  it('renders localized summary headers, not raw i18n keys', () => {
    render(<DetailTable data={data} isLoading={false} viewBy="threat_type" />);

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());

    // The reported symptom: the console logged
    //   MISSING_MESSAGE: securityOverview.threatTypes.block_rate
    // and the header printed the raw key.
    expect(headers).not.toContain('block_rate');
    expect(headers).not.toContain('change');
    expect(headers).not.toContain('total');
    expect(headers.some((h) => h?.includes('threatTypes.'))).toBe(false);

    expect(headers).toContain('过滤邮件总量');
    expect(headers).toContain('拦截率');
    expect(headers).toContain('环比变化');
  });

  it('renders `change_pct` as a signed percentage', () => {
    const rows = {
      threat_type: [
        { date: '2026-07-01', phishing: 30, virus: 10, total: 40, block_rate: 25, change: 8, change_pct: 20 },
      ],
    } as never;
    render(<DetailTable data={rows} isLoading={false} viewBy="threat_type" />);

    const row = screen.getByText('2026-07-01').closest('tr')!;
    expect(within(row).getByText('+20.0%')).toBeInTheDocument();
    expect(within(row).queryByText('+8')).not.toBeInTheDocument();
  });

  it('renders the email-type columns in the page contract order', () => {
    const rows = {
      email_type: [{
        date: '2026-07-01',
        account_compromised: 1,
        advertising: 2,
        harmful: 3,
        normal: 4,
        phishing: 5,
        sensitive: 6,
        spam: 7,
        spoofing: 8,
        subscription: 9,
        suspicious: 10,
        virus: 11,
        total: 66,
        block_rate: 98.5,
        change: 6,
        change_pct: 10,
      }],
    } as never;

    render(<DetailTable data={rows} isLoading={false} viewBy="email_type" />);

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.trim());
    expect(headers).toEqual([
      '', '日期', '过滤邮件总量', '正常', '订阅资讯', '垃圾邮件', '广告邮件', '有害内容邮件',
      '钓鱼邮件', '账号被盗', '可疑邮件', '仿冒邮件', '病毒邮件', '敏感内容邮件', '拦截率', '环比变化',
    ]);
  });

  it('shows the backend block_rate, not a rate recomputed over the summary fields', () => {
    render(<DetailTable data={data} isLoading={false} viewBy="threat_type" />);

    const row = screen.getByText('2026-07-01').closest('tr')!;
    // Backend says 25%. The old code summed every "dynamic" key into the
    // denominator — phishing+virus+total+block_rate+change = 30+10+40+25-5 = 100
    // — and had no 'block' series at all, so it rendered 0.0%.
    expect(within(row).getByText('25.0%')).toBeInTheDocument();
    expect(within(row).queryByText('0.0%')).not.toBeInTheDocument();
    // Total comes straight from the backend field.
    expect(within(row).getByText('40')).toBeInTheDocument();
  });
});
