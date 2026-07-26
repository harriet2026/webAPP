import { describe, it, expect } from 'vitest';
import type { AdvancedFilter, FilterCondition, FilterConditionGroup, SearchFieldDef } from '@/types/log';

const mockFields: SearchFieldDef[] = [
  {
    key: 'client_ip',
    label: 'Client IP',
    group: 'Basic',
    type: 'text',
    operators: ['eq', 'neq', 'contains', 'not_contains', 'starts_with', 'is_null', 'is_not_null'],
  },
  {
    key: 'spf_valid',
    label: 'SPF',
    group: 'Auth',
    type: 'enum',
    operators: ['eq', 'neq', 'is_null', 'is_not_null'],
    enum_values: [
      { value: 'pass', label: 'Pass' },
      { value: 'fail', label: 'Fail' },
    ],
  },
  {
    key: 'geo_asn',
    label: 'ASN',
    group: 'GeoIP',
    type: 'number',
    operators: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'is_null', 'is_not_null'],
  },
  {
    key: 'authenticated',
    label: 'Authenticated',
    group: 'Auth',
    type: 'boolean',
    operators: ['eq', 'neq', 'is_null', 'is_not_null'],
  },
];

describe('AdvancedFilter Type Validation', () => {
  it('creates a valid empty filter', () => {
    const filter: AdvancedFilter = { operator: 'AND', groups: [] };
    expect(filter.operator).toBe('AND');
    expect(filter.groups).toHaveLength(0);
  });

  it('creates a filter with a single condition group', () => {
    const group: FilterConditionGroup = {
      operator: 'AND',
      conditions: [
        { field: 'client_ip', op: 'contains', value: '192.168' },
      ],
    };
    const filter: AdvancedFilter = { operator: 'AND', groups: [group] };
    expect(filter.groups).toHaveLength(1);
    expect(filter.groups[0].conditions).toHaveLength(1);
    expect(filter.groups[0].conditions[0].field).toBe('client_ip');
  });

  it('creates a filter with NOT group', () => {
    const filter: AdvancedFilter = {
      operator: 'AND',
      groups: [{
        not: true,
        operator: 'AND',
        conditions: [{ field: 'geo_asn', op: 'gt', value: 1000 }],
      }],
    };
    expect(filter.groups[0].not).toBe(true);
  });

  it('creates a filter with multiple groups OR', () => {
    const filter: AdvancedFilter = {
      operator: 'OR',
      groups: [
        { operator: 'AND', conditions: [{ field: 'client_ip', op: 'eq', value: '1.2.3.4' }] },
        { operator: 'AND', conditions: [{ field: 'spf_valid', op: 'eq', value: 'pass' }] },
      ],
    };
    expect(filter.operator).toBe('OR');
    expect(filter.groups).toHaveLength(2);
  });
});

describe('FilterCondition value types', () => {
  it('handles text value', () => {
    const cond: FilterCondition = { field: 'client_ip', op: 'contains', value: '192.168' };
    expect(typeof cond.value).toBe('string');
  });

  it('handles number value', () => {
    const cond: FilterCondition = { field: 'geo_asn', op: 'gt', value: 15169 };
    expect(typeof cond.value).toBe('number');
  });

  it('handles boolean value', () => {
    const cond: FilterCondition = { field: 'authenticated', op: 'eq', value: true };
    expect(typeof cond.value).toBe('boolean');
  });

  it('handles undefined value for is_null', () => {
    const cond: FilterCondition = { field: 'client_ip', op: 'is_null' };
    expect(cond.value).toBeUndefined();
  });
});

describe('AdvancedFilter JSON serialization', () => {
  it('serializes and deserializes correctly', () => {
    const filter: AdvancedFilter = {
      operator: 'AND',
      groups: [
        {
          operator: 'OR',
          conditions: [
            { field: 'client_ip', op: 'contains', value: '10.0' },
            { field: 'spf_valid', op: 'eq', value: 'pass' },
          ],
        },
        {
          not: true,
          operator: 'AND',
          conditions: [
            { field: 'geo_asn', op: 'gt', value: 5000 },
          ],
        },
      ],
    };

    const json = JSON.stringify(filter);
    const parsed: AdvancedFilter = JSON.parse(json);

    expect(parsed.operator).toBe('AND');
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0].operator).toBe('OR');
    expect(parsed.groups[0].conditions).toHaveLength(2);
    expect(parsed.groups[1].not).toBe(true);
    expect(parsed.groups[1].conditions[0].value).toBe(5000);
  });

  it('produces valid query parameter string', () => {
    const filter: AdvancedFilter = {
      operator: 'AND',
      groups: [{
        operator: 'AND',
        conditions: [{ field: 'client_ip', op: 'eq', value: '1.2.3.4' }],
      }],
    };
    const json = JSON.stringify(filter);
    expect(json).toContain('"operator":"AND"');
    expect(json).toContain('"field":"client_ip"');
    expect(json).toContain('"value":"1.2.3.4"');
  });
});

describe('SearchFieldDef structure', () => {
  it('mock fields have required properties', () => {
    for (const f of mockFields) {
      expect(f.key).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(f.group).toBeTruthy();
      expect(f.type).toBeTruthy();
      expect(f.operators.length).toBeGreaterThan(0);
    }
  });

  it('enum fields have enum_values', () => {
    const enumField = mockFields.find((f) => f.type === 'enum');
    expect(enumField).toBeDefined();
    expect(enumField!.enum_values).toBeDefined();
    expect(enumField!.enum_values!.length).toBeGreaterThan(0);
  });

  it('non-enum fields do not need enum_values', () => {
    const textField = mockFields.find((f) => f.type === 'text');
    expect(textField).toBeDefined();
  });

  it('text fields have contains operator', () => {
    const textField = mockFields.find((f) => f.type === 'text');
    expect(textField!.operators).toContain('contains');
  });

  it('number fields have gt/lt operators', () => {
    const numberField = mockFields.find((f) => f.type === 'number');
    expect(numberField!.operators).toContain('gt');
    expect(numberField!.operators).toContain('lt');
  });

  it('boolean fields have eq operator', () => {
    const boolField = mockFields.find((f) => f.type === 'boolean');
    expect(boolField!.operators).toContain('eq');
    expect(boolField!.operators).not.toContain('contains');
  });

  it('all field types have is_null/is_not_null', () => {
    for (const f of mockFields) {
      expect(f.operators).toContain('is_null');
      expect(f.operators).toContain('is_not_null');
    }
  });
});

describe('EmailLogSearchParams with advanced_filters', () => {
  it('includes advanced_filters as JSON string', () => {
    const filter: AdvancedFilter = {
      operator: 'AND',
      groups: [{
        operator: 'AND',
        conditions: [{ field: 'client_ip', op: 'contains', value: '10.0' }],
      }],
    };
    const params = {
      start_date: '2025-01-01',
      end_date: '2025-01-31',
      sender: 'test@example.com',
      action: 'reject',
      page: 1,
      page_size: 20,
      advanced_filters: JSON.stringify(filter),
    };

    expect(params.advanced_filters).toBeDefined();
    const parsed = JSON.parse(params.advanced_filters);
    expect(parsed.operator).toBe('AND');
    expect(parsed.groups[0].conditions[0].field).toBe('client_ip');
  });

  it('advanced_filters is undefined when not used', () => {
    const params = {
      start_date: '2025-01-01',
      sender: 'test@example.com',
      page: 1,
      page_size: 20,
    };
    expect(params).not.toHaveProperty('advanced_filters');
  });
});
