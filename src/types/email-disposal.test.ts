import { describe, it, expect } from 'vitest';
import { EXECUTION_ACTIONS } from './email-disposal';

// EXECUTION_ACTIONS 是执行动作筛选项的前端单一真源（处置中心搜索的 action 虚拟字段
// 枚举、安全总览 trend.action 序列 key 都来自它），必须与后端
// internal/models/security_overview.go 的 AllActions 逐字一致 —— 前端多一项就会
// 构造出后端拒绝的筛选条件（action 虚拟字段是服务端校验的），少一项则筛不到那类邮件。
//
// GT-12659 / GT-12660：mark_deliver 与 advanced_review 已从两侧同时移除。
// 前者随"标记"这一处置概念整体下线（其邮件并入 deliver）；后者是旁路检测进行中的
// 中间态（sideline + sideline_pending），不是处置结果。
const BACKEND_ALL_ACTIONS = [
  'deliver',
  'quarantine',
  'review',
  'block',
  'drop',
  'recall',
] as const;

describe('EXECUTION_ACTIONS', () => {
  it('mirrors backend AllActions exactly', () => {
    expect(EXECUTION_ACTIONS).toEqual(BACKEND_ALL_ACTIONS);
  });

  it('carries neither retired action', () => {
    for (const retired of ['mark_deliver', 'advanced_review']) {
      expect(EXECUTION_ACTIONS as readonly string[]).not.toContain(retired);
    }
  });
});
