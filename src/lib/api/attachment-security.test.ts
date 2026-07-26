import { describe, it, expect, vi } from 'vitest';
import { saveBasicLimitConfig, getBasicLimitConfig } from './attachment-security';

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
