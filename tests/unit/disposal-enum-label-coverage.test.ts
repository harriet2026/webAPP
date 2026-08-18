import { describe, it, expect } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DISPLAY_STATUSES } from '@/types/email-disposal';

// GT-11583: the disposal-center table renders the 执行动作 / 邮件状态 columns by
// looking up `emailDisposal.filters.actions.<action>` and
// `emailDisposal.filters.statuses.<displayStatus>`. A missing key does not
// throw: mail-list-table's localizeEnum falls back to the raw enum, so the cell
// silently shows English ("audit", "discard") -- exactly what this ticket
// reported. The status column is worse: it calls t() directly, so a missing key
// renders the whole key path.
//
// These tests pin the two enum domains against the catalogs so that adding a
// new action / display status without a label fails CI.

const LOCALES = { zh, en, th, ru } as Record<string, Record<string, unknown>>;

function actions(m: Record<string, unknown>): Record<string, string> {
  const ed = m.emailDisposal as { filters: { actions: Record<string, string> } };
  return ed.filters.actions;
}
function statuses(m: Record<string, unknown>): Record<string, string> {
  const ed = m.emailDisposal as { filters: { statuses: Record<string, string> } };
  return ed.filters.statuses;
}
function legacyStatuses(m: Record<string, unknown>): Record<string, string> {
  const ed = m.emailDisposal as {
    filters: { legacyStatuses: Record<string, string> };
  };
  return ed.filters.legacyStatuses;
}

// filters.actions 现在同时服务两个枚举域（GT-12649）：
//
// ① 原始聚合域 —— mail_log.action is the aggregate of the per-recipient
//    FinalAction values: models.AggregateDispositionAction
//    (internal/models/email.go) returns the sole action when every recipient
//    agrees, else "mixed". 列表「执行动作」徽章按这些原始值查
//    filters.actions.<raw>（mail-list-table resolveActionBadges）。
// ② 展示级执行动作域 —— internal/models/security_overview.go AllActions，
//    处置中心搜索条件（EXECUTION_ACTIONS）与安全总览 trend.action 序列共用。
//
// 两域并集之外的 key 才算 stale。
const ACTION_DOMAIN = [
  // ① raw aggregate values
  'accept',
  'reject',
  'bounce', // milter 仍会写出（退信路径）；标签层面被 LABELLESS_ACTIONS 豁免，见下
  'quarantine',
  'sideline',
  'audit', // milter setRecipientDisposition(..., "audit", ...)
  'discard', // apiserver syncRecipientDispositions(..., "discard", ...)
  'mixed', // AggregateDispositionAction when recipients disagree
  // ② display-level execution actions (backend AllActions)
  'deliver',
  'mark_deliver',
  'advanced_review',
  'review',
  'block',
  'drop',
  'recall',
] as const;

// 产品决策（demo 对齐，2026-07-30 用户确认）：bounce 不再提供展示标签、不作为
// 筛选选项，无需照顾带 bounce 动作的存量数据——命中行经 localizeEnum 回退渲染
// 原始枚举值。
const LABELLESS_ACTIONS = ['bounce'] as const;

