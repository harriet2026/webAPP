import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultConfig } from '@/components/security/similar-detection/defaults';
import type { SimilarDetectionConfig } from '@/components/security/similar-detection/types';

const { mockApiRequest, mockToastSuccess, mockToastError, MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  }
  return {
    mockApiRequest: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
    MockApiError,
  };
});

// 与既有 similar-detection 单测一致：next-intl 恒等翻译，有 namespace 前缀原样返回 key。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode; [k: string]: unknown }) =>
    createElement('a', { href, ...props }, children),
}));

vi.mock('sonner', () => ({ toast: { success: mockToastSuccess, error: mockToastError } }));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, hasPermission: () => true, showAdvancedRules: false, user: { role: 'system_admin' } }),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
  apiRequest: mockApiRequest,
  ApiError: MockApiError,
}));

import { SimilarDetectionPage } from '@/components/security/similar-detection/SimilarDetectionPage';

function setupApi(cfg: Partial<SimilarDetectionConfig> = {}) {
  const full: SimilarDetectionConfig = { ...defaultConfig(), version: 3, ...cfg };
  mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
    if (path === '/security/similar-detection' && (!options || options.method === undefined || options.method === 'GET')) {
      return Promise.resolve(full);
    }
    if (path === '/security/similar-detection' && options?.method === 'PUT') {
      return Promise.resolve({ ...full, version: full.version + 1 });
    }
    // /security/modules 及其它未匹配路径回落默认值（ModuleMasterSwitch 视为已启用）
    return Promise.resolve({});
  });
  return full;
}

function renderPage(props: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  return render(<SimilarDetectionPage embedded onDirtyChange={props.onDirtyChange} />);
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
});

