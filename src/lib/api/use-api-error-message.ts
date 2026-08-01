'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError } from './client';
import { localizeApiError } from './error-message';

/**
 * useApiErrorMessage 把后端的稳定错误码渲染成当前语言的文案（GT-12614）。
 *
 * 为什么要一个 hook：localizeApiError 需要**根命名空间**的 translator，而
 * 页面里拿到的通常是 useTranslations('xxx') 这种带前缀的实例。散在各处的
 * `toast.error(apiErrorMessage(err))` 若各自去补一行 useTranslations()，很容易漏；
 * 收敛成一个 hook 后，调用点只剩一次函数调用，改造与审计都好做。
 *
 * 未命中错误码时**绝不回退到后端英文 message**（上位规格
 * webapp/doc/ui-spec/2026-07-28-cross-page-i18n-text-integrity-ui-spec.md §3
 * 的发布门禁），而是用调用方给的兜底文案，没给就用 common.error。
 *
 * 网络层失败（ApiError.status === 0）例外：那条 message 是 client.ts 里已经
 * 本地化过的"请求失败…"，直接透传比换成笼统的"操作失败"信息量更大。
 */
export function useApiErrorMessage() {
  const tRoot = useTranslations();
  const tCommon = useTranslations('common');

  // 用 useCallback 稳定引用：调用点常把它放进 useCallback/useMemo 的依赖里，
  // 每次渲染返回新函数会让那些记忆化全部失效。
  return useCallback((err: unknown, fallback?: string): string => {
    const localized = localizeApiError(err, tRoot);
    if (localized) return localized;
    if (err instanceof ApiError && err.status === 0) return err.message;
    return fallback ?? tCommon('error');
  }, [tRoot, tCommon]);
}
