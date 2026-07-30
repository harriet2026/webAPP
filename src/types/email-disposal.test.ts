import { describe, it, expect } from 'vitest';
import { EXECUTION_ACTIONS } from './email-disposal';

// EXECUTION_ACTIONS 是执行动作的前端单一真源，key 必须与后端
// internal/models/security_overview.go 的 AllActions 完全一致（处置中心
// 搜索的 action 虚拟字段枚举、安全总览 trend.action 序列 key 都来自它）。
// 后端第 3 个动作是 advanced_review（sideline_pending 高级检测），不存在
// greylist —— 原型里的 greylist 是沿用旧 sideline 槽位的误命名。
describe('EXECUTION_ACTIONS', () => {
  it('mirrors backend AllActions exactly', () => {
    expect(EXECUTION_ACTIONS).toEqual([
      'deliver',
      'mark_deliver',
      'advanced_review',
      'quarantine',
      'review',
      'block',
      'drop',
      'recall',
    ]);
  });
});