describe('emailDisposal.filters.actions covers every mail_log.action (GT-11583)', () => {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} has a label for every action value`, () => {
      const have = actions(messages);
      const missing = ACTION_DOMAIN.filter(
        (a) =>
          typeof have[a] !== 'string' &&
          !(LABELLESS_ACTIONS as readonly string[]).includes(a),
      );
      expect(
        missing,
        `missing action labels -> the table badge falls back to the raw English enum: ${missing.join(', ')}`,
      ).toEqual([]);
    });
  }

  it('has no label for an action the backend cannot produce', () => {
    // Guards the other direction: a stale label is dead weight and misleads the
    // next reader into thinking the backend emits that value.
    // （recall 已随 GT-12649 的 execution_action 虚拟域进入 ACTION_DOMAIN ②，
    // 不再需要 UI-only 白名单。）
    const extra = Object.keys(actions(zh)).filter(
      (k) => !(ACTION_DOMAIN as readonly string[]).includes(k),
    );
    expect(extra, `unknown action labels: ${extra.join(', ')}`).toEqual([]);
  });
});

// GT-12782 Task 4：mapToDisplayStatus 已删除，展示状态由后端下发
// （display_statuses 列表）。这里改为「后端枚举 ↔ 前端 union ↔ i18n 键」
// 三方一致性守卫的前端一环：
//
//   - 后端枚举的事实来源是 api/openapi.yaml 的 MailLogListItem.
//     display_statuses.items.status（它与 Go 侧 models.DisplayStatusValues 的
//     一致性由 internal/api/openapi_mail_logs_test.go 锁住）；
//   - 本用例断言 openapi 枚举 == 前端 DISPLAY_STATUSES union，且每个取值在
//     四份 i18n 目录里都有 filters.statuses.<status> 文案。
//
// 任何一环漂移（后端新增/删除状态、前端 union 改动、i18n 漏 key）都会红。
describe('display_statuses 三方一致性：openapi 枚举 ↔ 前端 union ↔ i18n (GT-12782)', () => {
  const openapiEnum = (() => {
    const doc = readFileSync(
      resolve(__dirname, '../../../api/openapi.yaml'),
      'utf-8',
    );
    // 定位 display_statuses 响应字段的 status 枚举：从字段声明起，取其
    // items.properties.status.enum 的连续 "- value" 列表。避免引入 yaml
    // 解析依赖——枚举块的缩进形态由后端契约测试保证稳定。
    const fieldIdx = doc.indexOf('display_statuses:');
    expect(fieldIdx).toBeGreaterThan(-1);
    const tail = doc.slice(fieldIdx);
    const enumIdx = tail.indexOf('enum:');
    expect(enumIdx).toBeGreaterThan(-1);
    const values: string[] = [];
    for (const line of tail.slice(enumIdx).split('\n').slice(1)) {
      const m = /^\s+-\s+([a-z_]+)\s*$/.exec(line);
      if (!m) break;
      values.push(m[1]);
    }
    return values;
  })();

  it('openapi display_statuses 枚举与前端 DISPLAY_STATUSES union 逐值一致（含顺序）', () => {
    expect(openapiEnum).toEqual([...DISPLAY_STATUSES]);
  });

  it('uses the approved GT-12955 position-based 13-state contract', () => {
    expect(DISPLAY_STATUSES).toEqual([
      'delivering',
      'quarantine_pending',
      'sideline_pending',
      'audit_pending',
      'rejected',
      'discarded',
      'delivery_cancelled',
      'delivered',
      'delivery_failed',
      'recall_pending',
      'recall_success',
      'recall_failed',
      'expired',
    ]);
  });

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} has a label for every display status`, () => {
      const have = statuses(messages);
      const missing = [...DISPLAY_STATUSES].filter((s) => typeof have[s] !== 'string');
      expect(
        missing,
        `missing status labels -> the table renders the raw i18n key path: ${missing.join(', ')}`,
      ).toEqual([]);
    });
  }
});

describe('retired display-status labels remain readable outside the active enum', () => {
  const retired = [
    'quarantined',
    'pending_review',
    'blocked',
    'bounced',
    'partial_delivered',
    'partial_recall_success',
    'deleted',
    'reviewed_rejected',
  ] as const;

  it('does not reintroduce retired values into the 13-value selector contract', () => {
    expect(retired.some((value) =>
      (DISPLAY_STATUSES as readonly string[]).includes(value),
    )).toBe(false);
  });

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} has a saved-filter compatibility label for every retired value`, () => {
      const have = legacyStatuses(messages);
      expect(retired.filter((value) => typeof have[value] !== 'string')).toEqual([]);
    });
  }
});
