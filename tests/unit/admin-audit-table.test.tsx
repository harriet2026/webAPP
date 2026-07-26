import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AdminAuditTable } from '@/components/admin-audit/admin-audit-table';
import type { AdminAuditLog } from '@/lib/api/admin-audit';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const noop = () => {};

const baseProps = (overrides: Partial<Parameters<typeof AdminAuditTable>[0]> = {}) => ({
  logs: [] as AdminAuditLog[],
  onRowClick: noop,
  page: 1,
  pageSize: 20,
  total: 0,
  onPageChange: noop,
  onPageSizeChange: noop,
  ...overrides,
});

describe('AdminAuditTable empty-state colSpan — review finding #7', () => {
  it('renders an empty-state row whose colSpan matches the header column count (showTenant=false)', () => {
    const { container } = render(<AdminAuditTable {...baseProps({ showTenant: false })} />);
    const headerCells = container.querySelectorAll('thead th');
    const emptyCell = screen.getByText('adminAudit.empty').closest('td');
    expect(emptyCell).not.toBeNull();
    expect(emptyCell?.getAttribute('colSpan')).toBe(String(headerCells.length));
    // 7 columns: timestamp, adminUser, module, opType, resourceType, result, viewDetails
    expect(headerCells.length).toBe(7);
  });

  it('renders an empty-state row whose colSpan matches the header column count (showTenant=true)', () => {
    const { container } = render(<AdminAuditTable {...baseProps({ showTenant: true })} />);
    const headerCells = container.querySelectorAll('thead th');
    const emptyCell = screen.getByText('adminAudit.empty').closest('td');
    expect(emptyCell).not.toBeNull();
    expect(emptyCell?.getAttribute('colSpan')).toBe(String(headerCells.length));
    // 8 columns: + effectiveTenant
    expect(headerCells.length).toBe(8);
  });
});
