import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { AdminAuditTable } from '@/components/admin-audit/admin-audit-table';
import type { AdminAuditLog } from '@/lib/api/admin-audit';
import zh from '@/../messages/zh.json';

// next-intl is mocked in admin-audit-table.test.tsx with key-passthrough; here we
// import zh.json directly to assert the *values* the renamed keys resolve to, and
// mount the table to assert the header *wiring* (which i18n keys each column uses).
import { vi } from 'vitest';
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const noop = () => {};
const baseProps = {
  logs: [] as AdminAuditLog[],
  onRowClick: noop,
  page: 1,
  pageSize: 20,
  total: 0,
  onPageChange: noop,
  onPageSizeChange: noop,
};

describe('AdminAuditTable header column names — GT-12441 html_spec §2.4', () => {
  it('wires the 7 columns to the prototype-aligned i18n keys (result→resultColumn, action→common.actions)', () => {
    const { container } = render(<AdminAuditTable {...baseProps} showTenant={false} />);
    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(headers).toEqual([
      'logs.timestamp',
      'adminAudit.adminUser',
      'adminAudit.filter.module',
      'adminAudit.filter.opType',
      'adminAudit.resourceType',
      'adminAudit.resultColumn',
      'common.actions',
    ]);
    // The old header keys must be gone (result column no longer reuses the filter
    // label 操作结果; action column no longer says 查看详情).
    expect(headers).not.toContain('adminAudit.filter.result');
    expect(headers).not.toContain('adminAudit.viewDetails');
  });

  it('resolves the renamed keys to the prototype text: 操作者 / 操作对象 / 结果 / 操作', () => {
    const aa = (zh as unknown as { adminAudit: Record<string, string> }).adminAudit;
    const common = (zh as unknown as { common: Record<string, string> }).common;
    expect(aa.adminUser).toBe('操作者');
    expect(aa.resourceType).toBe('操作对象');
    expect(aa.resultColumn).toBe('结果');
    expect(common.actions).toBe('操作');
    // The filter label stays 操作结果 (prototype filter label differs from the
    // 结果 column header — they must not be collapsed to one key).
    expect((aa.filter as unknown as Record<string, string>).result).toBe('操作结果');
  });
});
