import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Smoke-test for Task D2: table + toolbar + add/edit Sheet, immediate CRUD,
// region auto-fill dirty-gating, inline validation. In-app visual verification
// via Playwright is deferred to D3/E2 (component isn't routed standalone yet).

const mockListGeoIpRules = vi.fn();
const mockCreateGeoIpRule = vi.fn();
const mockUpdateGeoIpRule = vi.fn();
const mockDeleteGeoIpRule = vi.fn();
const mockListGeoCountries = vi.fn();
const mockExportGeoIpRules = vi.fn();

vi.mock('@/lib/api/geoip-rules', async (importOriginal) => ({
  // filterGeoCountries / geoCountryDisplayName / COMMON_GEO_COUNTRY_CODES
  // 是纯函数/常量，用真实实现（mock 成恒真会让本组测试测不到过滤行为）。
  ...(await importOriginal<typeof import('@/lib/api/geoip-rules')>()),
  listGeoIpRules: (...args: unknown[]) => mockListGeoIpRules(...args),
  createGeoIpRule: (...args: unknown[]) => mockCreateGeoIpRule(...args),
  updateGeoIpRule: (...args: unknown[]) => mockUpdateGeoIpRule(...args),
  deleteGeoIpRule: (...args: unknown[]) => mockDeleteGeoIpRule(...args),
  listGeoCountries: (...args: unknown[]) => mockListGeoCountries(...args),
  exportGeoIpRules: (...args: unknown[]) => mockExportGeoIpRules(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, string>) => {
    const full = ns ? `${ns}.${key}` : key;
    if (params) return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, v), full);
    return full;
  },
  useLocale: () => 'zh',
}));

// cmdk 的 CommandItem 会调 scrollIntoView，jsdom 没有实现
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const countriesFixture = {
  items: [
    { code: 'CN', name_zh: '中国', name_en: 'China' },
    { code: 'US', name_zh: '美国', name_en: 'United States' },
    { code: 'BR', name_zh: '巴西', name_en: 'Brazil' },
  ],
};

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GeoIpLibraryTable } from '@/components/security/GeoIpLibraryTable';
import { toast as toastMock } from 'sonner';

const rule1 = {
  id: 1,
  ip_range: '8.8.8.0/24',
  region_code: 'US',
  region_name: 'Google DNS',
  updated_at: '2026-01-15T14:30:00Z',
};
const rule2 = {
  id: 2,
  ip_range: '114.114.0.0/16',
  region_code: 'CN',
  region_name: '114DNS',
  updated_at: '2026-01-14T09:15:00Z',
};

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderTable() {
  const qc = createQueryClient();
  return render(createElement(QueryClientProvider, { client: qc }, createElement(GeoIpLibraryTable)));
}

describe('GeoIpLibraryTable (D2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGeoIpRules.mockResolvedValue({ items: [rule1, rule2], total: 2, page: 1, page_size: 10 });
    mockCreateGeoIpRule.mockResolvedValue({ ...rule1, id: 3 });
    mockUpdateGeoIpRule.mockResolvedValue(rule1);
    mockDeleteGeoIpRule.mockResolvedValue(undefined);
    mockListGeoCountries.mockResolvedValue(countriesFixture);
  });

  it('renders rows with ip_range / region_code badge / region_name', async () => {
    renderTable();
    await waitFor(() => {
      expect(screen.getByText('8.8.8.0/24')).toBeInTheDocument();
    });
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('Google DNS')).toBeInTheDocument();
    expect(screen.getByText('114.114.0.0/16')).toBeInTheDocument();
  });

  it('shows the empty state without a duplicate create-now button when there are no rules', async () => {
    mockListGeoIpRules.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 });
    renderTable();
    await waitFor(() => {
      expect(screen.getByText('geoipLibrary.emptyText')).toBeInTheDocument();
    });
    expect(screen.queryByText('geoipLibrary.createNow')).not.toBeInTheDocument();
    expect(screen.getByText('geoipLibrary.createRule')).toBeInTheDocument();
  });

  it('resets page to 1 and passes search to the query', async () => {
    renderTable();
    await waitFor(() => expect(screen.getByText('8.8.8.0/24')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('geoipLibrary.searchPlaceholder');
    fireEvent.change(searchInput, { target: { value: 'google' } });

    await waitFor(() => {
      expect(mockListGeoIpRules).toHaveBeenLastCalledWith({ page: 1, page_size: 10, search: 'google' });
    });
  });

  it('opens the add Sheet, validates required fields, then creates immediately and invalidates', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitFor(() => expect(screen.getByText('8.8.8.0/24')).toBeInTheDocument());

    fireEvent.click(screen.getByText('geoipLibrary.createRule'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const dialog = screen.getByRole('dialog');
    // GT-12103 (bf60abd5) 起改为"非法/缺地区时保存按钮禁用"来杜绝非法入库，
    // 空表单不再是"点保存出行内错误"而是根本点不了保存——按当前设计断言。
    const saveButton = within(dialog).getByText('common.save').closest('button')!;
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(mockCreateGeoIpRule).not.toHaveBeenCalled();

    const ipInput = within(dialog).getByPlaceholderText('geoipLibrary.ipRangePlaceholder');
    fireEvent.change(ipInput, { target: { value: '1.2.3.0/24' } });

    // Region select (Base UI, needs full pointer-event sequence via user-event):
    // pick US -> region name auto-fills to the country label (dirty gate false).
    await user.click(within(dialog).getByRole('combobox'));
    const usOption = await screen.findByRole('option', { name: /US/ });
    await user.click(usOption);

    const regionNameInput = within(dialog).getByPlaceholderText('geoipLibrary.regionNamePlaceholder') as HTMLInputElement;
    // GT-12114 Q-03：归属地自动回填改用后端字典名（zh locale -> name_zh）
    await waitFor(() => expect(regionNameInput.value).toBe('美国'));

    fireEvent.click(within(dialog).getByText('common.save'));

    await waitFor(() => {
      expect(mockCreateGeoIpRule).toHaveBeenCalledWith({
        ip_range: '1.2.3.0/24',
        region_code: 'US',
        region_name: '美国',
      });
    });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('common.saveSuccess'));
    // Sheet closes on success.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens the edit Sheet prefilled and dirty-gates region-name auto-fill', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitFor(() => expect(screen.getByText('8.8.8.0/24')).toBeInTheDocument());

    const row = screen.getByText('8.8.8.0/24').closest('tr')!;
    fireEvent.click(within(row).getAllByRole('button')[0]);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    const regionNameInput = within(dialog).getByPlaceholderText('geoipLibrary.regionNamePlaceholder') as HTMLInputElement;
    expect(regionNameInput.value).toBe('Google DNS');

    // Editing an existing rule marks regionDirty=true already, so switching
    // region code must NOT clobber the existing region name.
    await user.click(within(dialog).getByRole('combobox'));
    const cnOption = await screen.findByRole('option', { name: /CN/ });
    await user.click(cnOption);
    await waitFor(() => expect(within(dialog).getByRole('combobox')).toHaveTextContent(/CN/));
    expect(regionNameInput.value).toBe('Google DNS');

    fireEvent.click(within(dialog).getByText('common.save'));
    await waitFor(() => {
      expect(mockUpdateGeoIpRule).toHaveBeenCalledWith(1, {
        ip_range: '8.8.8.0/24',
        region_code: 'CN',
        region_name: 'Google DNS',
      });
    });
  });

  it('deletes a rule after confirmation', async () => {
    renderTable();
    await waitFor(() => expect(screen.getByText('8.8.8.0/24')).toBeInTheDocument());

    const row = screen.getByText('8.8.8.0/24').closest('tr')!;
    fireEvent.click(within(row).getAllByRole('button')[1]);

    await waitFor(() => expect(screen.getByText('common.confirmDelete')).toBeInTheDocument());
    fireEvent.click(screen.getByText('common.confirm'));

    await waitFor(() => {
      expect(mockDeleteGeoIpRule).toHaveBeenCalledWith(1);
    });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('common.deleteSuccess'));
  });
});

