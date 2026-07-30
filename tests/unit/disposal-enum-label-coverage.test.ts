import { describe, it, expect } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';
import { mapToDisplayStatus } from '@/components/email-disposal/lib/disposal-api';

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

describe('emailDisposal.filters.statuses covers every DisplayStatus (GT-11583)', () => {
  // Derive the reachable DisplayStatus set from the real mapper rather than
  // restating the union type, so a new branch in mapToDisplayStatus is caught.
  const reachable = new Set<string>();
  const deliveryStates = ['delivered', 'in_delivery', 'failed', 'partial_delivered', 'cancelled', 'unknown', undefined];
  const workflowStates = [
    'released', 'approved', 'rejected_after_review', 'discarded', 'expired', 'deleted', 'none', undefined,
  ];
  const recallStates = [
    'recall_pending', 'recall_success', 'recall_failed', 'partial_recall_success', 'none', '', undefined,
  ];
  const actionStates = ['accept', 'reject', 'bounce', 'quarantine', 'sideline', 'audit', 'discard', 'mixed'];

  for (const a of actionStates) {
    for (const d of deliveryStates) {
      for (const w of workflowStates) {
        for (const r of recallStates) {
          reachable.add(mapToDisplayStatus(a, d, w, r));
        }
      }
    }
  }

  it('reaches a non-trivial number of display statuses', () => {
    expect(reachable.size).toBeGreaterThan(8);
  });

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} has a label for every reachable display status`, () => {
      const have = statuses(messages);
      const missing = [...reachable].filter((s) => typeof have[s] !== 'string');
      expect(
        missing,
        `missing status labels -> the table renders the raw i18n key path: ${missing.join(', ')}`,
      ).toEqual([]);
    });
  }
});
