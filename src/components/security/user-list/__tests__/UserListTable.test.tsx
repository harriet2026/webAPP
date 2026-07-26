import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import { UserListTable } from '../UserListTable';
import type { UserListView } from '@/lib/api/user-list';

const row = (o: Partial<UserListView>): UserListView => ({
  id: 1, ruleId: 'UB-20260320-001', sender: 'spam@bad-actor.com', recipient: 'alice@company.com',
  action: 'quarantine', status: 'enabled', createdBy: 'admin@company.com',
  modifyTime: '2026-03-20T10:30:00Z', listType: 'blacklist', raw: {} as never, ...o,
});
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="zh" messages={zh}>{ui}</NextIntlClientProvider>);

describe('UserListTable', () => {
  it('renders 9 header columns and no edit button', () => {
    wrap(<UserListTable rows={[row({})]} selectedIds={new Set()} onToggleRow={vi.fn()} onToggleAll={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByRole('columnheader').length).toBe(9);
    expect(screen.queryByLabelText('编辑')).toBeNull();
  });
  it('shows quarantine badge as 隔离 and red block badge as 阻断', () => {
    wrap(<UserListTable rows={[row({ action: 'block' })]} selectedIds={new Set()} onToggleRow={vi.fn()} onToggleAll={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('阻断')).toBeTruthy();
  });
  it('calls onDelete when row trash clicked', async () => {
    const onDelete = vi.fn();
    wrap(<UserListTable rows={[row({})]} selectedIds={new Set()} onToggleRow={vi.fn()} onToggleAll={vi.fn()} onDelete={onDelete} />);
    screen.getByLabelText('删除').click();
    expect(onDelete).toHaveBeenCalled();
  });
});