describe('SimilarDetectionPage', () => {
  it('默认渲染相似邮件 Tab + separate 模式三张方向卡 + 接收方向观察横幅', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('similar-detection-tab-similar-email')).toBeInTheDocument());
    expect(screen.getByTestId('similar-detection-card-receive')).toBeInTheDocument();
    expect(screen.getByTestId('similar-detection-card-send')).toBeInTheDocument();
    expect(screen.getByTestId('similar-detection-card-internal')).toBeInTheDocument();
    // 默认配置里只有 receive 方向 observe_mode=true
    const banner = screen.getByTestId('similar-detection-observe-banner');
    expect(banner).toBeInTheDocument();
    expect(within(banner).getByText('directionReceiveFull')).toBeInTheDocument();
  });

  it('切到相同主题 Tab：渲染主题标准化块 + 青/琥珀提示条', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('similar-detection-tab-same-subject')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('similar-detection-tab-same-subject'));
    expect(screen.getByText('subjectNormalization')).toBeInTheDocument();
    expect(screen.getByTestId('similar-detection-norm-ignoreCase')).toBeInTheDocument();
    expect(screen.getByTestId('similar-detection-norm-ignoreRePrefix')).toBeInTheDocument();
    expect(screen.getByTestId('similar-detection-norm-ignoreNumbers')).toBeInTheDocument();
    expect(screen.getByTestId('similar-detection-norm-similarSubject')).toBeInTheDocument();
    expect(screen.getByText('realtimeNote')).toBeInTheDocument();
    expect(screen.getByText('observeNote')).toBeInTheDocument();
    // 同主题 Tab 的观察横幅：receive(观察)+send(观察) 两个徽章
    const banner = screen.getByTestId('similar-detection-observe-banner');
    expect(within(banner).getByText('directionReceiveFull')).toBeInTheDocument();
    expect(within(banner).getByText('directionSendFull')).toBeInTheDocument();
  });

  it('切到聚合模式：单张聚合卡替代三张方向卡，隐藏方向复选行', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('similar-detection-mode-aggregate')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('similar-detection-mode-aggregate'));
    expect(screen.getByTestId('similar-detection-card-aggregate')).toBeInTheDocument();
    expect(screen.queryByTestId('similar-detection-card-receive')).toBeNull();
    expect(screen.queryByTestId('similar-detection-dir-receive')).toBeNull();
  });

  it('全部取消勾选方向：显示空态提示 atLeastOneDirection，卡片区消失', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('similar-detection-dir-receive')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('similar-detection-dir-receive'));
    await userEvent.click(screen.getByTestId('similar-detection-dir-send'));
    await userEvent.click(screen.getByTestId('similar-detection-dir-internal'));
    expect(screen.getByTestId('similar-detection-empty-hint')).toHaveTextContent('atLeastOneDirection');
    expect(screen.queryByTestId('similar-detection-card-receive')).toBeNull();
  });

  it('点击方向卡的同步按钮：立即把 source 配置复制到其他已启用方向，无需弹窗确认', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('similar-detection-sync-receive')).toBeInTheDocument());
    // receive 默认 observe_mode=true，其余为 false；同步后 send/internal 应变为 observe 态（amber 边框）
    await userEvent.click(screen.getByTestId('similar-detection-sync-receive'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('similar-detection-card-send').className).toContain('border-amber-300'));
    expect(screen.getByTestId('similar-detection-card-internal').className).toContain('border-amber-300');
  });

  it('保存前校验：窗口越界时阻止提交并提示 errorWindowRange', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('similar-detection-card-receive')).toBeInTheDocument());
    const windowInput = screen.getByTestId('similar-detection-card-receive').querySelectorAll('input[type="number"]')[0] as HTMLInputElement;
    await userEvent.clear(windowInput);
    await userEvent.type(windowInput, '9999');
    await userEvent.click(screen.getByTestId('similar-detection-save'));
    expect(mockToastError).toHaveBeenCalledWith('errorWindowRange');
    expect(mockApiRequest).not.toHaveBeenCalledWith('/security/similar-detection', expect.objectContaining({ method: 'PUT' }));
  });

  it('保存成功：dirty 后点击保存调用 PUT 并提示成功、清除 dirty 态', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('similar-detection-tab-same-subject')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('similar-detection-tab-same-subject'));
    await userEvent.click(screen.getByTestId('similar-detection-norm-ignoreNumbers'));
    expect(screen.getByTestId('similar-detection-save')).not.toBeDisabled();
    await userEvent.click(screen.getByTestId('similar-detection-save'));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(mockApiRequest).toHaveBeenCalledWith('/security/similar-detection', expect.objectContaining({ method: 'PUT' }));
    expect(screen.getByTestId('similar-detection-save')).toBeDisabled();
  });

  it('保存遇 409：提示 errorVersionConflict 并重新拉取配置', async () => {
    const full = setupApi();
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/security/similar-detection' && options?.method === 'PUT') {
        return Promise.reject(new MockApiError(409, 'conflict'));
      }
      if (path === '/security/similar-detection') return Promise.resolve(full);
      return Promise.resolve({});
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('similar-detection-tab-same-subject')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('similar-detection-tab-same-subject'));
    await userEvent.click(screen.getByTestId('similar-detection-norm-ignoreNumbers'));
    await userEvent.click(screen.getByTestId('similar-detection-save'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('errorVersionConflict'));
    expect(screen.getByTestId('similar-detection-save')).toBeDisabled();
  });

  it('取消：重新拉取配置并清除 dirty 态', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('similar-detection-tab-same-subject')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('similar-detection-tab-same-subject'));
    await userEvent.click(screen.getByTestId('similar-detection-norm-ignoreNumbers'));
    expect(screen.getByTestId('similar-detection-save')).not.toBeDisabled();
    await userEvent.click(screen.getByTestId('similar-detection-cancel'));
    await waitFor(() => expect(screen.getByTestId('similar-detection-save')).toBeDisabled());
    // 至少两次 GET：初次加载 + 取消后的重新拉取
    const getCalls = mockApiRequest.mock.calls.filter(([path, opts]) => path === '/security/similar-detection' && (!opts || !opts.method));
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('豁免提示条链接指向 /security/groups', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('goToGroupPolicy')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /goToGroupPolicy/ })).toHaveAttribute('href', '/security/groups');
  });
});
