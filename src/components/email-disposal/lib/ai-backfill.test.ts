import { describe, it, expect } from 'vitest';
import { backfillAiFilter } from './ai-backfill';
import type { AdvancedFilter, FilterConditionGroup } from '@/types/log';

function andFilter(groups: FilterConditionGroup[]): AdvancedFilter {
  return { operator: 'AND', groups };
}

describe('backfillAiFilter', () => {
  it('returns empty result for a null filter', () => {
    const result = backfillAiFilter(null);
    expect(result).toEqual({ quick: {}, advanced: [], residual: [] });
  });

  it('returns empty result for a filter with no groups', () => {
    const result = backfillAiFilter(andFilter([]));
    expect(result).toEqual({ quick: {}, advanced: [], residual: [] });
  });

  describe('level 1: quick filter controls (top-level AND + group AND)', () => {
    it('maps received_at between to sendReceiveTime, normalizing RFC3339 to date-only', () => {
      const result = backfillAiFilter(
        andFilter([
          {
            operator: 'AND',
            conditions: [
              { field: 'received_at', op: 'between', value: ['2026-07-18T00:00:00Z', '2026-07-25T23:59:59Z'] },
            ],
          },
        ]),
      );
      expect(result.quick.sendReceiveTime).toEqual({ start: '2026-07-18', end: '2026-07-25' });
      expect(result.advanced).toEqual([]);
      expect(result.residual).toEqual([]);
    });

    it('maps received_at gte to sendReceiveTime.start with end left blank', () => {
      const result = backfillAiFilter(
        andFilter([{ operator: 'AND', conditions: [{ field: 'received_at', op: 'gte', value: '2026-07-01' }] }]),
      );
      expect(result.quick.sendReceiveTime).toEqual({ start: '2026-07-01', end: '' });
    });

    it('maps received_at lte to sendReceiveTime.end with start left blank', () => {
      const result = backfillAiFilter(
        andFilter([{ operator: 'AND', conditions: [{ field: 'received_at', op: 'lte', value: '2026-07-25' }] }]),
      );
      expect(result.quick.sendReceiveTime).toEqual({ start: '', end: '2026-07-25' });
    });

    it('maps received_at eq to a single-day sendReceiveTime range', () => {
      const result = backfillAiFilter(
        andFilter([{ operator: 'AND', conditions: [{ field: 'received_at', op: 'eq', value: '2026-07-20' }] }]),
      );
      expect(result.quick.sendReceiveTime).toEqual({ start: '2026-07-20', end: '2026-07-20' });
    });

    it('combines a gte + lte pair in the same group into one range instead of clobbering each other', () => {
      const result = backfillAiFilter(
        andFilter([
          {
            operator: 'AND',
            conditions: [
              { field: 'received_at', op: 'gte', value: '2026-07-01' },
              { field: 'received_at', op: 'lte', value: '2026-07-31' },
            ],
          },
        ]),
      );
      expect(result.quick.sendReceiveTime).toEqual({ start: '2026-07-01', end: '2026-07-31' });
    });

    it('maps display_status in to emailStatuses array', () => {
      const result = backfillAiFilter(
        andFilter([
          { operator: 'AND', conditions: [{ field: 'display_status', op: 'in', value: ['delivered', 'rejected'] }] },
        ]),
      );
      expect(result.quick.emailStatuses).toEqual(['delivered', 'rejected']);
    });

    it('wraps a display_status eq single value into a one-element array', () => {
      const result = backfillAiFilter(
        andFilter([{ operator: 'AND', conditions: [{ field: 'display_status', op: 'eq', value: 'delivered' }] }]),
      );
      expect(result.quick.emailStatuses).toEqual(['delivered']);
    });

    it('maps email_type in to emailTypes array', () => {
      const result = backfillAiFilter(
        andFilter([{ operator: 'AND', conditions: [{ field: 'email_type', op: 'in', value: ['spam', 'phishing'] }] }]),
      );
      expect(result.quick.emailTypes).toEqual(['spam', 'phishing']);
    });

    it('maps disposal_policy_key in to disposalPolicyKeys array', () => {
      const result = backfillAiFilter(
        andFilter([
          { operator: 'AND', conditions: [{ field: 'disposal_policy_key', op: 'in', value: ['IPBL', 'CR'] }] },
        ]),
      );
      expect(result.quick.disposalPolicyKeys).toEqual(['IPBL', 'CR']);
    });

    it('maps direction eq using the disposal-api.ts directionMap reversed (backend -> quick control value)', () => {
      const result = backfillAiFilter(
        andFilter([{ operator: 'AND', conditions: [{ field: 'direction', op: 'eq', value: 'receive' }] }]),
      );
      expect(result.quick.sendReceiveType).toBe('incoming');
    });

    it('maps action eq to executionAction verbatim', () => {
      const result = backfillAiFilter(
        andFilter([{ operator: 'AND', conditions: [{ field: 'action', op: 'eq', value: 'quarantine' }] }]),
      );
      expect(result.quick.executionAction).toBe('quarantine');
    });

    it('maps sender/subject contains to the matching quick text fields', () => {
      const result = backfillAiFilter(
        andFilter([
          {
            operator: 'AND',
            conditions: [
              { field: 'sender', op: 'contains', value: 'alice' },
              { field: 'subject', op: 'contains', value: 'invoice' },
            ],
          },
        ]),
      );
      expect(result.quick.sender).toBe('alice');
      expect(result.quick.subject).toBe('invoice');
    });

    it('maps header_recipient/envelope_recipient contains to quick.recipient', () => {
      const r1 = backfillAiFilter(
        andFilter([{ operator: 'AND', conditions: [{ field: 'header_recipient', op: 'contains', value: 'bob' }] }]),
      );
      expect(r1.quick.recipient).toBe('bob');

      const r2 = backfillAiFilter(
        andFilter([
          { operator: 'AND', conditions: [{ field: 'envelope_recipient', op: 'contains', value: 'carol' }] },
        ]),
      );
      expect(r2.quick.recipient).toBe('carol');
    });

    it('maps geo_region_name contains to ipLocation', () => {
      const result = backfillAiFilter(
        andFilter([{ operator: 'AND', conditions: [{ field: 'geo_region_name', op: 'contains', value: '广东' }] }]),
      );
      expect(result.quick.ipLocation).toBe('广东');
    });

    it('maps every condition of multiple independent AND groups into quick, later groups overriding earlier ones on the same field', () => {
      const result = backfillAiFilter(
        andFilter([
          { operator: 'AND', conditions: [{ field: 'sender', op: 'contains', value: 'first' }] },
          { operator: 'AND', conditions: [{ field: 'subject', op: 'contains', value: 'second' }] },
          { operator: 'AND', conditions: [{ field: 'sender', op: 'contains', value: 'overwritten' }] },
        ]),
      );
      expect(result.quick.sender).toBe('overwritten');
      expect(result.quick.subject).toBe('second');
    });
  });

  describe('groups that do not qualify for level 1 fall through as a whole', () => {
    it('sends the whole top-level OR filter to level 2/3, never to quick, even though fields/ops would otherwise qualify', () => {
      const result = backfillAiFilter({
        operator: 'OR',
        groups: [
          { operator: 'AND', conditions: [{ field: 'sender', op: 'contains', value: 'alice' }] },
          { operator: 'AND', conditions: [{ field: 'display_status', op: 'eq', value: 'delivered' }] },
        ],
      });
      expect(result.quick).toEqual({});
      // sender is FIELD_GROUPS-eligible -> level 2 advanced.
      expect(result.advanced).toHaveLength(1);
      expect(result.advanced[0].conditions[0].field).toBe('sender');
      // display_status is not in advanced-filters.tsx FIELD_GROUPS -> level 3 residual.
      expect(result.residual).toEqual([{ field: 'display_status', op: 'eq', value: 'delivered', source: 'ai' }]);
    });

    it('sends a group with operator OR (even under a top-level AND filter) to level 2/3', () => {
      const result = backfillAiFilter(
        andFilter([
          {
            operator: 'OR',
            conditions: [
              { field: 'sender', op: 'contains', value: 'alice' },
              { field: 'sender', op: 'contains', value: 'bob' },
            ],
          },
        ]),
      );
      expect(result.quick).toEqual({});
      expect(result.advanced).toHaveLength(1);
      expect(result.advanced[0].operator).toBe('OR');
    });

    it('falls the whole group through to level 2/3 when only one condition in an AND group fails level-1 shape (op mismatch)', () => {
      const result = backfillAiFilter(
        andFilter([
          {
            operator: 'AND',
            conditions: [
              { field: 'sender', op: 'contains', value: 'alice' },
              // regex is not a level-1-mappable op for sender (only "contains" is).
              { field: 'sender', op: 'regex', value: '^a.*' },
            ],
          },
        ]),
      );
      expect(result.quick).toEqual({});
      // both fields are "sender", which IS in FIELD_GROUPS -> whole group to advanced.
      expect(result.advanced).toHaveLength(1);
      expect(result.advanced[0].conditions).toHaveLength(2);
    });
  });

  describe('level 2: advanced filter builder groups', () => {
    it('puts a group whose fields are all in FIELD_GROUPS into advanced, preserving operator/conditions structurally', () => {
      const result = backfillAiFilter(
        andFilter([
          {
            operator: 'AND',
            conditions: [
              { field: 'spf_valid', op: 'eq', value: 'fail' },
              { field: 'storage_size', op: 'gt', value: 1024 },
            ],
          },
        ]),
      );
      expect(result.advanced).toEqual([
        {
          operator: 'AND',
          conditions: [
            { field: 'spf_valid', op: 'eq', value: 'fail' },
            { field: 'storage_size', op: 'gt', value: 1024 },
          ],
        },
      ]);
      expect(result.residual).toEqual([]);
    });
  });

  describe('level 3: residual AI chips', () => {
    it('sends fields outside FIELD_GROUPS (that also fail level 1) to residual, one AICondition per source condition', () => {
      const result = backfillAiFilter(
        andFilter([
          {
            operator: 'AND',
            conditions: [
              // "eq" is not a level-1-mappable op for received_at with an array value (malformed shape).
              { field: 'received_at', op: 'eq', value: ['2026-07-01', '2026-07-02'] },
            ],
          },
        ]),
      );
      expect(result.quick).toEqual({});
      expect(result.advanced).toEqual([]);
      expect(result.residual).toEqual([
        { field: 'received_at', op: 'eq', value: ['2026-07-01', '2026-07-02'], source: 'ai' },
      ]);
    });

    it('sends a mixed group (some FIELD_GROUPS fields, some not) entirely to residual rather than splitting it', () => {
      const result = backfillAiFilter(
        andFilter([
          {
            operator: 'OR',
            conditions: [
              { field: 'sender', op: 'contains', value: 'alice' },
              { field: 'display_status', op: 'eq', value: 'delivered' },
            ],
          },
        ]),
      );
      expect(result.advanced).toEqual([]);
      expect(result.residual).toEqual([
        { field: 'sender', op: 'contains', value: 'alice', source: 'ai' },
        { field: 'display_status', op: 'eq', value: 'delivered', source: 'ai' },
      ]);
    });

    it('preserves is_null/is_not_null conditions with an undefined value', () => {
      const result = backfillAiFilter(
        andFilter([
          { operator: 'OR', conditions: [{ field: 'tid', op: 'is_null' }, { field: 'display_status', op: 'eq', value: 'delivered' }] },
        ]),
      );
      expect(result.residual).toEqual([
        { field: 'tid', op: 'is_null', value: undefined, source: 'ai' },
        { field: 'display_status', op: 'eq', value: 'delivered', source: 'ai' },
      ]);
    });
  });

  describe('the 5-group cap on the advanced builder', () => {
    function orGroupWithField(field: string): FilterConditionGroup {
      // operator OR so it never qualifies for level 1, forcing it to compete for level-2 slots.
      return { operator: 'OR', conditions: [{ field, op: 'eq', value: 'fail' }] };
    }

    it('keeps only the first 5 level-2-eligible groups in advanced and downgrades the rest to residual', () => {
      const result = backfillAiFilter(
        andFilter([
          orGroupWithField('spf_valid'),
          orGroupWithField('dkim_valid'),
          orGroupWithField('dmarc_valid'),
          orGroupWithField('ptr_valid'),
          orGroupWithField('mail_from_empty'),
          orGroupWithField('virus_scan_result'),
        ]),
      );
      expect(result.advanced).toHaveLength(5);
      expect(result.advanced.map((g) => g.conditions[0].field)).toEqual([
        'spf_valid',
        'dkim_valid',
        'dmarc_valid',
        'ptr_valid',
        'mail_from_empty',
      ]);
      expect(result.residual).toEqual([
        { field: 'virus_scan_result', op: 'eq', value: 'fail', source: 'ai' },
      ]);
    });

    it('accounts for already-existing advanced groups via the second argument', () => {
      const result = backfillAiFilter(
        andFilter([orGroupWithField('spf_valid'), orGroupWithField('dkim_valid')]),
        4,
      );
      expect(result.advanced).toHaveLength(1);
      expect(result.advanced[0].conditions[0].field).toBe('spf_valid');
      expect(result.residual).toEqual([{ field: 'dkim_valid', op: 'eq', value: 'fail', source: 'ai' }]);
    });

    it('downgrades everything to residual when there is no room left at all', () => {
      const result = backfillAiFilter(andFilter([orGroupWithField('spf_valid')]), 5);
      expect(result.advanced).toEqual([]);
      expect(result.residual).toEqual([{ field: 'spf_valid', op: 'eq', value: 'fail', source: 'ai' }]);
    });
  });
});
