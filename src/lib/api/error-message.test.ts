import { describe, it, expect } from 'vitest';
import { ApiError } from './client';
import { localizeApiError, apiErrorFieldPath } from './error-message';
import zh from '@/../messages/zh.json';

// 用真实的 zh 词条做翻译器，模拟 next-intl 的关键行为：
// **key 缺失时不抛异常、原样返回 key**。localizeApiError 必须据此判断未命中，
// 否则用户会看到 `apiErrors.disposal.xxx` 这种字符串。
// 走**嵌套**路径解析，与真实 next-intl 一致：点号是层级分隔符，不是键名的一部分。
// 早先这里按 messages[ns][剩余整串] 扁平查找，掩盖了"扁平点号键 next-intl 根本查不到"
// 这个线上失效（见 tests/unit/api-errors-resolve.test.ts）。
const messages = zh as unknown as Record<string, unknown>;
function t(key: string, values?: Record<string, unknown>): string {
  const tmpl = key.split('.').reduce<unknown>(
    (acc, part) => (acc as Record<string, unknown> | undefined)?.[part], messages);
  if (typeof tmpl !== 'string') return key;
  return tmpl.replace(/\{(\w+)\}/g, (_, name: string) =>
    values && name in values ? String(values[name]) : '');
}

function apiError(code: string, params: Record<string, unknown> = {}, status = 400) {
  return new ApiError(status, 'english fallback', { error: { code, message: 'english fallback', params } });
}

describe('localizeApiError (GT-12606)', () => {
  it('命中错误码时返回本地化文案，并插值参数', () => {
    const e = apiError('disposal.quarantine.valid_days_out_of_range', {
      field: 'quarantine.permissions.recall.valid_days', permission: 'recall', min: 1, max: 30,
    });
    const msg = localizeApiError(e, t);
    expect(msg).toBeTruthy();
    // 参数必须真的被插进去——占位符没替换掉是本机制最容易出的静默故障。
    expect(msg).toContain('recall');
    expect(msg).toContain('1');
    expect(msg).toContain('30');
    expect(msg).not.toMatch(/\{\w+\}/);
  });

  it('未知错误码返回 null（由调用方兜底），绝不回退到后端英文 message', () => {
    const e = apiError('disposal.some.code.that.does.not.exist');
    expect(localizeApiError(e, t)).toBeNull();
    // 这一条是本机制的核心约束：上位规格禁止把后端英文当四语 UI。
    expect(localizeApiError(e, t)).not.toBe('english fallback');
  });

  it('没有 code 的错误（如网络失败）返回 null', () => {
    expect(localizeApiError(new ApiError(502, 'Bad Gateway', {}), t)).toBeNull();
    expect(localizeApiError(new Error('boom'), t)).toBeNull();
  });

  it('apiErrorFieldPath 取出字段路径供 form.setError 定位', () => {
    const e = apiError('disposal.quarantine.portal_base_url_required', {
      field: 'quarantine.portal_base_url',
    });
    expect(apiErrorFieldPath(e)).toBe('quarantine.portal_base_url');
    expect(apiErrorFieldPath(apiError('x.y', {}))).toBeNull();
    expect(apiErrorFieldPath(new Error('boom'))).toBeNull();
  });

  it('ApiError 从信封里正确解析出 code 与 params', () => {
    const e = apiError('disposal.review.timeout_mark_text_too_long', { field: 'review.timeout_mark_text', max: 20 });
    expect(e.code).toBe('disposal.review.timeout_mark_text_too_long');
    expect(e.params?.max).toBe(20);
  });
});
