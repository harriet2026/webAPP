import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const rblRuleSchema = z.object({
  rbl_domain: z.string().min(1),
  dns_result_pattern: z.string().min(1),
  action: z.enum(['reject', 'quarantine']),
  priority: z.number().optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

type RBLRuleForm = z.infer<typeof rblRuleSchema>;

describe('RBL Rule Schema Validation', () => {
  it('validates a complete valid form', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'zen.spamhaus.org',
      dns_result_pattern: '.*',
      action: 'reject',
      priority: 100,
      description: 'Test rule',
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  it('validates with minimal required fields', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'bl.spamcop.net',
      dns_result_pattern: '127\\.0\\.0\\.',
      action: 'quarantine',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty rbl_domain', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: '',
      dns_result_pattern: '.*',
      action: 'reject',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty dns_result_pattern', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'zen.spamhaus.org',
      dns_result_pattern: '',
      action: 'reject',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid action', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'zen.spamhaus.org',
      dns_result_pattern: '.*',
      action: 'accept',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing rbl_domain', () => {
    const result = rblRuleSchema.safeParse({
      dns_result_pattern: '.*',
      action: 'reject',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing dns_result_pattern', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'zen.spamhaus.org',
      action: 'reject',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing action', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'zen.spamhaus.org',
      dns_result_pattern: '.*',
    });
    expect(result.success).toBe(false);
  });

  it('accepts quarantine action', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'zen.spamhaus.org',
      dns_result_pattern: '.*',
      action: 'quarantine',
    });
    expect(result.success).toBe(true);
  });

  it('accepts regex pattern for dns_result_pattern', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'zen.spamhaus.org',
      dns_result_pattern: '^127\\.0\\.0\\.[0-9]+$',
      action: 'reject',
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero priority', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'zen.spamhaus.org',
      dns_result_pattern: '.*',
      action: 'reject',
      priority: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(0);
    }
  });

  it('accepts negative priority', () => {
    const result = rblRuleSchema.safeParse({
      rbl_domain: 'zen.spamhaus.org',
      dns_result_pattern: '.*',
      action: 'reject',
      priority: -1,
    });
    expect(result.success).toBe(true);
  });
});

describe('RBL Rule Type Inference', () => {
  it('correctly infers form type from schema', () => {
    const form: RBLRuleForm = {
      rbl_domain: 'zen.spamhaus.org',
      dns_result_pattern: '.*',
      action: 'reject',
    };
    expect(form.rbl_domain).toBe('zen.spamhaus.org');
    expect(form.action).toBe('reject');
  });
});
