import { describe, it, expect } from 'vitest';
import {
  mockAdminAuditLogs,
  mockAdminAuditList,
  mockAdminAuditStats,
} from '@/lib/mock/fixtures';

describe('admin-audit mock', () => {
  it('has demo-shaped rows covering key states', () => {
    expect(mockAdminAuditLogs.length).toBeGreaterThanOrEqual(12);
    expect(mockAdminAuditLogs.some((l) => l.status === 'failed' && l.error_message)).toBe(true);
    expect(mockAdminAuditLogs.some((l) => l.before_value && l.after_value)).toBe(true);
    expect(mockAdminAuditLogs.some((l) => l.layer === 'tenant' && l.tenant_id)).toBe(true);
  });

  it('list filters by layer/status/keyword', () => {
    const platform = mockAdminAuditList({ layer: 'platform' });
    expect(platform.items.length).toBeGreaterThan(0);
    expect(platform.items.every((l) => l.layer === 'platform')).toBe(true);

    const failed = mockAdminAuditList({ status: 'failed' });
    expect(failed.items.length).toBeGreaterThan(0);
    expect(failed.items.every((l) => l.status === 'failed')).toBe(true);

    const kw = mockAdminAuditList({ keyword: mockAdminAuditLogs[0].operator_name ?? 'admin' });
    expect(kw.items.length).toBeGreaterThan(0);
  });

  it('stats counts match filtered list', () => {
    const s = mockAdminAuditStats({ layer: 'platform' });
    const list = mockAdminAuditList({ layer: 'platform', page_size: 999 });
    expect(s.total).toBe(list.items.length);
    expect(s.success + s.failed).toBe(s.total);
  });
});
