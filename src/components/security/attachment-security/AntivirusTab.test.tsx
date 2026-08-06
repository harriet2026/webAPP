import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { AntivirusTab } from './AntivirusTab';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getAntivirusStatus: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mocks.apiRequest }),
}));

vi.mock('@/lib/api/attachment-security', () => ({
  getAntivirusStatus: mocks.getAntivirusStatus,
  triggerAntivirusUpdate: vi.fn(),
}));

function renderTab(hidePlatformConfig: boolean) {
  render(
    <TooltipProvider>
      <AntivirusTab
        config={{ host: 'av-server', port: '6600' }}
        actions={{ virus_action: 'quarantine', timeout_action: 'accept' }}
        onChange={vi.fn()}
        onActionsChange={vi.fn()}
        hidePlatformConfig={hidePlatformConfig}
      />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mocks.getAntivirusStatus.mockReset();
  mocks.getAntivirusStatus.mockReturnValue(new Promise(() => {}));
});

// GT-12754：平台两段（服务器配置 + 病毒库状态）按 hidePlatformConfig 门控——
// 多租户形态由 AttachmentSecurityPage 传 true（唯一入口改为平台安全策略 → 反病毒引擎），
// 单租户形态传 false 在本页内联展示。
describe('AntivirusTab platform-config gate', () => {
  it('hides AV server and virus database sections when platform-managed (multi-tenant)', () => {
    renderTab(true);

    expect(screen.queryByTestId('antivirus-server-fields')).not.toBeInTheDocument();
    expect(screen.queryByTestId('antivirus-host')).not.toBeInTheDocument();
    expect(screen.queryByTestId('antivirus-port')).not.toBeInTheDocument();
    expect(screen.queryByTestId('antivirus-status-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('antivirus-update-now')).not.toBeInTheDocument();
    expect(screen.getByTestId('antivirus-virus-action')).toBeInTheDocument();
    expect(mocks.getAntivirusStatus).not.toHaveBeenCalled();
  });

  it('shows AV server and virus database sections inline for single-tenant forms', () => {
    renderTab(false);

    expect(screen.getByTestId('antivirus-server-fields')).toBeInTheDocument();
    expect(screen.getByTestId('antivirus-host')).toHaveValue('av-server');
    expect(screen.getByTestId('antivirus-port')).toHaveValue('6600');
    expect(screen.getByTestId('antivirus-status-section')).toBeInTheDocument();
    expect(screen.getByTestId('antivirus-update-now')).toBeInTheDocument();
    expect(mocks.getAntivirusStatus).toHaveBeenCalledTimes(1);
  });
});
