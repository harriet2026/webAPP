import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// GT-12255 (ported to mail-admission on Task 13's relay-grants → mail-admission
// rewrite): every relay-grant endpoint 404'd in production as
// /api/v1/api/v1/relay-grants because relay-grants.ts passed *absolute* paths
// ('/api/v1/relay-grants') into apiRequest, which prepends API_BASE ('/api/v1')
// itself, doubling the prefix. The same module also pre-stringified its
// request bodies, which apiRequest then stringified AGAIN, putting a JSON
// string literal on the wire instead of an object. mail-admission.ts (see
// src/lib/api/mail-admission.ts) is relay-grants.ts's replacement and passes
// *relative* paths + raw object bodies to apiRequest — this suite keeps that
// regression pinned for the new module the same way the retired
// relay-grants-api-path.test.ts pinned it for the old one.
//
// These tests go through the REAL apiRequest with only global.fetch stubbed,
// which is the only layer where both defects are observable (a suite that
// mocks the `request` function never applies API_BASE or JSON.stringify).

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

describe('mail-admission API paths (GT-12255 regression, ported from relay-grants)', () => {
  it('never doubles the /api/v1 prefix', async () => {
    const {
      getMailAdmissionRules,
      getMailAdmissionPolicy,
      setMailAdmissionPolicyEnabled,
      createMailAdmissionRule,
      updateMailAdmissionRule,
      deleteMailAdmissionRule,
    } = await import('@/lib/api/mail-admission');

    const cases: Array<[string, () => Promise<unknown>, string]> = [
      ['getMailAdmissionRules', () => getMailAdmissionRules(), '/api/v1/mail-admission-rules'],
      [
        'getMailAdmissionPolicy',
        () => getMailAdmissionPolicy(),
        '/api/v1/mail-admission/_meta/policy',
      ],
      [
        'setMailAdmissionPolicyEnabled',
        () => setMailAdmissionPolicyEnabled(true),
        '/api/v1/mail-admission/_meta/policy',
      ],
      [
        'createMailAdmissionRule',
        () => createMailAdmissionRule({ client_cidr: '192.168.1.0/24' }),
        '/api/v1/mail-admission-rules',
      ],
      [
        'updateMailAdmissionRule',
        () => updateMailAdmissionRule(7, { client_cidr: '192.168.1.0/24' }),
        '/api/v1/mail-admission-rules/7',
      ],
      [
        'deleteMailAdmissionRule',
        () => deleteMailAdmissionRule(7),
        '/api/v1/mail-admission-rules/7',
      ],
    ];

    for (const [name, call, expected] of cases) {
      fetchMock.mockClear();
      await call();
      expect(calledUrl(), `${name} dialed the wrong URL`).toBe(expected);
      expect(calledUrl(), `${name} doubled the /api/v1 prefix`).not.toContain('/api/v1/api/v1');
    }
  });

  it('sends a JSON object body, not a double-encoded JSON string', async () => {
    const { createMailAdmissionRule } = await import('@/lib/api/mail-admission');

    await createMailAdmissionRule({ client_cidr: '192.168.1.0/24', note: 'branch office' });

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
    const { setMailAdmissionPolicyEnabled } = await import('@/lib/api/mail-admission');

    await setMailAdmissionPolicyEnabled(true);

    expect(calledInit().method).toBe('PUT');
    const parsed = JSON.parse(String(calledInit().body));
    expect(typeof parsed).toBe('object');
    expect(parsed).toEqual({ enabled: true });
  });
});
