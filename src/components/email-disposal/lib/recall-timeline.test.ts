import { describe, it, expect } from 'vitest';
import {
  recallTimelineResultRank,
  beatsInCollapsedRow,
  RECALL_ROW_RANK_PENDING,
  RECALL_ROW_RANK_TIMEOUT,
  RECALL_ROW_RANK_TERMINAL,
} from './recall-timeline';
import type { MailChildEvent } from '@/types/email-disposal-detail';

// 处置时间线 spec（2026-08-10 事后处置时间线）：后端 models.RecallTimelineResultRank
// 与前端 recall-timeline.ts 是同一套档位的两份实现，两侧都要有测试钉住。
// 这是前端侧的钉子：档位顺序、同档比 event_time、以及「迟到的真实终态即使
// event_time 早于超时截止点也必须胜出」——这正是该档位机制存在的唯一理由。

function ev(result: string, time: string): MailChildEvent {
  return {
    id: Math.random(),
    event_source: 'recall',
    event_type: 'recall_result',
    event_result: result,
    queue_id: 'Q1',
    event_time: time,
  } as MailChildEvent;
}

describe('recallTimelineResultRank tiers', () => {
  it('terminal results outrank timeout, timeout outranks the rest', () => {
    for (const r of ['success', 'failed', 'expanded']) {
      expect(recallTimelineResultRank(r)).toBe(RECALL_ROW_RANK_TERMINAL);
    }
    expect(recallTimelineResultRank('timeout')).toBe(RECALL_ROW_RANK_TIMEOUT);
    expect(recallTimelineResultRank('handling')).toBe(RECALL_ROW_RANK_PENDING);
    // 后端将来新增而前端还没跟上的取值必须落到 PENDING，不得抛错。
    expect(recallTimelineResultRank(undefined)).toBe(RECALL_ROW_RANK_PENDING);
    expect(recallTimelineResultRank('some_future_result')).toBe(RECALL_ROW_RANK_PENDING);
  });
});

describe('beatsInCollapsedRow', () => {
  it('same tier: newer event_time wins; equal time prefers the later candidate', () => {
    expect(beatsInCollapsedRow(ev('handling', '2026-08-10T10:00:02Z'), ev('handling', '2026-08-10T10:00:01Z'))).toBe(true);
    expect(beatsInCollapsedRow(ev('handling', '2026-08-10T10:00:01Z'), ev('handling', '2026-08-10T10:00:02Z'))).toBe(false);
    expect(beatsInCollapsedRow(ev('handling', '2026-08-10T10:00:01Z'), ev('handling', '2026-08-10T10:00:01Z'))).toBe(true);
  });

  it('a real terminal result beats a timeout even when its event_time is EARLIER', () => {
    // 召回超时 worker 在截止点补写 timeout；对方系统的回调（真实终态）迟到且
    // report_time 早于截止点。权威答案必须胜出，否则管理员看到的是错的。
    const lateTerminal = ev('success', '2026-08-10T09:59:00Z');
    const timeout = ev('timeout', '2026-08-10T10:30:00Z');
    expect(beatsInCollapsedRow(lateTerminal, timeout)).toBe(true);
    expect(beatsInCollapsedRow(timeout, lateTerminal)).toBe(false);
  });

  it('timeout beats handling regardless of time', () => {
    expect(beatsInCollapsedRow(ev('timeout', '2026-08-10T09:00:00Z'), ev('handling', '2026-08-10T23:00:00Z'))).toBe(true);
    expect(beatsInCollapsedRow(ev('handling', '2026-08-10T23:00:00Z'), ev('timeout', '2026-08-10T09:00:00Z'))).toBe(false);
  });

  it('unknown future results still lose to terminal/timeout but tie-break within their tier', () => {
    expect(beatsInCollapsedRow(ev('success', '2026-08-10T09:00:00Z'), ev('brand_new', '2026-08-11T09:00:00Z'))).toBe(true);
    expect(beatsInCollapsedRow(ev('brand_new', '2026-08-10T10:00:02Z'), ev('handling', '2026-08-10T10:00:01Z'))).toBe(true);
  });
});
