import { describe, expect, it } from 'vitest';

import {
  EMPTY_ADMIN_FILTERS,
  filtersToParams,
  type AdminFilterState,
} from '@/components/admin-audit/admin-audit-filters';

describe('EMPTY_ADMIN_FILTERS', () => {
  it('has every filter field blank so it fully clears the filter card (spec §6 reset)', () => {
    const keys: (keyof AdminFilterState)[] = ['keyword', 'module', 'opType', 'result', 'tenant'];
    for (const k of keys) {
      expect(EMPTY_ADMIN_FILTERS[k]).toBe('');
    }
  });

  it('maps to no active backend params — resetting to it drops every server-side filter', () => {
    // The page resets to EMPTY_ADMIN_FILTERS on the reset button and on layer-tab
    // switch; this asserts that reset actually removes keyword/action/resource_type/
    // status from the query so the list is un-filtered.
    const params = filtersToParams(EMPTY_ADMIN_FILTERS);
    expect(params.keyword).toBeUndefined();
    expect(params.action).toBeUndefined();
    expect(params.resource_type).toBeUndefined();
    expect(params.status).toBeUndefined();
  });
});

describe('filtersToParams', () => {
  it('maps populated UI fields to their backend param names', () => {
    const filters: AdminFilterState = {
      keyword: '  ', // note: page debounces/trims elsewhere; here non-empty passes through
      module: 'users',
      opType: 'update',
      result: 'failed',
      tenant: '5',
    };
    // A non-empty string is preserved; only empty-string collapses to undefined.
    const params = filtersToParams({ ...filters, keyword: 'admin' });
    expect(params).toEqual({
      keyword: 'admin',
      action: 'update',
      resource_type: 'users',
      status: 'failed',
    });
  });

  it('does not carry tenant/layer (those are derived from view mode / drill-down, not the filter card)', () => {
    const params = filtersToParams({
      keyword: '',
      module: '',
      opType: '',
      result: 'success',
      tenant: '9',
    });
    expect(params).not.toHaveProperty('tenant_id');
    expect(params).not.toHaveProperty('layer');
    expect(params.status).toBe('success');
  });
});
