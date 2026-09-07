import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AttachmentSecurityPage } from './AttachmentSecurityPage';

// The page previously assembled its draft from multiple GETs and saved the
// basic/antivirus/tenant sections with separate writes. This file deliberately
// keeps the real scoped-config helper: it guards the component-to-wire contract
// that one click means one versioned attachd document PATCH.
const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
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

vi.mock('@/lib/api/client', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    useApiRequest: () => ({ apiRequest: mocks.apiRequest }),
    apiRequest: mocks.apiRequest,
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
    <>
      <button
        data-testid="stub-set-ocr-none"
        onClick={() => onChange({ ...config, ocr_mode: 'none' })}
      >
        set ocr none
      </button>
      <button
        data-testid="stub-set-ocr-light"
        onClick={() => onChange({ ...config, ocr_mode: 'light' })}
      >
        set ocr light
      </button>
    </>
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

function scopedView(version = 4) {
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

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.apiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === '/configs/tenant/attachd' && !options?.method) return scopedView();
    if (path === '/configs/tenant/attachd' && options?.method === 'PATCH') return scopedView(5);
    throw new Error(`unexpected request ${options?.method ?? 'GET'} ${path}`);
  });
});

describe('AttachmentSecurityPage atomic scoped-config save contract', () => {
  it('saves all changed page fields with one tenant CAS PATCH', async () => {
    render(<AttachmentSecurityPage embedded hideBasicLimit />);

    // 进入「图片识别」页签，把 OCR 检测模式从 light 改成 none
    fireEvent.click(await screen.findByTestId('tab-image'));
    fireEvent.click(await screen.findByTestId('stub-set-ocr-none'));

    fireEvent.click(screen.getByTestId('basic-limit-save'));

    await waitFor(() => {
      expect(mocks.apiRequest.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
    });

    const [path, opts] = mocks.apiRequest.mock.calls.find(
      ([, options]) => options?.method === 'PATCH',
    ) as [string, { method: string; body: { expected_version: number; operations: unknown[] } }];
    expect(path).toBe('/configs/tenant/attachd');
    expect(opts.body).toEqual({
      expected_version: 4,
      operations: [{ op: 'set', path: 'image_detection.ocr_mode', value: 'none' }],
    });
    expect(mocks.apiRequest.mock.calls.some(([requestPath]) => requestPath === '/attachment-security/settings')).toBe(false);
  });

  it('keeps the submitted draft and next CAS version after publication_pending', async () => {
    mocks.apiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/configs/tenant/attachd' && !options?.method) return scopedView();
      if (path === '/configs/tenant/attachd' && options?.method === 'PATCH') {
        return { committed: true, published: false, status: 'publication_pending' };
      }
      throw new Error(`unexpected request ${options?.method ?? 'GET'} ${path}`);
    });
    render(<AttachmentSecurityPage embedded hideBasicLimit />);

    fireEvent.click(await screen.findByTestId('tab-image'));
    fireEvent.click(await screen.findByTestId('stub-set-ocr-none'));
    expect(screen.getByTestId('attachment-security-dirty-indicator')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('basic-limit-save'));
    // Disabled is also true while the request is merely in flight. Waiting for
    // the dirty marker to disappear proves the pending acknowledgement was
    // accepted and the submitted draft became the local CAS baseline.
    await waitFor(() => {
      expect(screen.queryByTestId('attachment-security-dirty-indicator')).not.toBeInTheDocument();
      expect(screen.getByTestId('basic-limit-save')).toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('stub-set-ocr-light'));
    await waitFor(() => expect(screen.getByTestId('basic-limit-save')).toBeEnabled());
    fireEvent.click(screen.getByTestId('basic-limit-save'));
    await waitFor(() => {
      expect(mocks.apiRequest.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(2);
    });
    const patchBodies = mocks.apiRequest.mock.calls
      .filter(([, options]) => options?.method === 'PATCH')
      .map(([, options]) => options.body);
    expect(patchBodies[0].expected_version).toBe(4);
    expect(patchBodies[1].expected_version).toBe(5);
    expect(mocks.apiRequest.mock.calls.filter(([requestPath, options]) =>
      requestPath === '/configs/tenant/attachd' && !options?.method)).toHaveLength(1);
  });

  it('disables Save while the module toggle owns the scoped-config CAS version', async () => {
    let resolvePatch!: (value: ReturnType<typeof scopedView>) => void;
    const patch = new Promise<ReturnType<typeof scopedView>>((resolve) => { resolvePatch = resolve; });
    mocks.apiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/configs/tenant/attachd' && !options?.method) return scopedView();
      if (path === '/configs/tenant/attachd' && options?.method === 'PATCH') return patch;
      throw new Error(`unexpected request ${options?.method ?? 'GET'} ${path}`);
    });
    render(<AttachmentSecurityPage embedded hideBasicLimit />);

    fireEvent.click(await screen.findByTestId('tab-image'));
    fireEvent.click(screen.getByTestId('stub-set-ocr-none'));
    expect(screen.getByTestId('basic-limit-save')).toBeEnabled();
    fireEvent.click(screen.getByTestId('module-master-switch-attachment_security'));

    await waitFor(() => expect(screen.getByTestId('basic-limit-save')).toBeDisabled());
    // A click dispatched directly while disabled must not create a competing
    // PATCH with the same expected_version.
    fireEvent.click(screen.getByTestId('basic-limit-save'));
    expect(mocks.apiRequest.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);

    await act(async () => { resolvePatch(scopedView(5)); await patch; });
    await waitFor(() => expect(screen.getByTestId('basic-limit-save')).toBeEnabled());
  });

  it('disables the module toggle while Save owns the scoped-config CAS version', async () => {
    let resolvePatch!: (value: ReturnType<typeof scopedView>) => void;
    const patch = new Promise<ReturnType<typeof scopedView>>((resolve) => { resolvePatch = resolve; });
    mocks.apiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/configs/tenant/attachd' && !options?.method) return scopedView();
      if (path === '/configs/tenant/attachd' && options?.method === 'PATCH') return patch;
      throw new Error(`unexpected request ${options?.method ?? 'GET'} ${path}`);
    });
    render(<AttachmentSecurityPage embedded hideBasicLimit />);

    fireEvent.click(await screen.findByTestId('tab-image'));
    fireEvent.click(screen.getByTestId('stub-set-ocr-none'));
    fireEvent.click(screen.getByTestId('basic-limit-save'));

    await waitFor(() => expect(
      screen.getByTestId('module-master-switch-attachment_security'),
    ).toBeDisabled());
    fireEvent.click(screen.getByTestId('module-master-switch-attachment_security'));
    expect(mocks.apiRequest.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);

    await act(async () => { resolvePatch(scopedView(5)); await patch; });
    await waitFor(() => expect(
      screen.getByTestId('module-master-switch-attachment_security'),
    ).toBeEnabled());
  });
});
