import type { DisposalQuickFilter } from "@/types/email-disposal";

export function shouldAddDefaultSubject(
  query: string,
  aiParsedQuery: string | null,
): boolean {
  const normalizedQuery = query.trim();
  return normalizedQuery !== "" && normalizedQuery !== aiParsedQuery;
}

export function mergeAiQuickFilter(
  current: DisposalQuickFilter,
  parsed: Partial<DisposalQuickFilter>,
  query: string,
  hasAiConditions: boolean,
): DisposalQuickFilter {
  const next = { ...current, ...parsed };
  // 用户可能先点过普通搜索，页面里已存在“主题=整句自然语言”。当同一句话
  // 随后成功解析为 AI 条件时，应清掉这条旧的默认条件；但若 AI 本身明确解析
  // 出 subject，则保留 AI 给出的 subject 值。
  if (
    hasAiConditions &&
    parsed.subject === undefined &&
    current.subject?.trim() === query.trim()
  ) {
    delete next.subject;
  }
  return next;
}
