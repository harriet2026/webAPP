import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AttachmentSecurityPage } from './AttachmentSecurityPage';

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
}));

vi.mock('@/lib/api/security-modules', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/security-modules')>();
  return {
    ...actual,
    getSecurityModules: mocks.getSecurityModules,
    setSecurityModuleEnabled: mocks.setSecurityModuleEnabled,
  };
});

vi.mock('@/lib/api/attachment-security', () => ({
  getBasicLimitConfig: vi.fn().mockResolvedValue({}),
  getAntivirusConfig: vi.fn().mockResolvedValue({}),
  getAntivirusActionConfig: vi.fn().mockResolvedValue({}),
  getImageDetectConfig: vi.fn().mockResolvedValue({}),
  getQrDeepRoutesConfig: vi.fn().mockResolvedValue({}),
  getImageDetectActionConfig: vi.fn().mockResolvedValue({}),
  getEncryptedConfig: vi.fn().mockResolvedValue({}),
  getEncryptedActionConfig: vi.fn().mockResolvedValue({}),
  getTenantAttachmentSecuritySettings: mocks.getTenantSettings,
  saveTenantAttachmentSecuritySettings: vi.fn(),
  saveBasicLimitConfig: vi.fn(),
  saveAntivirusConfig: vi.fn(),
  saveAntivirusActionConfig: vi.fn(),
  saveImageDetectConfig: vi.fn(),
  saveQrDeepRoutesConfig: vi.fn(),
  saveImageDetectActionConfig: vi.fn(),
  saveEncryptedConfig: vi.fn(),
  saveEncryptedActionConfig: vi.fn(),
}));

vi.mock('./attachment-security/BasicLimitTab', () => ({
  DEFAULT_BASIC_LIMIT_CONFIG: {},
  BasicLimitTab: () => <div />,
}));
vi.mock('./attachment-security/AntivirusTab', () => ({
  DEFAULT_ANTIVIRUS_CONFIG: {},
  DEFAULT_ANTIVIRUS_ACTIONS: {},
  AntivirusTab: () => <div />,
}));
vi.mock('./attachment-security/ImageDetectTab', () => ({
  DEFAULT_IMAGE_DETECT_CONFIG: {},
  DEFAULT_IMAGE_DETECT_ACTIONS: {},
  DEFAULT_QR_DEEP_ROUTES: {},
  ImageDetectTab: () => <div />,
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

describe('AttachmentSecurityPage tenant permissions', () => {
  it('allows a tenant admin to change the tenant-scoped attachment-security switch', async () => {
    render(<AttachmentSecurityPage embedded hideBasicLimit />);

    const toggle = await screen.findByTestId('module-master-switch-attachment_security');
    expect(toggle).toBeEnabled();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('basic-limit-save'));
    await waitFor(() => {
      expect(mocks.setSecurityModuleEnabled).toHaveBeenCalledWith('attachment_security', false, mocks.apiRequest);
    });
  });
});
