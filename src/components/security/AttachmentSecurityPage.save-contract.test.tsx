import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AttachmentSecurityPage } from './AttachmentSecurityPage';

// GT-12704: 租户管理员在「图片识别」页签把 OCR 检测模式改掉再点「保存配置」，
// PUT /api/v1/attachment-security/settings 返回 400，页面提示保存失败、配置不落库。
//
// 根因是双重 JSON 序列化（详见 src/lib/api/attachment-security.test.ts 的 GT-12704
// 一节）。这里守的是**组件到公共请求层的整条保存链路**：
// AttachmentSecurityPage.save() -> 真实的 saveTenantAttachmentSecuritySettings
// -> apiRequest 收到的 body。
//
// 关键点：本文件**不 mock** saveTenantAttachmentSecuritySettings。既有的
// AttachmentSecurityPage.test.tsx 把它整个 mock 掉了，于是无论它内部怎么序列化
// 都测不出来 —— 那个 mock 对本缺陷是恒真的。
const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getSecurityModules: vi.fn(),
  setSecurityModuleEnabled: vi.fn(),
  getTenantSettings: vi.fn(),
  translate: (key: string) => key,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => mocks.translate,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    isSystemAdmin: false,
    selectedTenantId: 2,
    user: { role: 'tenant_admin' },
  }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ capabilities: { multiTenant: true }, viewer: 'tenant' }),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mocks.apiRequest }),
  apiRequest: mocks.apiRequest,
}));

vi.mock('@/lib/api/security-modules', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/security-modules')>();
  return {
    ...actual,
    getSecurityModules: mocks.getSecurityModules,
    setSecurityModuleEnabled: mocks.setSecurityModuleEnabled,
  };
});

// 只替换读路径与其他节的保存；saveTenantAttachmentSecuritySettings 保留真实实现。
vi.mock('@/lib/api/attachment-security', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/attachment-security')>();
  return {
    ...actual,
    getBasicLimitConfig: vi.fn().mockResolvedValue({}),
    getAntivirusConfig: vi.fn().mockResolvedValue({}),
    getAntivirusActionConfig: vi.fn().mockResolvedValue({}),
    getImageDetectConfig: vi.fn().mockResolvedValue({}),
    getQrDeepRoutesConfig: vi.fn().mockResolvedValue({}),
    getImageDetectActionConfig: vi.fn().mockResolvedValue({}),
    getEncryptedConfig: vi.fn().mockResolvedValue({}),
    getEncryptedActionConfig: vi.fn().mockResolvedValue({}),
    getTenantAttachmentSecuritySettings: mocks.getTenantSettings,
    saveBasicLimitConfig: vi.fn(),
    saveAntivirusConfig: vi.fn(),
    saveImageDetectConfig: vi.fn(),
    saveQrDeepRoutesConfig: vi.fn(),
    saveImageDetectActionConfig: vi.fn(),
    saveEncryptedConfig: vi.fn(),
    saveEncryptedActionConfig: vi.fn(),
    saveAntivirusActionConfig: vi.fn(),
  };
});

vi.mock('./attachment-security/BasicLimitTab', () => ({
  DEFAULT_BASIC_LIMIT_CONFIG: {},
  BasicLimitTab: () => <div />,
}));
vi.mock('./attachment-security/AntivirusTab', () => ({
  DEFAULT_ANTIVIRUS_CONFIG: {},
  DEFAULT_ANTIVIRUS_ACTIONS: {},
  AntivirusTab: () => <div />,
}));
// 图片识别页签换成一个能真正触发 onChange 的桩，用来模拟「把 OCR 模式改成不检测」。
vi.mock('./attachment-security/ImageDetectTab', () => ({
  DEFAULT_IMAGE_DETECT_CONFIG: {},
  DEFAULT_IMAGE_DETECT_ACTIONS: {},
  DEFAULT_QR_DEEP_ROUTES: {},
  ImageDetectTab: ({
    config,
    onChange,
  }: {
    config: Record<string, unknown>;
    onChange: (next: Record<string, unknown>) => void;
  }) => (
    <button
      data-testid="stub-set-ocr-none"
      onClick={() => onChange({ ...config, ocr_mode: 'none' })}
    >
      set ocr none
    </button>
  ),
}));
vi.mock('./attachment-security/EncryptedAttachmentTab', () => ({
  DEFAULT_ENCRYPTED_CONFIG: {},
  DEFAULT_ENCRYPTED_ACTIONS: {},
  EncryptedAttachmentTab: () => <div />,
}));

