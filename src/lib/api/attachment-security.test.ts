import { describe, it, expect, vi } from 'vitest';
import {
  saveBasicLimitConfig,
  getBasicLimitConfig,
  saveTenantAttachmentSecuritySettings,
  type TenantAttachmentSecuritySettings,
} from './attachment-security';

// GT-12197: 平台管理员在「附件基础限制」点保存时，网络侧只出现 GET、没有写请求，页面报保存失败。
// 根因：附件安全各节配置走通用 /config-overrides；当该节还没有任何配置行时，后端
// QueryConfigOverrides 的 `var overrides []models.ConfigOverride` 保持 nil，JSON 序列化为
// `"items": null`。saveConfigSection 里 `for (const item of resp.items)` 未做空值兜底
// （而读路径 fetchConfigSection 有 `?? []`），于是在发出任何 PUT/POST 之前就抛
// TypeError —— 表现正是「只有 GET、无写请求、保存失败」。
describe('attachment-security config save (GT-12197)', () => {
  it('saves (POSTs) new keys even when the list response has items: null', async () => {
    const calls: Array<{ path: string; method?: string }> = [];
    const requestFn = vi.fn(async (path: string, opts?: { method?: string; body?: unknown }) => {
      calls.push({ path, method: opts?.method });
      if (path.startsWith('/config-overrides?')) {
        // 后端在该节无配置行时返回 items: null（Go nil slice）
        return { total: 0, page: 1, limit: 200, items: null } as never;
      }
      return {} as never;
    });

    await expect(
      saveBasicLimitConfig('receive', { max_attachment_count: 10 } as never, requestFn as never),
    ).resolves.not.toThrow();

    // 必须真的发出写请求，而不是在 GET 之后就抛错
    const writes = calls.filter((c) => c.method === 'POST' || c.method === 'PUT');
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0].path).toBe('/config-overrides');
    expect(writes[0].method).toBe('POST');
  });

  it('still PUTs existing keys when items is a populated array', async () => {
    const calls: Array<{ path: string; method?: string }> = [];
    const requestFn = vi.fn(async (path: string, opts?: { method?: string; body?: unknown }) => {
      calls.push({ path, method: opts?.method });
      if (path.startsWith('/config-overrides?')) {
        return {
          total: 1,
          page: 1,
          limit: 200,
          items: [
            {
              id: 7,
              config_file: 'attachd.cf',
              section_name: 'basic_limit_receive',
              config_key: 'max_attachment_count',
              config_value: '5',
              value_type: 'int',
              is_active: true,
              description: '',
            },
          ],
        } as never;
      }
      return {} as never;
    });

    await saveBasicLimitConfig('receive', { max_attachment_count: 10 } as never, requestFn as never);
    const writes = calls.filter((c) => c.method === 'PUT');
    expect(writes.length).toBe(1);
    expect(writes[0].path).toBe('/config-overrides/7');
  });

  // 读路径本来就有 `?? []` 兜底，这条固定住该不变量（否则两条路径又会分叉）。
  it('read path tolerates items: null and returns an empty config', async () => {
    const requestFn = vi.fn(async () => ({ total: 0, page: 1, limit: 200, items: null }) as never);
    await expect(getBasicLimitConfig('receive', requestFn as never)).resolves.toEqual({});
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
  antivirus: { virus_action: 'quarantine', timeout_action: 'accept' },
  image_detect: {
    ocr_mode: 'none',
    ocr_max_count: 2,
    qr_mode: 'light',
    qr_max_count: 5,
    qr_light_action: 'quarantine',
    qr_deep_exceed_action: 'accept',
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
    decrypt_fail_action: 'accept',
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
