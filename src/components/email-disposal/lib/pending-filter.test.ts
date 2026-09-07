import { describe, it, expect } from 'vitest';
import {
  PENDING_DISPOSAL_QUICK_FILTER,
  pendingViewQuickFilter,
} from './pending-filter';

// GT-12608 防回归：去处置深链(view=pending)必须应用与系统状态 KPI 卡同
// 口径的待处置展示状态；无参数时不得偷带筛选。
describe('GT-12608 pending deep-link filter', () => {
  it('view=pending initializes the same multi-select model used by manual status choices', () => {
    expect(pendingViewQuickFilter('pending')).toBe(PENDING_DISPOSAL_QUICK_FILTER);
    expect(PENDING_DISPOSAL_QUICK_FILTER).toEqual({
      emailStatuses: ['quarantine_pending', 'audit_pending'],
    });
  });

  it('no param yields null so the page keeps its V2 default (all mail)', () => {
    expect(pendingViewQuickFilter(null)).toBeNull();
    expect(pendingViewQuickFilter('other')).toBeNull();
  });
});
