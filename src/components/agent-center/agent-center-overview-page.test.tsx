import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CollaborationOverview } from './agent-center-overview-page';

const labels: Record<string, string> = {
  'collaboration.title': '协作总览',
  'collaboration.description': '当前显示的已开通智能体使用智能分析层。',
  'collaboration.phishing.title': '钓鱼检测',
  'collaboration.phishing.body': '钓鱼说明',
  'collaboration.spoofing.title': '仿冒检测',
  'collaboration.spoofing.body': '仿冒说明',
  'collaboration.threat-retro.title': '威胁回溯',
  'collaboration.threat-retro.body': '回溯说明',
};

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => labels[key] ?? key,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe('CollaborationOverview', () => {
  it('renders only agents enabled for the current tenant', () => {
    render(<CollaborationOverview agents={['phishing']} />);

    expect(screen.getByTestId('agent-center-collaboration-phishing')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-center-collaboration-spoofing')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-center-collaboration-threat-retro')).not.toBeInTheDocument();
    expect(screen.getByText('当前显示的已开通智能体使用智能分析层。')).toBeInTheDocument();
  });
});
