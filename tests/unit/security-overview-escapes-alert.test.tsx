import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

// F7 escapes drawer (spec §4.5.1) + review Bug-1 regression: the drawer must
// render the backend's actual fields (sender / recipients / subject /
// recalled_at / recall_reason) and must NOT crash when `recipients` arrives as
// null (a LEFT JOIN mail_log miss serializes recipients as null).

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string, params?: Record<string, string | number>) => {
    void _ns;
    if (params) {
      return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), key);
    }
    return key;
  },
}));

vi.mock('lucide-react', () => ({
  AlertTriangle: () => null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    createElement('button', { onClick }, children),
}));

// Render the sheet content inline (ignore open state) so we can assert the
// drawer contents deterministically without a Radix portal.
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  SheetContent: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  SheetHeader: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  SheetTitle: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));

const useEscapeListMock = vi.fn();
vi.mock('@/components/statistics/security-overview/hooks/useSecurityOverview', () => ({
  useEscapeList: (...args: unknown[]) => useEscapeListMock(...args),
}));

import { EscapesAlert } from '@/components/statistics/security-overview/EscapesAlert';

const baseProps = { startDate: '2026-06-01', endDate: '2026-06-07', direction: 'all' as const, scopeTenantId: null };

describe('EscapesAlert (F7)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when total is 0', () => {
    useEscapeListMock.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false });
    const { container } = render(createElement(EscapesAlert, baseProps));
    expect(container.textContent).toBe('');
  });

  it('renders nothing while loading', () => {
    useEscapeListMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(createElement(EscapesAlert, baseProps));
    expect(container.textContent).toBe('');
  });

  it('shows the amber warning with the escape count when total > 0', () => {
    useEscapeListMock.mockReturnValue({
      data: { items: [{ id: 1, message_id: 'm1', subject: 'S1', sender: 'a@x.com', recipients: ['b@y.com'], recalled_at: '2026-06-02T00:00:00Z', recall_reason: 'phish' }], total: 1 },
      isLoading: false,
    });
    const { getByText } = render(createElement(EscapesAlert, baseProps));
    // warning text interpolates {count}
    expect(getByText('warning')).toBeTruthy();
    expect(getByText('a@x.com')).toBeTruthy();
    expect(getByText('b@y.com')).toBeTruthy();
    expect(getByText('phish')).toBeTruthy();
  });

  it('does not crash when recipients is null (Bug-1 regression)', () => {
    useEscapeListMock.mockReturnValue({
      data: {
        items: [{ id: 7, message_id: 'm7', subject: 'orphan', sender: 'a@x.com', recipients: null as unknown as string[], recalled_at: '2026-06-02T00:00:00Z', recall_reason: '' }],
        total: 1,
      },
      isLoading: false,
    });
    // The guard `(it.recipients ?? [])` must keep this from throwing.
    const { getByText } = render(createElement(EscapesAlert, baseProps));
    expect(getByText('orphan')).toBeTruthy();
  });

  it('passes the page-local scopeTenantId through to the escapes hook', () => {
    useEscapeListMock.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false });
    render(createElement(EscapesAlert, { ...baseProps, scopeTenantId: 9 }));
    const lastCall = useEscapeListMock.mock.calls.at(-1)!;
    expect(lastCall[1]).toBe(9);
  });
});
