import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AttachmentSecurityPage } from './AttachmentSecurityPage';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getScopedConfig: vi.fn(),
  patchScopedConfig: vi.fn(),
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

vi.mock('@/lib/api/attachment-security', () => ({
  getAttachmentSecurityScopedConfig: mocks.getScopedConfig,
  patchAttachmentSecurityScopedConfig: mocks.patchScopedConfig,
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
  mocks.getScopedConfig.mockReset();
  mocks.getScopedConfig.mockResolvedValue(scopedView());
  mocks.patchScopedConfig.mockReset();
  mocks.patchScopedConfig.mockResolvedValue(scopedView(2));
});

function scopedView(version = 1) {
  const document = {
    module_enabled: true,
    basic_limit: {
      receive: {
        attachment_count_max: 10, attachment_size_max_kb: 10240,
        nested_zip_count_max: 2, nested_file_count_max: 20, nested_level_max: 2,
        scan_timeout_sec: 30, exceed_action: 'quarantine', partial_skip: false,
        danger_ext_enabled: true, danger_ext_list: ['.exe'],
        mime_mismatch_check: true, mime_mismatch_action: 'quarantine',
      },
    },
    antivirus: { host: '', port: '', virus_action: 'quarantine', timeout_action: 'proceed' },
    image_detection: {
      ocr_mode: 'light', ocr_max_count: 2, qr_mode: 'light', qr_max_count: 5,
      qr_light_action: 'quarantine', qr_deep_exceed_action: 'proceed', qr_deep_exceed_warn: true,
      qr_deep_routes: {
        url_check: true, url_unshorten: true, keyword_filter: true,
        keyword_scope: ['url_path', 'plain_text'], intent_engine: true,
        intent_categories: ['high', 'medium', 'low'], advanced_rules: false,
      },
    },
    encrypted: {
      detect_mode: 'detect_only', extract_password_from_body: true,
      extract_password_from_filename: true, use_password_book: true, recursive_detect: true,
      max_password_attempts: 100, mark_suspicious: true, decrypt_fail_action: 'proceed',
    },
  };
  return {
    stored: {
      namespace: 'attachd', scope_kind: 'tenant', scope_id: 2, schema_version: 1,
      version, document: {}, checksum: 'x', updated_at: '',
    },
    effective: {
      namespace: 'attachd', tenant_id: 2, schema_version: 1,
      snapshot_version: 's1', platform_version: 1, tenant_version: version,
      hash: 'h', document, provenance: {},
    },
    published: true,
  };
}

describe('AttachmentSecurityPage tenant permissions', () => {
  it('allows a tenant admin to change the tenant-scoped attachment-security switch', async () => {
    render(<AttachmentSecurityPage embedded hideBasicLimit />);

    const toggle = await screen.findByTestId('module-master-switch-attachment_security');
    expect(toggle).toBeEnabled();

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mocks.patchScopedConfig).toHaveBeenCalledWith(
        'tenant',
        expect.any(Object),
        [{ op: 'set', path: 'module_enabled', value: false }],
        mocks.apiRequest,
      );
    });
  });

  it('shows a retry-only error state instead of editable defaults when loading fails', async () => {
    mocks.getScopedConfig.mockRejectedValueOnce(new Error('database unavailable'));
    render(<AttachmentSecurityPage embedded hideBasicLimit />);

    expect(await screen.findByTestId('attachment-security-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('basic-limit-save')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('attachment-security-retry'));

    expect(await screen.findByTestId('attachment-security-page')).toBeInTheDocument();
    expect(mocks.getScopedConfig).toHaveBeenCalledTimes(2);
  });
});
