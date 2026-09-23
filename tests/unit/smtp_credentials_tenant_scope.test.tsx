import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/auth-context';
import { ProductFormProvider } from '@/contexts/product-form-context';
import SMTPCredentialsPage from '@/app/[locale]/(dashboard)/smtp-credentials/page';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'zh' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

// Exercise real providers, form validation and API serializers. Only the HTTP
// boundary supplies deterministic bootstrap/scope/credential responses.
const fetchMock = vi.fn();
let client: QueryClient;
let form = 'ai-multi';
let scopeFails = false;
let credentials: Array<Record<string, unknown>> = [];
const writes: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];

function mount(selectedTenant: number | null = null) {
  localStorage.setItem('osgateway_user', JSON.stringify({ id: 4, username: 'admin', role: 'system_admin', is_super_admin: true, tenant_id: null, role_id: null }));
  document.cookie = `osg_viewer=${selectedTenant ? 'tenant' : 'platform'}; path=/`;
  if (selectedTenant !== null) localStorage.setItem('osgateway_selected_tenant', String(selectedTenant));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AuthProvider><ProductFormProvider><SMTPCredentialsPage /></ProductFormProvider></AuthProvider></QueryClientProvider>);
}

beforeEach(() => {
  form = 'ai-multi'; scopeFails = false; credentials = []; writes.length = 0; localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    let body: unknown;
    if (path === '/api/v1/bootstrap') body = { form, featureRegistry: [], grants: [], localAuthEnabled: true };
    else if (path === '/api/v1/routing/_meta/scope' && scopeFails) return new Response(JSON.stringify({ error: { code: 'internal_error', message: 'scope unavailable' } }), { status: 500 });
    else if (path === '/api/v1/routing/_meta/scope') body = { mode: form === 'ai-single' ? 'single' : 'multi', tenant_id: form === 'ai-single' ? 7 : null };
    else if (path === '/api/v1/smtp-credentials' && method === 'GET') body = { items: credentials };
    else if (path.startsWith('/api/v1/smtp-credentials') && ['POST', 'PUT'].includes(method)) {
      const payload = JSON.parse(String(init.body)); writes.push({ path, method, body: payload }); body = { id: 5, ...payload };
    } else throw new Error(`unexpected request ${method} ${path}`);
    return new Response(JSON.stringify(body), { status: method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });

async function openCreate() {
  await screen.findByTestId('smtp-credentials-create');
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/bootstrap', expect.anything()));
  await waitFor(() => expect(screen.getByTestId('smtp-credentials-create')).toBeEnabled());
  await userEvent.click(screen.getByTestId('smtp-credentials-create'));
}
async function fillAndSave() {
  await userEvent.type(screen.getByTestId('smtp-credential-username'), 'scope-user');
  await userEvent.type(screen.getByTestId('smtp-credential-password'), 'test-password');
  await userEvent.click(screen.getByTestId('smtp-credential-save'));
}

describe('SMTP credential tenant selection', () => {
  it('requires a tenant when multi-tenant context has no selection', async () => {
    mount(); await openCreate();
    expect(screen.getByTestId('smtp-credential-tenant-id')).toHaveValue(null);
    await fillAndSave();
    expect(writes).toHaveLength(0);
    expect(await screen.findByText('common.validation.tenantRequired')).toBeInTheDocument();
  });
  it('creates under the actual single-tenant scope ID 7', async () => {
    form = 'ai-single'; mount(); await openCreate();
    await waitFor(() => expect(screen.getByTestId('smtp-credential-tenant-id')).toHaveValue(7));
    await fillAndSave();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body.tenant_id).toBe(7);
  });
  it('uses the selected tenant and resets an abandoned manual target', async () => {
    mount(7); await openCreate();
    const tenant = screen.getByTestId('smtp-credential-tenant-id');
    expect(tenant).toHaveValue(7);
    await userEvent.clear(tenant); await userEvent.type(tenant, '9');
    await userEvent.click(screen.getByTestId('smtp-credential-cancel'));
    await openCreate();
    expect(screen.getByTestId('smtp-credential-tenant-id')).toHaveValue(7);
    await fillAndSave();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body.tenant_id).toBe(7);
  });
  it('keeps an existing credential in its original tenant when editing', async () => {
    credentials = [{ id: 5, tenant_id: 1, username: 'existing', auth_backend: 'local', is_active: true, failed_attempts: 0 }];
    mount(7);
    await userEvent.click(await screen.findByTestId('smtp-credential-edit-5'));
    expect(screen.getByTestId('smtp-credential-tenant-id')).toHaveValue(1);
    expect(screen.getByTestId('smtp-credential-tenant-id')).toHaveAttribute('readonly');
    await userEvent.clear(screen.getByTestId('smtp-credential-username'));
    await userEvent.type(screen.getByTestId('smtp-credential-username'), 'renamed');
    await userEvent.click(screen.getByTestId('smtp-credential-save'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ path: '/api/v1/smtp-credentials/5', method: 'PUT', body: { username: 'renamed' } });
    expect(writes[0].body).not.toHaveProperty('tenant_id');
  });

  it('does not create with a guessed tenant when default-scope lookup fails', async () => {
    form = 'ai-single'; scopeFails = true; mount();
    await screen.findByRole('alert');
    expect(screen.getByTestId('smtp-credentials-create')).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

});
