import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { AdminAuditTable } from '@/components/admin-audit/admin-audit-table';
import type { AdminAuditLog } from '@/lib/api/admin-audit';

import { vi } from 'vitest';

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

// GT-12442: html_spec 原型 §2.4 操作类型/操作结果徽章为 rounded(0.25rem 偏方)，
// 而共享 Badge 组件基类是 rounded-4xl(胶囊)。table 在 className 追加 rounded 覆盖，
// tailwind-merge(cn) 同组后者胜，最终 DOM class 应含 rounded、去掉 rounded-4xl。
// 若有人移除该覆盖，class 会退回 rounded-4xl，本用例即变红。
const ROUNDED = /(^|\s)rounded(\s|$)/; // 精确匹配 rounded，排除 rounded-4xl/rounded-md 等

function badgeByText(container: HTMLElement, text: string): HTMLElement | undefined {
  return Array.from(container.querySelectorAll('span')).find(
    (el) => el.textContent?.trim() === text && el.className.includes('inline-flex'),
  ) as HTMLElement | undefined;
}

describe('AdminAuditTable badge radius — GT-12442 html_spec §2.4', () => {
  it('renders the 操作类型 badge with rounded (方角), not rounded-4xl (胶囊)', () => {
    const { container } = render(<AdminAuditTable {...props} />);
    const opBadge = badgeByText(container, 'adminAudit.opType.update');
    expect(opBadge).toBeTruthy();
    expect(opBadge!.className).toMatch(ROUNDED);
    expect(opBadge!.className).not.toContain('rounded-4xl');
  });

  it('renders the 操作结果 badge with rounded (方角), not rounded-4xl (胶囊)', () => {
    const { container } = render(<AdminAuditTable {...props} />);
    const resultBadge = badgeByText(container, 'adminAudit.stats.success');
    expect(resultBadge).toBeTruthy();
    expect(resultBadge!.className).toMatch(ROUNDED);
    expect(resultBadge!.className).not.toContain('rounded-4xl');
  });

  it('renders the failed 操作结果 badge with rounded, not rounded-4xl', () => {
    const failedProps = { ...props, logs: [{ ...sampleLog, status: 'failed' } as unknown as AdminAuditLog] };
    const { container } = render(<AdminAuditTable {...failedProps} />);
    const resultBadge = badgeByText(container, 'adminAudit.stats.failed');
    expect(resultBadge).toBeTruthy();
    expect(resultBadge!.className).toMatch(ROUNDED);
    expect(resultBadge!.className).not.toContain('rounded-4xl');
  });
});
