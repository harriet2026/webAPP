import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// GT-12140: relay grants could be created through this card, the CRUD chain worked
// end to end, and every unauthenticated relay attempt still got 554 — because the
// system-level master switch (/apiserver.cf/relay_grant/enabled) ships off and had
// NO control anywhere in the product. The card rendered a passive "switch is off"
// note and offered nothing to click.
//
// These tests pin the control and its authorization: a system admin gets a working
// toggle; a tenant admin sees the state but gets no toggle (the gate governs every
// tenant's grants — the API is the real authority, this is the UI half).

const apiRequestMock = vi.fn();

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: apiRequestMock }),
  // GT-12330: RelayGrantsCard now scopes to its explicit tenantId prop via
  // useScopedApiRequest; return the same spy so the path assertions still hold.
  useScopedApiRequest: () => ({ apiRequest: apiRequestMock }),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string, params?: Record<string, string | number>) => {
    void _ns;
    if (params) {
      return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), key);
    }
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/api/tenants', () => ({
  getTenantDomains: () => Promise.resolve([]),
}));

import { RelayGrantsCard } from '@/components/mail-routing/relay-grants-card';

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: qc }, createElement(RelayGrantsCard, { tenantId: 1 })),
  );
}

// The policy payload is shaped exactly like GET /relay-grants/_meta/policy so the
// component is exercised against the real contract, not a convenient subset.
function policyPayload(over: Record<string, unknown> = {}) {
  return {
    enabled: false,
    trusted_cidrs: ['192.168.0.0/16'],
    min_prefix_len_v4: 24,
    min_prefix_len_v6: 64,
    can_privilege: true,
    ...over,
  };
}

// GT-12255: these paths are the ones handed to apiRequest, which prepends
// API_BASE ('/api/v1') itself — so they must NOT carry the prefix, and the body
// must be a plain object (apiRequest serializes it). This mock used to route on
// the doubled-prefix paths and JSON.parse a pre-stringified body, which is why
// this suite stayed green while every relay-grant call 404'd in production.
function routeApi(policy: Record<string, unknown>) {
  apiRequestMock.mockImplementation(
    (url: string, opts?: { method?: string; body?: { enabled?: boolean } }) => {
      if (url === '/relay-grants/_meta/policy') {
        if (opts?.method === 'PUT') {
          return Promise.resolve(policyPayload({ ...policy, enabled: opts.body?.enabled }));
        }
        return Promise.resolve(policy);
      }
      if (url === '/relay-grants') return Promise.resolve({ items: [] });
      return Promise.resolve({});
    },
  );
}

describe('relay grants master switch (GT-12140)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('renders a toggle for a system admin reflecting the current off state', async () => {
    routeApi(policyPayload({ enabled: false }));
    renderCard();

    const toggle = await screen.findByTestId('relay-master-switch');
    // aria-checked is the accessible state the user actually perceives; asserting
    // it (rather than a class name) stays true if the Switch is restyled.
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('PUTs enabled=true when the system admin turns the switch on', async () => {
    routeApi(policyPayload({ enabled: false }));
    renderCard();

    const toggle = await screen.findByTestId('relay-master-switch');
    await userEvent.click(toggle);

    await waitFor(() => {
      const put = apiRequestMock.mock.calls.find(
        ([url, opts]) => url === '/relay-grants/_meta/policy' && opts?.method === 'PUT',
      );
      expect(put, 'expected a PUT to the relay policy endpoint').toBeTruthy();
      expect(put![1].body).toEqual({ enabled: true });
    });
  });

  it('shows the state but no toggle for a tenant admin', async () => {
    routeApi(policyPayload({ enabled: false, can_privilege: false }));
    renderCard();

    // The warning must still be visible — a tenant admin needs to know their
    // grants are inert and who to ask.
    await screen.findByTestId('relay-master-switch-off');
    expect(screen.queryByTestId('relay-master-switch')).toBeNull();
  });

  it('does not warn at all once the switch is on', async () => {
    routeApi(policyPayload({ enabled: true }));
    renderCard();

    const toggle = await screen.findByTestId('relay-master-switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('relay-master-switch-off')).toBeNull();
  });
});
