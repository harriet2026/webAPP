/**
 * 统一规则（unified-rules）JSON 字段的容错解析。
 *
 * 背景：后端 `serializeRuleToMap`（internal/api/unified_rules.go）用
 * `json.RawMessage(r.Metadata)` / `json.RawMessage(r.ConditionTree)` 下发这两个字段，
 * 于是它们在 HTTP 响应里是**内联的 JSON 对象**，前端拿到的运行时值是 object 而不是 string。
 * 但 `webapp/src/types/unified-rules.ts` 里 `Rule.condition_tree` / `Rule.metadata`
 * 仍声明为 `string`（类型声明与运行时不符，统一收敛留待后续工单）。
 *
 * 后果：对这两个字段做**裸 `JSON.parse`** 时，对象会先被转成字符串 `"[object Object]"`
 * 再解析 → 抛 `SyntaxError` → 通常被 `catch {}` 吞掉 → 调用方误判规则不可解析。
 * GT-12781 即由此产生：内容规则全部被误判为「复杂条件」。
 *
 * 因此解析这两个字段时**务必使用本函数，不要裸 `JSON.parse`**：它同时容忍
 * 字符串形态（历史/mock 数据）与对象形态（真实 API）。
 */
export function parseRuleJson(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}
