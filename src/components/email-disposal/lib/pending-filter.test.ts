import { describe, it, expect } from 'vitest';
import { PENDING_DISPOSAL_FILTER, pendingViewFilter } from './pending-filter';

// GT-12608 防回归：去处置深链(view=pending)必须应用与系统状态 KPI 卡同
// 口径的待处置筛选(action ∈ quarantine|sideline)；无参数时不得偷带筛选。
describe('GT-12608 pending deep-link filter', () => {
  it('view=pending applies the shared pending-disposal filter', () => {
    expect(pendingViewFilter('pending')).toBe(PENDING_DISPOSAL_FILTER);
    const values = PENDING_DISPOSAL_FILTER.groups[0].conditions.map((c) => c.value).sort();
    expect(values).toEqual(['quarantine', 'sideline']);
    expect(PENDING_DISPOSAL_FILTER.groups[0].operator).toBe('OR');
  });

  it('no param yields null so the page keeps its V2 default (all mail)', () => {
    expect(pendingViewFilter(null)).toBeNull();
    expect(pendingViewFilter('other')).toBeNull();
  });
});
