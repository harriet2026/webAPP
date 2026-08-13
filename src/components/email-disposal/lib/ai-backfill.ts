// AI 智能搜索解析结果三级回填（design/implement/spec/2026-07-25-ai-search-dedicated-llm-config-design.md §7）。
//
// 现存 bug：search-bar.tsx 此前把 parse-query 返回的结构化 AdvancedFilter 拍平
// 成 AICondition{value: String(...)}，in/between 的数组值被拍成 "a,b" 字符串，
// 送到 use-filter-merger 后原样进入 advanced_filters，后端 ParseAdvancedFilter
// 校验 in/between 要求数组 -> 整个列表查询 400。本模块是修复方案的核心：
// backfillAiFilter 保留结构化值,不再在任何环节 String() 拍平。
//
// 三级映射（纯函数，便于 vitest 覆盖，不依赖 React/组件状态）：
//   1. 快捷筛选控件 quick：仅当顶层 filter.operator === 'AND' 且该条件所在组
//      operator === 'AND'、且组内每个条件都能独立命中下面的字段/操作符/值形状
//      规则时，整组条件写入 quick（覆盖对应控件既有值）。只要组内有一个条件命
//      中不了，整组都不进入这一级（不做部分组回填）。
//   2. 高级筛选构建器 advanced：未进入第一级、但组内**全部**字段的 key 都在
//      advanced-filters.tsx 的 FIELD_GROUPS 内的组，整组以结构化值放入
//      构建器 state（受 5 组上限约束，超限降级到第三级）。
//   3. AI chips 兜底 residual：其余条件，逐条件转成 AICondition。
import type {
  AdvancedFilter,
  FilterCondition,
  FilterConditionGroup,
} from "@/types/log";
import type { AICondition, DisposalQuickFilter } from "@/types/email-disposal";
import {
  ADVANCED_FILTER_FIELD_KEYS,
  MAX_ADVANCED_GROUPS,
} from "../advanced-filters";

// 高级筛选构建器一次最多展示 5 个组（advanced-filters.tsx 的既有产品约束）；
// 回填时若「已有组数 + 本次待回填组数」超过该上限，超出部分整组降级到 residual。

export interface AiBackfillResult {
  quick: Partial<DisposalQuickFilter>;
  advanced: FilterConditionGroup[];
  residual: AICondition[];
}

// received_at 的值可能是 "YYYY-MM-DD" 或带时间的 RFC3339（如
// "2026-07-18T00:00:00Z"）；quick 的日期选择器只认日期部分，统一截取。
function normalizeDate(value: unknown): string {
  const raw = typeof value === "string" ? value : String(value ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1] : raw;
}

function isScalar(
  value: FilterCondition["value"],
): value is string | number | boolean {
  return value !== undefined && value !== "" && !Array.isArray(value);
}

function mapReceivedAt(
  cond: FilterCondition,
  draft: Partial<DisposalQuickFilter>,
): boolean {
  if (cond.op === "between") {
    if (!Array.isArray(cond.value) || cond.value.length !== 2) return false;
    const [start, end] = cond.value;
    draft.sendReceiveTime = {
      start: normalizeDate(start),
      end: normalizeDate(end),
    };
    return true;
  }
  if (cond.op === "gte" || cond.op === "gt") {
    if (!isScalar(cond.value)) return false;
    // gte/gt 单值只圈定下界；若同组内还有一个圈定上界的条件（见下方 lte/lt 分
    // 支）先/后处理过，保留其 end，避免互相覆盖成单点。
    draft.sendReceiveTime = {
      start: normalizeDate(cond.value),
      end: draft.sendReceiveTime?.end ?? "",
    };
    return true;
  }
  if (cond.op === "lte" || cond.op === "lt") {
    if (!isScalar(cond.value)) return false;
    draft.sendReceiveTime = {
      start: draft.sendReceiveTime?.start ?? "",
      end: normalizeDate(cond.value),
    };
    return true;
  }
  if (cond.op === "eq") {
    if (!isScalar(cond.value)) return false;
    const day = normalizeDate(cond.value);
    draft.sendReceiveTime = { start: day, end: day };
    return true;
  }
  return false;
}

function mapEnumArray(
  cond: FilterCondition,
  draft: Partial<DisposalQuickFilter>,
  key: "emailStatuses" | "emailTypes" | "disposalPolicyKeys" | "executionActions",
): boolean {
  if (cond.op === "in") {
    if (!Array.isArray(cond.value) || cond.value.length === 0) return false;
    draft[key] = cond.value.map(String);
    return true;
  }
  if (cond.op === "eq") {
    if (!isScalar(cond.value)) return false;
    draft[key] = [String(cond.value)];
    return true;
  }
  return false;
}

function mapContainsText(
  cond: FilterCondition,
  draft: Partial<DisposalQuickFilter>,
  key: "sender" | "subject" | "recipient" | "ipLocation",
): boolean {
  if (cond.op !== "contains" || !isScalar(cond.value)) return false;
  draft[key] = String(cond.value);
  return true;
}

