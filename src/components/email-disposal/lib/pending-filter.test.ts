import { describe, it, expect } from 'vitest';
import {
  PENDING_DISPOSAL_QUICK_FILTER,
  disposalDeepLinkQuickFilter,
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

describe('GT-14263 similar-detection observation deep-link filter', () => {
  it.each([
    ['receive', 'incoming'],
    ['send', 'outgoing'],
    ['internal', 'internal'],
  ])('maps direction=%s and similar=matched to disposal quick filters', (direction, expected) => {
    const params = new URLSearchParams({ similar: 'matched', direction });

    expect(disposalDeepLinkQuickFilter(params)).toEqual({
      sendReceiveType: expected,
      disposalPolicyKeys: ['SIM'],
    });
  });

  it('keeps the existing pending view filter when deep-link parameters are combined', () => {
    const params = new URLSearchParams({
      view: 'pending',
      similar: 'matched',
      direction: 'receive',
    });

    expect(disposalDeepLinkQuickFilter(params)).toEqual({
      emailStatuses: ['quarantine_pending', 'audit_pending'],
      sendReceiveType: 'incoming',
      disposalPolicyKeys: ['SIM'],
    });
  });

  it('ignores unknown deep-link values and leaves the default page unfiltered', () => {
    const params = new URLSearchParams({ similar: 'other', direction: 'other' });

    expect(disposalDeepLinkQuickFilter(params)).toBeNull();
  });
});
