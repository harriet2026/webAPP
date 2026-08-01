import { ApiError } from './client';

// next-intl 的 t() 在 key 缺失时不抛异常、只返回 key 本身并打
// MISSING_MESSAGE —— 所以这里必须自己判断"有没有命中"，否则用户会看到
// `apiErrors.disposal.xxx` 这种字符串。
//
// values 的类型必须与 next-intl 的 `TranslationValues`（Record<string,
// string | number | Date>）**一致**：函数参数在 strictFunctionTypes 下是逆变的，
// 这里若放宽成 Record<string, unknown>，useTranslations() 返回的实例就赋不进来
// （tsc 报 "Type 'Record<string, unknown>' is not assignable to
// 'Record<string, string | number | Date>'"），next build 直接失败。
type TranslationValues = Record<string, string | number | Date>;
type Translator = (key: string, values?: TranslationValues) => string;

const NAMESPACE = 'apiErrors';

/**
 * toTranslationValues 把后端 JSON 来的 params（值是 unknown：可能是 bool、null、
 * 嵌套对象）归一成 ICU 能插值的标量。缺参数会让 next-intl 抛 FORMATTING_ERROR
 * 并退回 key，反而触发下面的"未命中"分支丢掉本已命中的文案，所以宁可转成字符串
 * 也不丢键；null/undefined 渲染成空串，避免用户看到 "null"。
 */
function toTranslationValues(params: Record<string, unknown> | undefined): TranslationValues {
  const out: TranslationValues = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === null || v === undefined) out[k] = '';
    else if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

/**
 * localizeApiError 把后端的稳定错误码渲染成当前语言的文案（GT-12606）。
 *
 * 设计要点（见 design/implement/spec/2026-08-01-api-error-code-params-design.md）：
 * - 命中错误码 → 返回本地化文案；未命中 → 返回 null，由调用方决定兜底
 *   （通常是"保存失败"），**绝不回退到后端的英文 message** —— 上位规格
 *   webapp/doc/ui-spec/2026-07-28-cross-page-i18n-text-integrity-ui-spec.md §3
 *   把"不得把后端英文 message 直接当作四语 UI"列为发布门禁。
 * - 不在 client.ts 内部翻译：那是非 React 模块，拿不到 useTranslations，
 *   强行注入会把 i18n 依赖倒灌进网络层。
 *
 * @param t 必须是 useTranslations() 的**根命名空间**实例（不带前缀）。
 */
export function localizeApiError(e: unknown, t: Translator): string | null {
  if (!(e instanceof ApiError)) return null;
  const code = e.code;
  if (!code) return null;

  const key = `${NAMESPACE}.${code}`;
  const rendered = t(key, toTranslationValues(e.params));
  // 未命中时 next-intl 原样返回 key；这时视为"没有文案"，交给调用方兜底。
  if (rendered === key || rendered.startsWith(`${NAMESPACE}.`)) return null;
  return rendered;
}

/**
 * apiErrorFieldPath 取出后端标注的表单字段路径，供 form.setError 把错误标到
 * 具体输入框旁（而不是只弹一个 toast）。后端在 params.field 里给出。
 */
export function apiErrorFieldPath(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  const field = e.params?.field;
  return typeof field === 'string' && field !== '' ? field : null;
}