vi.mock('./PipelinePanelHeader', () => ({
  PipelinePanelHeader: ({
    enabled,
    disabled,
    onToggle,
    rootTestId,
    children,
  }: {
    enabled: boolean;
    disabled: boolean;
    onToggle: (enabled: boolean) => void;
    rootTestId?: string;
    children: React.ReactNode;
  }) => (
    <div>
      <button data-testid={rootTestId} disabled={disabled} onClick={() => onToggle(!enabled)}>toggle</button>
      {children}
    </div>
  ),
}));

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.apiRequest.mockResolvedValue({});
  mocks.getSecurityModules.mockReset();
  mocks.getSecurityModules.mockResolvedValue({ attachment_security: true });
  mocks.setSecurityModuleEnabled.mockReset();
  mocks.setSecurityModuleEnabled.mockResolvedValue(undefined);
  mocks.getTenantSettings.mockReset();
  mocks.getTenantSettings.mockResolvedValue({
    antivirus: { virus_action: 'quarantine', timeout_action: 'accept' },
    image_detect: {
      ocr_mode: 'light', ocr_max_count: 2, qr_mode: 'light', qr_barcode_exempt: true,
      qr_max_count: 5, qr_light_action: 'quarantine', qr_deep_exceed_action: 'accept',
      qr_deep_exceed_warn: true, qr_deep_routes: {},
    },
    encrypted: {
      detect_mode: 'detect_only', extract_password_from_body: true,
      extract_password_from_filename: true, use_password_book: true, recursive_detect: true,
      max_password_attempts: 100, mark_suspicious: true, decrypt_fail_action: 'accept',
    },
  });
});

describe('AttachmentSecurityPage tenant settings save contract (GT-12704)', () => {
  it('sends an unserialized object body to the public request layer', async () => {
    render(<AttachmentSecurityPage embedded hideBasicLimit />);

    // 进入「图片识别」页签，把 OCR 检测模式从 light 改成 none
    fireEvent.click(await screen.findByTestId('tab-image'));
    fireEvent.click(await screen.findByTestId('stub-set-ocr-none'));

    fireEvent.click(screen.getByTestId('basic-limit-save'));

    await waitFor(() => {
      const put = mocks.apiRequest.mock.calls.find(
        ([path, opts]) => path === '/attachment-security/settings' && opts?.method === 'PUT',
      );
      expect(put).toBeDefined();
    });

    const [, opts] = mocks.apiRequest.mock.calls.find(
      ([path, o]) => path === '/attachment-security/settings' && o?.method === 'PUT',
    ) as [string, { method: string; body: unknown }];

    // 缺陷形态下 body 是 JSON 字符串；公共层再 stringify 一次 -> 顶层是被引号
    // 包住的字符串 -> 后端 400。
    expect(typeof opts.body).toBe('object');
    expect(typeof opts.body).not.toBe('string');
    // 页面确实把改后的值带上了，而不是"发了个空对象也算过"。
    expect((opts.body as { image_detect: { ocr_mode: string } }).image_detect.ocr_mode).toBe('none');
    // 三节租户级配置共用这一次 PUT，缺一节即回归。
    expect(opts.body).toHaveProperty('antivirus');
    expect(opts.body).toHaveProperty('encrypted');
  });
});
