import { describe, it, expect, vi } from 'vitest';
import {
  getAttachmentSecurityScopedConfig,
  patchAttachmentSecurityScopedConfig,
  saveBasicLimitConfig,
  getBasicLimitConfig,
  saveTenantAttachmentSecuritySettings,
  type TenantAttachmentSecuritySettings,
} from './attachment-security';

describe('attachment-security scoped configuration', () => {
  const view = {
    stored: { namespace: 'attachd', scope_kind: 'platform', scope_id: 0, schema_version: 1, version: 7, document: {} },
    effective: {
      namespace: 'attachd', tenant_id: 0, schema_version: 1, snapshot_version: 's1', platform_version: 7,
      tenant_version: 0, hash: 'h', provenance: {},
      document: { basic_limit: { receive: { attachment_count_max: 5, danger_ext_list: ['.exe', '.js'] } } },
    },
    published: true,
  };

  it('patches the attachd platform document with CAS instead of writing config_overrides', async () => {
    const requestFn = vi.fn(async (path: string) => path === '/configs/platform/attachd' ? view as never : {} as never);
    await saveBasicLimitConfig('receive', {
      attachment_count_max: 10,
      exceed_action: 'audit',
      partial_skip: false,
      mime_mismatch_action: 'proceed',
      danger_ext_list: '.exe,.js',
    } as never, requestFn as never);
    expect(requestFn).toHaveBeenCalledTimes(2);
    const [path, options] = requestFn.mock.calls[1] as unknown as [string, { method: string; body: Record<string, unknown> }];
    expect(path).toBe('/configs/platform/attachd');
    expect(options.method).toBe('PATCH');
    expect(options.body).toMatchObject({ expected_version: 7 });
    expect(JSON.stringify(options.body)).not.toContain('config_overrides');
    expect(options.body).toMatchObject({
      operations: expect.arrayContaining([
        { op: 'set', path: 'basic_limit.receive.exceed_action', value: 'audit' },
        { op: 'set', path: 'basic_limit.receive.partial_skip', value: false },
        { op: 'set', path: 'basic_limit.receive.mime_mismatch_action', value: 'proceed' },
      ]),
    });
  });

  it('projects canonical string lists back to the existing form shape', async () => {
    const requestFn = vi.fn(async () => view as never);
    await expect(getBasicLimitConfig('receive', requestFn as never)).resolves.toMatchObject({
      attachment_count_max: 5,
      danger_ext_list: '.exe,.js',
    });
  });

  it('surfaces central read failures instead of presenting writable defaults', async () => {
    const requestFn = vi.fn(async () => {
      throw new Error('configuration database unavailable');
    });
    await expect(getBasicLimitConfig('receive', requestFn as never)).rejects.toThrow(
      'configuration database unavailable',
    );
  });

  it.each([
    ['platform', '/configs/platform/attachd'],
    ['tenant', '/configs/tenant/attachd'],
  ] as const)('loads the one authoritative %s attachd view', async (scope, expectedPath) => {
    const requestFn = vi.fn(async () => view as never);
    await getAttachmentSecurityScopedConfig(scope, requestFn as never);
    expect(requestFn).toHaveBeenCalledOnce();
    expect(requestFn).toHaveBeenCalledWith(expectedPath);
  });

  it('starts a first tenant override at CAS version zero and retains a pending commit locally', async () => {
    const tenantView = {
      ...view,
      stored: undefined,
      effective: {
        ...view.effective,
        tenant_id: 832,
        tenant_version: 0,
        document: { module_enabled: true },
      },
    };
    const requestFn = vi.fn(async () => ({
      committed: true,
      published: false,
      status: 'publication_pending',
    } as never));

    const committed = await patchAttachmentSecurityScopedConfig(
      'tenant',
      tenantView as never,
      [{ op: 'set', path: 'module_enabled', value: false }],
      requestFn as never,
    );

    expect(requestFn).toHaveBeenCalledWith('/configs/tenant/attachd', {
      method: 'PATCH',
      body: {
        expected_version: 0,
        operations: [{ op: 'set', path: 'module_enabled', value: false }],
      },
    });
    expect(committed.published).toBe(false);
    expect(committed.stored).toMatchObject({ scope_kind: 'tenant', scope_id: 832, version: 1 });
    expect(committed.effective).toMatchObject({
      tenant_version: 1,
      document: { module_enabled: false },
    });
  });
});

