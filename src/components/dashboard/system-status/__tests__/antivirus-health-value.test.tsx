import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AVStatusResponse } from '@/types/attachment-security';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string, params?: Record<string, string>) => `${key}${params ? ': ' + Object.values(params).join(', ') : ''}` }));
vi.mock('@/components/statistics/security-overview/hooks/useSecurityScope', () => ({ useSecurityScope: () => ({ scopedRequest: vi.fn() }) }));
vi.mock('../dashboard-card-footer-link', () => ({ DashboardCardFooterLink: () => null }));
import { AntivirusHealthValue } from '../system-health-card';

afterEach(cleanup);
const status: AVStatusResponse = {
  configured: true,
  metadata_status: 'collected',
  engines: [{ server: 'av:6600', engine_type: 7, engine: 'ClamAV', version: '1.4.3', database_version: '27800', engine_status: 'collected', version_status: 'collected', database_version_status: 'collected' }],
};
describe('GT-12346 current antivirus metadata', () => {
  it('keeps the summary compact and reveals collected versions on click', async () => {
    const user = userEvent.setup();
    render(<AntivirusHealthValue status={status} />);
    expect(screen.getByText('ClamAV')).toBeVisible();
    expect(screen.queryByText('1.4.3')).toBeNull();
    await user.click(screen.getByTestId('system-status-health-av-trigger'));
    const details = screen.getByTestId('system-status-health-av-details');
    expect(within(details).getByText('1.4.3')).toBeVisible();
    expect(within(details).getByText('27800')).toBeVisible();
    expect(screen.queryByText('av:6600')).toBeNull();
    expect(details).not.toHaveTextContent('avExpiry');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('system-status-health-av-details')).not.toBeInTheDocument();
      expect(screen.getByTestId('system-status-health-av-trigger')).toHaveFocus();
    });
  });
  it('retains healthy metadata alongside a failed server without exposing addresses', async () => {
    const user = userEvent.setup();
    render(<AntivirusHealthValue status={{ ...status, metadata_status: 'partial', engines: [...status.engines!, { server: 'failed:6600', engine_type: -1, engine_status: 'collection_error', version_status: 'collection_error', database_version_status: 'collection_error' }] }} />);
    expect(screen.getByText('avPartial')).toBeVisible();
    await user.click(screen.getByTestId('system-status-health-av-trigger'));
    expect(screen.getByText('ClamAV')).toBeVisible();
    expect(screen.getByText('avQueryFailedShort')).toBeVisible();
    expect(screen.queryByText('failed:6600')).toBeNull();
  });
  it('shows only query failed for a failed configured server, distinct from unconfigured', () => {
    const view = render(<AntivirusHealthValue status={{ configured: true, metadata_status: 'collection_error', engines: [{ server: 'failed:6600', engine_type: -1, engine_status: 'collection_error', version_status: 'collection_error', database_version_status: 'collection_error' }] }} />);
    expect(view.container).toHaveTextContent(/^avQueryFailedShort$/);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<AntivirusHealthValue status={null} />);
    expect(view.container).toHaveTextContent(/^avQueryFailedShort$/);
    view.rerender(<AntivirusHealthValue status={{ configured: false }} />);
    expect(view.container).toHaveTextContent(/^notConfigured$/);
  });
  it('supports an older summary with only an engine name', () => {
    const view = render(<AntivirusHealthValue vendor="ClamAV" />);
    expect(view.container).toHaveTextContent(/^ClamAV$/);
  });
});
