import type { MailChildEvent } from '@/types/email-disposal-detail';

// 「事后处置时间线」上一次召回只占一行的折叠定序。
//
// 召回是异步的：后端发起时写一条 event_result='handling' 的事件，回调到达后再
// 写一条终态事件；回调迟迟不来时，后端的召回超时 worker 还会补一条
// event_result='timeout'（internal/api/recall_timeout_worker.go）。事件溯源只
// 追加、不改写历史，所以同一次召回（同 source_ref）会有多条，前端必须折叠成一行。
//
// 这里是后端 internal/models/delivery_events.go 的 RecallTimelineResultRank 的
// 镜像，两处必须逐档一致 —— 后端 dbtest 按同一顺序断言「时间线那一行显示什么」，
// 两套顺序会让界面显示的和后端断言的成为两回事。

export const RECALL_ROW_RANK_PENDING = 0;
export const RECALL_ROW_RANK_TIMEOUT = 1;
export const RECALL_ROW_RANK_TERMINAL = 2;

/**
 * 折叠优先级：
 *   2 真实终态（success/failed/expanded）—— 对方系统给出的权威答案，永远胜出；
 *   1 timeout —— 后端补写的「超时」，比「处置中」信息量大，但真实终态一到就让位；
 *   0 其余（handling、以及后端将来新增而前端还没跟上的取值）。
 *
 * 为什么不能只按 event_time 取最新：回调事件的 event_time 是对方系统自己戳的
 * report_time，时钟偏移或延迟投递都可能让一条真实终态带着比超时截止点更早的
 * 时间到达 —— 那样「超时」就会盖住权威答案，管理员看到的是错的。
 */
export function recallTimelineResultRank(result: string | undefined): number {
  switch (result) {
    case 'success':
    case 'failed':
    case 'expanded':
      return RECALL_ROW_RANK_TERMINAL;
    case 'timeout':
      return RECALL_ROW_RANK_TIMEOUT;
    default:
      return RECALL_ROW_RANK_PENDING;
  }
}

/**
 * 先比档位，同档再按 event_time 取最新（时间相同时后来者胜，与按时间折叠的
 * 旧行为一致）。
 */
export function beatsInCollapsedRow(candidate: MailChildEvent, incumbent: MailChildEvent): boolean {
  const cr = recallTimelineResultRank(candidate.event_result);
  const ir = recallTimelineResultRank(incumbent.event_result);
  if (cr !== ir) return cr > ir;
  return (candidate.event_time || '') >= (incumbent.event_time || '');
}