// 与 disposal-api.ts::mapMailLogToDisposalItem 的 directionMap 保持一致（后端
// receive/send/internal -> 前端控件值 incoming/outgoing/internal 的反向映射）。
// 未在此处直接 import/reuse 该模块的私有局部常量,而是照抄同一张表——两处任一改
// 动都需要同步核对,已在本文件顶部注释与 disposal-api.ts 注释间互相引用。
const DIRECTION_TO_QUICK: Record<string, string> = {
  receive: "incoming",
  send: "outgoing",
  internal: "internal",
};

function mapDirection(
  cond: FilterCondition,
  draft: Partial<DisposalQuickFilter>,
): boolean {
  if (cond.op !== "eq" || !isScalar(cond.value)) return false;
  const raw = String(cond.value);
  draft.sendReceiveType = DIRECTION_TO_QUICK[raw] ?? raw;
  return true;
}

// 第一级字段 -> 处理器映射表。未出现在此表中的字段一律视为第一级不可命中。
const LEVEL1_HANDLERS: Record<
  string,
  (cond: FilterCondition, draft: Partial<DisposalQuickFilter>) => boolean
> = {
  received_at: mapReceivedAt,
  display_status: (c, d) => mapEnumArray(c, d, "emailStatuses"),
  email_type: (c, d) => mapEnumArray(c, d, "emailTypes"),
  disposal_policy_key: (c, d) => mapEnumArray(c, d, "disposalPolicyKeys"),
  direction: mapDirection,
  // GT-12923 阶段一：执行动作筛选控件已改为多选（executionActions），AI 回填
  // 与 emailStatuses/emailTypes 等其它枚举字段一致，同时接受 eq 单值和 in
  // 多值，统一落到数组字段（不再回填已废弃的单值 executionAction）。
  action: (c, d) => mapEnumArray(c, d, "executionActions"),
  sender: (c, d) => mapContainsText(c, d, "sender"),
  subject: (c, d) => mapContainsText(c, d, "subject"),
  header_recipient: (c, d) => mapContainsText(c, d, "recipient"),
  envelope_recipient: (c, d) => mapContainsText(c, d, "recipient"),
  // 后端字段注册表实际未注册裸 "recipient"（仅 header_recipient/
  // envelope_recipient），此处保留作为兼容兜底，正常不会命中。
  recipient: (c, d) => mapContainsText(c, d, "recipient"),
  geo_region_name: (c, d) => mapContainsText(c, d, "ipLocation"),
};

// 尝试把一个 AND 组的全部条件独立映射进 quick 草稿；只要有一个条件命中不了就
// 整组失败（返回 null），不做部分回填。
function tryMapGroupToQuick(
  group: FilterConditionGroup,
): Partial<DisposalQuickFilter> | null {
  if (group.conditions.length === 0) return null;
  const draft: Partial<DisposalQuickFilter> = {};
  for (const cond of group.conditions) {
    const handler = LEVEL1_HANDLERS[cond.field];
    if (!handler || !handler(cond, draft)) return null;
  }
  return draft;
}

/**
 * 把 parse-query 返回的结构化 AdvancedFilter 回填成三部分：
 * - quick：覆盖式合并进现有 DisposalQuickFilter 控件值；
 * - advanced：追加进高级筛选构建器现有组列表（调用方负责 setState 合并）；
 * - residual：替换 aiConditions state 的 AI chips 兜底列表。
 *
 * @param existingAdvancedGroupCount 高级筛选构建器当前已有的组数，用于计算
 *   还能再放入几个新组（5 组上限）；不传默认为 0（等价于构建器当前为空）。
 */
export function backfillAiFilter(
  filter: AdvancedFilter | null,
  existingAdvancedGroupCount = 0,
): AiBackfillResult {
  const quick: Partial<DisposalQuickFilter> = {};
  const advanced: FilterConditionGroup[] = [];
  const residual: AICondition[] = [];

  if (!filter || filter.groups.length === 0) {
    return { quick, advanced, residual };
  }

  const topLevelAnd = filter.operator === "AND";
  let advancedRoom = Math.max(
    0,
    MAX_ADVANCED_GROUPS - existingAdvancedGroupCount,
  );

  for (const group of filter.groups) {
    if (group.conditions.length === 0) continue;

    if (topLevelAnd && group.operator === "AND") {
      const mapped = tryMapGroupToQuick(group);
      if (mapped) {
        Object.assign(quick, mapped);
        continue;
      }
    }

    const allFieldsInBuilder = group.conditions.every((cond) =>
      ADVANCED_FILTER_FIELD_KEYS.has(cond.field),
    );
    if (allFieldsInBuilder) {
      if (advancedRoom > 0) {
        advanced.push({ ...group, conditions: [...group.conditions] });
        advancedRoom -= 1;
        continue;
      }
      // 超出 5 组上限：整组降级到 residual chips（走下方兜底循环）。
    }

    for (const cond of group.conditions) {
      residual.push({
        field: cond.field,
        op: cond.op,
        value: cond.value,
        source: "ai",
      });
    }
  }

  return { quick, advanced, residual };
}
