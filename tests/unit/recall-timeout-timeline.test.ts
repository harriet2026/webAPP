import { describe, it, expect } from 'vitest';
import en from '../../messages/en.json';
import zh from '../../messages/zh.json';
import ru from '../../messages/ru.json';
import th from '../../messages/th.json';
import {
  recallTimelineResultRank, beatsInCollapsedRow,
} from '@/components/email-disposal/lib/recall-timeline';
import type { MailChildEvent } from '@/types/email-disposal-detail';

// 召回回调超时（后端 internal/api/recall_timeout_worker.go）在时间线上的两件事：
// ① 折叠定序——真实终态 > 超时 > 处置中；② 四语文案齐全，否则界面直接显示
// 原始英文 `timeout`。

describe('召回时间线的折叠定序', () => {
  it('对方系统回报的终态永远盖过我们自己补写的超时', () => {
    for (const real of ['success', 'failed', 'expanded']) {
      expect(recallTimelineResultRank(real)).toBeGreaterThan(recallTimelineResultRank('timeout'));
    }
  });

  it('超时高于「处置中」——补写的意义就是让那一行不再停在处置中', () => {
    expect(recallTimelineResultRank('timeout')).toBeGreaterThan(recallTimelineResultRank('handling'));
  });

  it('未知取值（后端新增而前端未跟上）落到最低档，绝不会意外盖掉真实终态', () => {
    expect(recallTimelineResultRank('something_new')).toBe(recallTimelineResultRank('handling'));
    expect(recallTimelineResultRank(undefined)).toBe(0);
  });

  // 这条锁住的是"迟到的真实回调最终胜出"的顺序语义：回调事件的 event_time 是
  // 对方系统自己戳的 report_time，可能比我们算出的超时截止点还早（时钟偏移），
  // 纯按时间取最新会让「超时」盖住权威答案。
  it('真实终态即便 event_time 早于超时事件也要胜出', () => {
    const ev = (result: string, at: string) =>
      ({ id: 1, event_result: result, event_time: at, source_ref: 'recall_req:7' } as unknown as MailChildEvent);
    const timeoutEv = ev('timeout', '2026-08-11T10:00:00.000Z');
    const lateReal = ev('success', '2026-08-11T09:00:00.000Z');
    expect(beatsInCollapsedRow(lateReal, timeoutEv)).toBe(true);
    expect(beatsInCollapsedRow(timeoutEv, lateReal)).toBe(false);
  });

  it('超时事件盖过发起时的「处置中」，同档则按时间取最新', () => {
    const ev = (result: string, at: string) =>
      ({ id: 1, event_result: result, event_time: at, source_ref: 'recall_req:7' } as unknown as MailChildEvent);
    const start = ev('handling', '2026-08-10T09:00:00.000Z');
    const timedOut = ev('timeout', '2026-08-11T09:00:00.000Z');
    expect(beatsInCollapsedRow(timedOut, start)).toBe(true);
    // 同档（两条 handling：发起 + 回调回报"仍在处置中"）仍按时间取最新。
    const stillHandling = ev('handling', '2026-08-10T12:00:00.000Z');
    expect(beatsInCollapsedRow(stillHandling, start)).toBe(true);
    expect(beatsInCollapsedRow(start, stillHandling)).toBe(false);
  });
});

describe('召回「超时」文案的四语齐全性', () => {
  const locales: Record<string, unknown> = { en, zh, ru, th };
  for (const [name, msgs] of Object.entries(locales)) {
    it(`${name} 有 eventResult.timeout 且非空`, () => {
      const v = (msgs as Record<string, never>)?.['emailDisposal']?.['detail']?.['analysis']?.['eventResult']?.['timeout'];
      expect(typeof v).toBe('string');
      expect((v as unknown as string).trim().length).toBeGreaterThan(0);
    });
  }

  // 超时与失败必须是**不同**的两句话：产品裁决就是不让它们混在一起，
  // 复制粘贴成同一句会把这个区分在界面上抹掉。
  for (const [name, msgs] of Object.entries(locales)) {
    it(`${name} 的超时文案不与失败文案雷同`, () => {
      const er = (msgs as Record<string, never>)['emailDisposal']['detail']['analysis']['eventResult'];
      expect(er['timeout']).not.toBe(er['failed']);
    });
  }
});
