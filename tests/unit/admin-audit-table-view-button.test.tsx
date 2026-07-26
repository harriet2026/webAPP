import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AdminAuditTable } from '@/components/admin-audit/admin-audit-table';
import type { AdminAuditLog } from '@/lib/api/admin-audit';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const noop = () => {};
const sampleLog = {
  id: 1,
  action: 'update',
  resource_type: 'users',
  resource_id: '7',
  status: 'success',
  operator_name: '张三',
  username: 'zhangsan',
  created_at: '2026-07-24T09:00:00Z',
} as unknown as AdminAuditLog;

const props = {
  logs: [sampleLog],
  onRowClick: noop,
  page: 1,
  pageSize: 20,
  total: 1,
  onPageChange: noop,
  onPageSizeChange: noop,
  showTenant: false,
};

describe('AdminAuditTable row action button — GT-12443 html_spec §2.4', () => {
  it('renders the "查看" text (common.view) next to the Eye icon, not an icon-only button', () => {
    render(<AdminAuditTable {...props} />);
    // The action button must contain the view label; an icon-only button would not.
    expect(screen.getByText('common.view')).toBeTruthy();
  });

  it('styles the action button as a blue (text-primary) ghost button', () => {
    const { container } = render(<AdminAuditTable {...props} />);
    const viewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('common.view'),
    );
    expect(viewBtn).toBeTruthy();
    expect(viewBtn?.className).toContain('text-primary');
    // still carries the Eye icon
    expect(viewBtn?.querySelector('svg')).not.toBeNull();
  });
});
