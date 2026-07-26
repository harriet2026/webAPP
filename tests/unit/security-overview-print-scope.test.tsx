import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';

// spec §8.2 (print page tenant_id scope): the print page must read `tenant_id`
// from the URL and feed it as the page-local scope to the data hook, which (via
// useScopedApiRequest, covered elsewhere) becomes the X-Tenant-ID header. Here we
// assert the URL → scopeTenantId wiring (null when the param is absent).

let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string) => key,
  useLocale: () => 'zh',
}));

const useSecurityOverviewMock = vi.fn();
vi.mock('@/components/statistics/security-overview/hooks/useSecurityOverview', () => ({
  useSecurityOverview: (params: unknown) => useSecurityOverviewMock(params),
}));

import PrintPage from '@/app/[locale]/(dashboard)/statistics/security-overview/print/page';

beforeEach(() => {
  vi.clearAllMocks();
  useSecurityOverviewMock.mockReturnValue({ data: undefined, isPending: true });
  vi.spyOn(window, 'print').mockImplementation(() => {});
});

describe('security-overview print page scope', () => {
  it('passes tenant_id from the URL as scopeTenantId', () => {
    searchParams = new URLSearchParams({ start_date: '2026-06-01', end_date: '2026-06-07', direction: 'all', tenant_id: '7' });
    render(createElement(PrintPage));
    const call = useSecurityOverviewMock.mock.calls.at(-1)![0];
    expect(call.scopeTenantId).toBe(7);
    expect(call.startDate).toBe('2026-06-01');
    expect(call.endDate).toBe('2026-06-07');
    expect(call.direction).toBe('all');
  });

  it('uses null scope (all tenants) when tenant_id is absent', () => {
    searchParams = new URLSearchParams({ start_date: '2026-06-01', end_date: '2026-06-07', direction: 'all' });
    render(createElement(PrintPage));
    const call = useSecurityOverviewMock.mock.calls.at(-1)![0];
    expect(call.scopeTenantId).toBeNull();
  });
});