// GT-12704: 租户管理员改「图片识别」的 OCR 模式后点保存，PUT
// /api/v1/attachment-security/settings 返回 400
// （json: cannot unmarshal string into Go value of type
// models.AttachmentSecurityTenantConfig），页面提示保存失败、配置不落库。
//
// 根因是双重 JSON 序列化：saveTenantAttachmentSecuritySettings 先
// `body: JSON.stringify(settings)`，公共请求层 apiRequest 再
// `JSON.stringify(options.body)`（webapp/src/lib/api/client.ts），发出去的请求体
// 顶层就成了一个被引号包住的字符串而不是对象。
//
// 反病毒处置 / 图片识别 / 加密附件三节共用这一个保存函数，所以三节全都存不下去。
//
// 断言的是**传给公共请求层的 body 形态**，不是"函数被调到了" —— 缺陷正是发生在
// 形态上，只断言调用次数的测试对它是恒真的。
const TENANT_SETTINGS: TenantAttachmentSecuritySettings = {
  antivirus: { virus_action: 'quarantine', timeout_action: 'proceed' },
  image_detect: {
    ocr_mode: 'none',
    ocr_max_count: 2,
    qr_mode: 'light',
    qr_max_count: 5,
    qr_light_action: 'quarantine',
    qr_deep_exceed_action: 'proceed',
    qr_deep_exceed_warn: true,
    qr_deep_routes: {},
  },
  encrypted: {
    detect_mode: 'detect_only',
    extract_password_from_body: true,
    extract_password_from_filename: true,
    use_password_book: true,
    recursive_detect: true,
    max_password_attempts: 100,
    mark_suspicious: true,
    decrypt_fail_action: 'proceed',
  },
};

describe('saveTenantAttachmentSecuritySettings request contract (GT-12704)', () => {
  it('hands the public request layer an object, never a pre-serialized string', async () => {
    const requestFn = vi.fn(async () => TENANT_SETTINGS as never);

    await saveTenantAttachmentSecuritySettings(TENANT_SETTINGS, requestFn as never);

    expect(requestFn).toHaveBeenCalledTimes(1);
    const [path, opts] = requestFn.mock.calls[0] as unknown as [
      string,
      { method?: string; body?: unknown },
    ];
    expect(path).toBe('/attachment-security/settings');
    expect(opts.method).toBe('PUT');
    // 核心断言：body 是对象。修复前这里是 string，公共层再 stringify 一次就成了
    // 顶层 JSON 字符串。
    expect(typeof opts.body).toBe('object');
    expect(opts.body).not.toBeInstanceOf(String);
    expect(opts.body).toEqual(TENANT_SETTINGS);
  });

  // 直接复刻公共请求层的序列化行为，把"线上真正发出去的字节"固定住：
  // 顶层必须是 `{`，不能是 `"{`。
  it('produces a JSON object on the wire, not a quoted string', async () => {
    let wireBody: string | undefined;
    const requestFn = vi.fn(async (_path: string, opts?: { body?: unknown }) => {
      // 与 client.ts 的 `body: options.body ? JSON.stringify(options.body) : undefined` 等价
      wireBody = opts?.body ? JSON.stringify(opts.body) : undefined;
      return TENANT_SETTINGS as never;
    });

    await saveTenantAttachmentSecuritySettings(TENANT_SETTINGS, requestFn as never);

    expect(wireBody?.startsWith('{')).toBe(true);
    expect(wireBody?.startsWith('"')).toBe(false);
    // 后端按结构体绑定，必须能解回对象；双重序列化时这里解出来是 string。
    expect(typeof JSON.parse(wireBody as string)).toBe('object');
    expect(JSON.parse(wireBody as string)).toEqual(TENANT_SETTINGS);
  });
});