// GT-12114 Q-08：产品拍板在 GeoIP 规则配置区增加私网地址不触发 GeoIP 判定的
// 提示文案（RFC1918 私网段没有地理归属，管理员应改用 IP 黑白名单处理私网）。
describe('GeoIpLibraryTable GT-12114 Q-08 私网地址提示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGeoIpRules.mockResolvedValue({ items: [rule1], total: 1, page: 1, page_size: 10 });
    mockListGeoCountries.mockResolvedValue(countriesFixture);
  });

  it('列表区展示私网地址不触发 GeoIP 判定的提示', async () => {
    renderTable();
    await waitFor(() => {
      expect(screen.getByText('8.8.8.0/24')).toBeInTheDocument();
    });
    expect(screen.getByText('geoipLibrary.privateIpNote')).toBeInTheDocument();
  });
});

// GT-12114 Q-03/Q-07：可搜索地区下拉与导出
describe('GeoIpLibraryTable GT-12114 Q-03 搜索补全 / Q-07 导出', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGeoIpRules.mockResolvedValue({ items: [rule1], total: 1, page: 1, page_size: 10 });
    mockListGeoCountries.mockResolvedValue(countriesFixture);
    mockExportGeoIpRules.mockResolvedValue(new Blob(['{}'], { type: 'application/json' }));
  });

  it('地区下拉可按名称搜索到非常用国家（BR 不在常用20但可搜到）', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitFor(() => expect(screen.getByText('8.8.8.0/24')).toBeInTheDocument());
    fireEvent.click(screen.getByText('geoipLibrary.createRule'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('combobox'));
    const input = await screen.findByPlaceholderText('geoipLibrary.searchCountry');
    await user.type(input, '巴西');
    const brOption = await screen.findByRole('option', { name: /巴西 \(BR\)/ });
    await user.click(brOption);
    // 选中回填：触发器显示 BR，归属地自动填充字典名
    await waitFor(() => expect(within(dialog).getByRole('combobox')).toHaveTextContent('巴西 (BR)'));
    const regionNameInput = within(dialog).getByPlaceholderText('geoipLibrary.regionNamePlaceholder') as HTMLInputElement;
    expect(regionNameInput.value).toBe('巴西');
  });

  it('导出菜单提供 JSON/CSV，点击后调用导出接口', async () => {
    const user = userEvent.setup();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    try {
      renderTable();
      await waitFor(() => expect(screen.getByText('8.8.8.0/24')).toBeInTheDocument());
      await user.click(screen.getByText('common.export'));
      const jsonItem = await screen.findByText('geoipLibrary.exportJSON');
      expect(screen.getByText('geoipLibrary.exportCSV')).toBeInTheDocument();
      await user.click(jsonItem);
      await waitFor(() => expect(mockExportGeoIpRules).toHaveBeenCalledWith('json'));
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });
});
