import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';

// Mock heavy UI deps before importing the component under test.
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? createElement('div', null, children) : null,
  SheetContent: ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children),
  SheetHeader: ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children),
  SheetTitle: ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children),
  SheetDescription: ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) =>
    createElement('span', null, children),
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement('button', props, children),
}));

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string) => key,
}));

vi.mock('@/lib/utils', () => ({ formatDate: (s: string) => s }));

vi.mock('@/lib/admin-audit', () => ({
  formatAdminAuditDetailsPreview: (d: unknown) => JSON.stringify(d),
  getAdminAuditContext: () => ({
    actorUserId: undefined,
    effectiveTenantId: undefined,
    isImpersonating: false,
    effectiveTenantSource: '',
    requestedTenantIdHeader: '',
  }),
  diffText: (v?: Record<string, unknown>) =>
    !v || Object.keys(v).length === 0 ? '—' : typeof v.text === 'string' ? v.text : JSON.stringify(v),
  summaryText: (log: { details?: Record<string, unknown> }) =>
    log.details && typeof log.details.summary === 'string' ? log.details.summary : '—',
}));

// The drawer imports taxonomy via the relative './admin-audit-taxonomy';
// vitest resolves that to the same module path, so we mock by absolute path.
vi.mock('@/components/admin-audit/admin-audit-taxonomy', () => ({
  moduleOf: () => ({ subKey: 'sidebar.rules', topKey: 'sidebar.rules' }),
  opTypeMeta: () => ({ labelKey: 'adminAudit.op.update', badge: '' }),
}));

import { AdminAuditDetailDrawer } from '@/components/admin-audit/admin-audit-detail-drawer';
import type { AdminAuditLog } from '@/lib/api/admin-audit';

function makeLog(overrides: Partial<AdminAuditLog> = {}): AdminAuditLog {
  return {
    id: 1,
    operation_id: 'op-1',
    admin_user_id: 1,
    username: 'admin',
    action: 'update',
    resource_type: 'rules',
    status: 'failed',
    client_ip: '10.0.0.1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as AdminAuditLog;
}

describe('AdminAuditDetailDrawer — failure-reason fallback (review 4.5)', () => {
  it('shows error_message when present', () => {
    const log = makeLog({ error_message: '存在未结清工单' });
    render(createElement(AdminAuditDetailDrawer, { log, onClose: () => {} }));
    expect(screen.getByText('存在未结清工单')).toBeTruthy();
  });

  it('falls back to numeric error_status when error_message is absent', () => {
    // Backend writes details.error_status as the HTTP status code (int, e.g. 502).
    // The drawer must surface it as the failure reason instead of '-'.
    const log = makeLog({
      error_message: undefined,
      details: { error_status: 502 },
    });
    render(createElement(AdminAuditDetailDrawer, { log, onClose: () => {} }));
    expect(screen.getByText('502')).toBeTruthy();
  });

  it('falls back to string error_status too (defensive)', () => {
    const log = makeLog({
      error_message: undefined,
      details: { error_status: '409' },
    });
    render(createElement(AdminAuditDetailDrawer, { log, onClose: () => {} }));
    expect(screen.getByText('409')).toBeTruthy();
  });

  it('renders placeholder when neither error_message nor error_status is present', () => {
    const log = makeLog({ error_message: undefined, details: {} });
    render(createElement(AdminAuditDetailDrawer, { log, onClose: () => {} }));
    // The placeholder key from admin-audit-detail-drawer.tsx: 'adminAudit.unknownError'
    expect(screen.getByText('adminAudit.unknownError')).toBeTruthy();
  });
});

describe('AdminAuditDetailDrawer — 1:1 demo structure', () => {
  it('renders description, summary, plain before/after, and close button', () => {
    const log = makeLog({
      status: 'success',
      action: 'update',
      resource_type: 'tenants',
      details: { summary: '因欠费暂停租户' },
      before_value: { text: 'active' },
      after_value: { text: 'suspended' },
    });
    render(createElement(AdminAuditDetailDrawer, { log, onClose: () => {} }));
    expect(screen.getByText('adminAudit.description')).toBeTruthy();
    expect(screen.getByText('因欠费暂停租户')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('suspended')).toBeTruthy();
    expect(screen.getByText('adminAudit.close')).toBeTruthy();
  });
});
