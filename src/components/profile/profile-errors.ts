import { ApiError } from '@/lib/api/client';
import { localizeApiError } from '@/lib/api/error-message';

/**
 * Map a profile-area API error to a localized, user-facing message.
 *
 * GT-11969: the backend's `error.message` is an English developer string
 * (e.g. "Current password is incorrect", "Internal server error"); showing it
 * raw leaks English into an otherwise-Chinese UI. Never display `err.message`
 * directly. Instead map by HTTP status:
 *  - 5xx → profile.errors.internal ("服务器内部错误" etc.)
 *  - 0   → network-failure message, already localized by client.requestFailedMessage
 *  - 4xx whose backend message is already CJK → pass through (the backend
 *           already localized it, e.g. password-reuse "新密码不能与近期使用过的密码相同";
 *           this is a pre-existing backend habit, preserved as-is)
 *  - other 4xx / non-ApiError → the caller-supplied action-specific fallback key
 *
 * `t` is a next-intl translator scoped to the `profile` namespace, so both
 * `t('errors.internal')` and `t('account.saveFailed')` resolve under `profile.*`.
 *
 * GT-12614: `tRoot` 是**根命名空间**的 translator，用来按后端错误码
 * (`apiErrors.<code>`) 取本地化文案。它必须排在 CJK 透传之前 —— profile 侧的
 * 校验错误已经改成"错误码 + 英文 message"，若先走 CJK 判断就永远不命中，
 * 具体提示会退化成笼统的兜底文案。未命中错误码时行为与改造前完全一致。
 */
export function profileApiErrorMessage(
  err: unknown,
  fallbackKey: string,
  t: (key: string) => string,
  tRoot?: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  if (err instanceof ApiError) {
    if (tRoot) {
      const coded = localizeApiError(err, tRoot);
      if (coded) return coded;
    }
    if (err.status >= 500) return t("errors.internal");
    if (err.status === 0) return err.message;
    if (err.message && /[\u4e00-\u9fff]/.test(err.message)) return err.message;
  }
  return t(fallbackKey);
}

/** True when an error looks like a wrong-current-password rejection.
 *
 * GT-11969: the backend returns 400 "Current password is incorrect" for a wrong
 * old password (and the race-lost `errCurrentMismatch` variant). The English
 * message is stable, so matching "current"/"old" identifies it; we then show the
 * localized `pwd.incorrect` instead of the raw English. */
export function isWrongCurrentPasswordError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 400) return false;
  return /current|old/i.test(err.message);
}
