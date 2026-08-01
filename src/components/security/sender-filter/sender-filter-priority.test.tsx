import { describe, it, expect } from 'vitest';
import { getRulePriorityRange, isPriorityInRange } from '../advanced-filter-rules/priority-range';
import { getSenderFilterDefaultPriority } from './priority-defaults';

// GT-12693：后端 internal/api/unified_rules.go 的 validatePriority 对
// tenant_admin 把优先级收窄到 100-1000（全局 0-9999）。发信人黑白名单抽屉
// 此前写死 1-9999 且完全没有角色判断，租户管理员手改优先级必然 400。
//
// 断言写成"表单允许的范围必须与后端约束一致"，而不是断言某个具体数字——
// 后者在后端约束变化时不会红。
describe('发信人黑白名单优先级范围 (GT-12693)', () => {
  it('租户管理员的范围是后端 validatePriority 的 100-1000', () => {
    const r = getRulePriorityRange(false);
    expect(r.min).toBe(100);
    expect(r.max).toBe(1000);
    // 后端会拒绝的值，前端也必须判为越界，否则用户填得进去、保存必 400。
    expect(isPriorityInRange(1, r)).toBe(false);
    expect(isPriorityInRange(9999, r)).toBe(false);
    expect(isPriorityInRange(50, r)).toBe(false);
  });

  it('平台管理员保留全量范围', () => {
    const r = getRulePriorityRange(true);
    expect(r.min).toBe(0);
    expect(r.max).toBe(9999);
    expect(isPriorityInRange(9999, r)).toBe(true);
  });

  // 默认值本来就落在 100-1000 内（黑名单 500 / 白名单 800 / 直投 999），
  // 所以本缺陷只在用户手改优先级时才踩到。这条锁住"默认值不能漂出租户范围"，
  // 否则以后调默认值会让每个租户管理员一保存就 400。
  it('三种默认值都必须落在租户管理员范围内', () => {
    const tenantRange = getRulePriorityRange(false);
    for (const p of [
      getSenderFilterDefaultPriority('blacklist'),
      getSenderFilterDefaultPriority('whitelist'),
      getSenderFilterDefaultPriority('whitelist', 'direct_deliver'),
    ]) {
      expect(isPriorityInRange(p, tenantRange)).toBe(true);
    }
  });
});
