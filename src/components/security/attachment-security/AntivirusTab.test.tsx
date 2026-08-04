import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { AntivirusTab } from './AntivirusTab';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getAntivirusStatus: vi.fn(),
  switcherEnabled: true,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ switcherEnabled: mocks.switcherEnabled }),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mocks.apiRequest }),
}));

vi.mock('@/lib/api/attachment-security', () => ({
  getAntivirusStatus: mocks.getAntivirusStatus,
  triggerAntivirusUpdate: vi.fn(),
}));

function renderTab() {
  render(
    <TooltipProvider>
      <AntivirusTab
        config={{ host: 'av-server', port: '6600' }}
        actions={{ virus_action: 'quarantine', timeout_action: 'accept' }}
        onChange={vi.fn()}
        onActionsChange={vi.fn()}
      />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mocks.switcherEnabled = true;
  mocks.getAntivirusStatus.mockReset();
  mocks.getAntivirusStatus.mockReturnValue(new Promise(() => {}));
});

describe('AntivirusTab product-form switcher gate', () => {
  it('hides AV server and virus database configuration when the switcher is disabled', () => {
    mocks.switcherEnabled = false;
    renderTab();

    expect(screen.queryByTestId('antivirus-server-config')).not.toBeInTheDocument();
    expect(screen.queryByTestId('antivirus-host')).not.toBeInTheDocument();
    expect(screen.queryByTestId('antivirus-port')).not.toBeInTheDocument();
    expect(screen.queryByTestId('antivirus-status-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('antivirus-update-now')).not.toBeInTheDocument();
    expect(screen.getByTestId('antivirus-virus-action')).toBeInTheDocument();
    expect(mocks.getAntivirusStatus).not.toHaveBeenCalled();
  });

  it('shows AV server and virus database configuration when the switcher is enabled', () => {
    renderTab();

    expect(screen.getByTestId('antivirus-server-config')).toBeInTheDocument();
    expect(screen.getByTestId('antivirus-host')).toHaveValue('av-server');
    expect(screen.getByTestId('antivirus-port')).toHaveValue('6600');
    expect(screen.getByTestId('antivirus-status-section')).toBeInTheDocument();
    expect(screen.getByTestId('antivirus-update-now')).toBeInTheDocument();
    expect(mocks.getAntivirusStatus).toHaveBeenCalledTimes(1);
  });
});
