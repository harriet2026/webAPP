import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ switcherEnabled: false }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/contexts/product-form-context', () => ({ useProductForm: () => state }));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isTenantAdmin: true, isSystemAdmin: false, user: { tenant_id: 3 } }),
}));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
  useScopedApiRequest: () => ({ apiRequest: vi.fn() }),
}));
vi.mock('@/components/organization/api', () => ({
  useContactSources: () => ({ data: { items: [], total: 0 }, refetch: vi.fn() }),
  useContactSourceMutations: () => ({ sync: {}, remove: {}, setAutoSync: {} }),
}));

import { DataSourceFormSheet } from '@/components/organization/DataSourceFormSheet';
import { DataSourceTab } from '@/components/organization/DataSourceTab';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GT-12170 网易通讯录入口', () => {
  for (const enabled of [false, true]) {
    it(`产品形态切换器 ${enabled ? '开启' : '关闭'} 时新增类型列表正确`, async () => {
      state.switcherEnabled = enabled;
      const user = userEvent.setup();
      render(<DataSourceFormSheet open onOpenChange={() => {}} existingNames={[]} />);
      await user.click(screen.getByTestId('contacts-source-form-type'));
      for (const label of ['typeLdap', 'typeCoremail', 'typeCsv']) {
        expect(await screen.findByRole('option', { name: label })).toBeVisible();
      }
      expect(screen.queryByRole('option', { name: 'typeNeteml' }) !== null).toBe(enabled);
    });

    it(`产品形态切换器 ${enabled ? '开启' : '关闭'} 时筛选类型列表正确`, async () => {
      state.switcherEnabled = enabled;
      const user = userEvent.setup();
      render(<DataSourceTab />);
      await user.click(screen.getByTestId('contacts-source-filter'));
      await user.click(screen.getByTestId('contacts-source-filter-type'));
      for (const label of ['filterAll', 'typeLdap', 'typeCoremail', 'typeCsv']) {
        expect(await screen.findByRole('option', { name: label })).toBeVisible();
      }
      expect(screen.queryByRole('option', { name: 'typeNeteml' }) !== null).toBe(enabled);
    });
  }
});

describe('GT-13698 CSV 模板与新版导入流程', () => {
  it('保留双文件上传入口，并在浏览器内生成模板下载以避免额外 HTTPS 请求', async () => {
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return 'blob:contact-template';
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const downloads: Array<{ href: string; filename: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      downloads.push({ href: this.href, filename: this.download });
    });
    const user = userEvent.setup();
    render(<DataSourceFormSheet open onOpenChange={() => {}} existingNames={[]} />);
    await user.click(screen.getByTestId('contacts-source-form-type'));
    await user.click(await screen.findByTestId('contacts-source-form-type-option-csv'));
    await user.click(screen.getByRole('button', { name: 'csvUserTemplate' }));
    await user.click(screen.getByRole('button', { name: 'csvDeptTemplate' }));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(createObjectURL.mock.calls.map(([blob]) => (blob as Blob).type)).toEqual([
      'text/csv;charset=utf-8',
      'text/csv;charset=utf-8',
    ]);
    expect(downloads).toEqual([
      { href: 'blob:contact-template', filename: 'contacts-users.csv' },
      { href: 'blob:contact-template', filename: 'contacts-departments.csv' },
    ]);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('contacts-source-form-csv-file')).toHaveAttribute('type', 'file');
    expect(screen.getByTestId('contacts-source-form-csv-dept-file')).toHaveAttribute('type', 'file');
    expect(screen.getByTestId('contacts-csv-upload')).toBeDisabled();
  });
});
