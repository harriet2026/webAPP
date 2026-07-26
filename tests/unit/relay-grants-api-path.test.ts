import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// GT-12255: every relay-grant endpoint 404'd in production as
// /api/v1/api/v1/relay-grants. relay-grants.ts passed absolute paths
// ('/api/v1/relay-grants') into apiRequest, which prepends API_BASE ('/api/v1')
// itself — so the prefix landed twice. The same module also pre-stringified its
// request bodies, which apiRequest then stringified AGAIN, putting a JSON string
// literal on the wire instead of an object.
//
// The pre-existing suite (relay-grants-master-switch.test.tsx) could not catch
// either one: it mocks the `request` function and asserts the path the module
// hands it, so API_BASE is never applied and the body is never serialized. These
// tests deliberately go through the REAL apiRequest with only global.fetch
// stubbed, which is the only layer where both defects are observable.

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ items: [] }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The URL apiRequest actually dialed. */
function calledUrl(): string {
  return String(fetchMock.mock.calls[0][0]);
}

/** The RequestInit apiRequest actually dialed with. */
function calledInit(): { method?: string; body?: string } {
  return fetchMock.mock.calls[0][1] as { method?: string; body?: string };
}

describe('relay-grants API paths (GT-12255)', () => {
  it('never doubles the /api/v1 prefix', async () => {
    const {
      getRelayGrants,
      getRelayGrantPolicy,
      setRelayGrantPolicyEnabled,
      createRelayGrant,
      updateRelayGrant,
      deleteRelayGrant,
    } = await import('@/lib/api/relay-grants');

    const cases: Array<[string, () => Promise<unknown>, string]> = [
      ['getRelayGrants', () => getRelayGrants(), '/api/v1/relay-grants'],
      ['getRelayGrantPolicy', () => getRelayGrantPolicy(), '/api/v1/relay-grants/_meta/policy'],
      [
        'setRelayGrantPolicyEnabled',
        () => setRelayGrantPolicyEnabled(true),
        '/api/v1/relay-grants/_meta/policy',
      ],
      [
        'createRelayGrant',
        () => createRelayGrant({ client_cidr: '192.168.1.0/24' }),
        '/api/v1/relay-grants',
      ],
      [
        'updateRelayGrant',
        () => updateRelayGrant(7, { client_cidr: '192.168.1.0/24' }),
        '/api/v1/relay-grants/7',
      ],
      ['deleteRelayGrant', () => deleteRelayGrant(7), '/api/v1/relay-grants/7'],
    ];

    for (const [name, call, expected] of cases) {
      fetchMock.mockClear();
      await call();
      expect(calledUrl(), `${name} dialed the wrong URL`).toBe(expected);
      expect(calledUrl(), `${name} doubled the /api/v1 prefix`).not.toContain('/api/v1/api/v1');
    }
  });

  it('sends a JSON object body, not a double-encoded JSON string', async () => {
    const { createRelayGrant } = await import('@/lib/api/relay-grants');

    await createRelayGrant({ client_cidr: '192.168.1.0/24', note: 'branch office' });

    const body = calledInit().body;
    expect(body, 'no body was sent').toBeTruthy();

    // A double-encoded body parses to a *string*; a correct one parses to the object.
    const parsed = JSON.parse(String(body));
    expect(
      typeof parsed,
      'body was double-encoded (JSON.stringify applied twice)',
    ).toBe('object');
    expect(parsed).toMatchObject({ client_cidr: '192.168.1.0/24', note: 'branch office' });
  });

  it('sends the master-switch flag as an object body', async () => {
    const { setRelayGrantPolicyEnabled } = await import('@/lib/api/relay-grants');

    await setRelayGrantPolicyEnabled(true);

    expect(calledInit().method).toBe('PUT');
    const parsed = JSON.parse(String(calledInit().body));
    expect(typeof parsed).toBe('object');
    expect(parsed).toEqual({ enabled: true });
  });
});
