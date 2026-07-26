// GT-12198: 附件基础限制的数量/大小类字段约定「-1 表示不限制，其余必须为正整数」。
// 此前这些输入只在 onBlur 时静默 clamp（0 会被悄悄改成 1），既没有字段级错误、
// 也没有保存前的兜底——若 blur 未触发（或经 API 直接写入），0 这类非法值仍可能提交。
// 附件配置走的是通用 /config-overrides，后端没有针对该节的取值校验，因此前端是
// 目前唯一的把关点。

/**
 * 判断一个限制值是否合法。
 * @param raw 输入值
 * @param allowUnlimited 该字段是否允许用 -1 表示"不限制"
 */
export function isValidLimitValue(raw: unknown, allowUnlimited = false): boolean {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return false;
  if (allowUnlimited && n === -1) return true;
  return n >= 1;
}
