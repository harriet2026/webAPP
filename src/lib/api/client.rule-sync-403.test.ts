import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, ApiError } from './client';

// Task 9b: a global-rule write attempted on a rule-sync replica fails at the
// storage guard with 403 replica_readonly (internal/api/rulesync_errors.go).
// The spec requires this to surface as an explicit "edit this on the
// primary" message — not the server's raw English string, and not a generic
// "操作失败"/"Request failed" that would make the guard indistinguishable
// from an unrelated permission error. This is hooked into apiRequest's
// single error-handling path (client.ts) so every rule-writing call site
// gets it for free; these tests exercise that path directly, the same way
// client.error-fallback.test.ts covers the GT-11966 unreachable-backend
// fallback it sits next to.
describe('apiRequest replica_readonly 403 (Task 9b)', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    window.history.pushState({}, '', '/zh/rules/mail');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function mockReplicaReadOnly(primaryAddr?: string) {
    const body: Record<string, unknown> = {
      error: {
        code: 'replica_readonly',
        message:
          'This node is a rule-sync replica: global rules are read-only here and must be edited on the primary node.',
      },
    };
    if (primaryAddr) body.primary_addr = primaryAddr;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;
  }

  it('replaces the raw server message with a localized "edit on the primary" message', async () => {
    mockReplicaReadOnly('https://primary.example:8081');

    const err = await apiRequest('/unified-rules/1', { method: 'PUT', body: {} })
      .then(() => null)
      .catch((e) => e as ApiError);

    expect(err).toBeInstanceOf(ApiError);
    expect(err!.status).toBe(403);
    // SABOTAGE TARGET: if the `response.status === 403 && code === 'replica_readonly'`
    // branch in client.ts is removed, this message reverts to the server's raw
    // English string and the assertions below fail.
    expect(err!.message).not.toContain('This node is a rule-sync replica: global rules are read-only here');
    expect(err!.message).toContain('副本');
    expect(err!.message).toContain('只读');
  });

  it('includes the primary address in the message when the server supplies one', async () => {
    mockReplicaReadOnly('https://primary.example:8081');

    const err = await apiRequest('/unified-rules/1', { method: 'PUT', body: {} })
      .then(() => null)
      .catch((e) => e as ApiError);

    expect(err!.message).toContain('https://primary.example:8081');
    expect(err!.isReplicaReadOnly).toBe(true);
    expect(err!.primaryAddr).toBe('https://primary.example:8081');
  });

  it('still gives a sensible message when the primary address is unknown', async () => {
    mockReplicaReadOnly(undefined);

    const err = await apiRequest('/unified-rules/1', { method: 'PUT', body: {} })
      .then(() => null)
      .catch((e) => e as ApiError);

    expect(err!.message).toContain('副本');
    expect(err!.primaryAddr).toBeUndefined();
  });

  it('does not misfire for an unrelated 403 (no replica_readonly code)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'forbidden', message: '无权限访问' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const err = await apiRequest('/some/resource')
      .then(() => null)
      .catch((e) => e as ApiError);

    expect(err!.message).toBe('无权限访问');
    expect(err!.isReplicaReadOnly).toBeUndefined();
  });

  it('localizes to English under the /en locale', async () => {
    window.history.pushState({}, '', '/en/rules/mail');
    mockReplicaReadOnly('https://primary.example:8081');

    const err = await apiRequest('/unified-rules/1', { method: 'PUT', body: {} })
      .then(() => null)
      .catch((e) => e as ApiError);

    expect(err!.message).toContain('replica');
    expect(err!.message).toContain('primary');
  });
});
