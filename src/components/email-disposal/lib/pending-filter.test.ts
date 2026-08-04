import { describe, it, expect } from 'vitest';
import { PENDING_DISPOSAL_FILTER, pendingViewFilter } from './pending-filter';

// GT-12608 防回归：去处置深链(view=pending)必须应用与系统状态 KPI 卡同
// 口径的待处置展示状态；无参数时不得偷带筛选。
describe('GT-12608 pending deep-link filter', () => {
  it('view=pending applies the shared pending-disposal filter', () => {
    expect(pendingViewFilter('pending')).toBe(PENDING_DISPOSAL_FILTER);
    expect(PENDING_DISPOSAL_FILTER.groups).toEqual([
      {
        operator: 'AND',
        conditions: [
          {
            field: 'display_status',
            op: 'in',
            value: ['quarantine_pending', 'sideline_pending'],
          },
        ],
      },
    ]);
  });

  it('no param yields null so the page keeps its V2 default (all mail)', () => {
    expect(pendingViewFilter(null)).toBeNull();
    expect(pendingViewFilter('other')).toBeNull();
  });
});
