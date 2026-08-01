import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ApiError } from './client';
import { useApiErrorMessage } from './use-api-error-message';

// next-intl 的 useTranslations 在测试里没有 provider，直接 mock 成"查表命中就
// 返回文案、否则原样返回 key"——这正是真实 next-intl 缺 key 时的行为，
// localizeApiError 的未命中判断依赖它。
const TABLE: Record<string, string> = {
  'apiErrors.tenant.not_found': '租户不存在',
  'common.error': '操作失败',
};
vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) => TABLE[ns ? `${ns}.${key}` : key] ?? (ns ? `${ns}.${key}` : key),
}));

function useHook() {
  return useApiErrorMessage();
}

describe('useApiErrorMessage (GT-12614)', () => {
  it('命中错误码 -> 本地化文案，而不是后端英文 message', () => {
    const { result } = renderHook(() => useHook());
    const err = new ApiError(404, 'tenant not found', {
      error: { code: 'tenant.not_found', message: 'tenant not found' },
    });
    expect(result.current(err)).toBe('租户不存在');
  });

  it('未命中错误码 -> 兜底文案，绝不显示后端英文 message', () => {
    const { result } = renderHook(() => useHook());
    const err = new ApiError(400, 'some brand new english message', {
      error: { code: 'tenant.brand_new_code', message: 'some brand new english message' },
    });
    expect(result.current(err)).toBe('操作失败');
    expect(result.current(err, '保存失败')).toBe('保存失败');
  });

  it('网络失败(status 0) -> 透传 client.ts 已本地化的文案', () => {
    const { result } = renderHook(() => useHook());
    const err = new ApiError(0, '请求失败，服务暂时不可用，请稍后重试', {});
    expect(result.current(err)).toBe('请求失败，服务暂时不可用，请稍后重试');
  });

  it('非 ApiError -> 兜底文案', () => {
    const { result } = renderHook(() => useHook());
    expect(result.current(new Error('boom'))).toBe('操作失败');
  });
});
