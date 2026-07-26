import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiRequest, ApiError } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {
    body: Record<string, unknown>;
    constructor(public status: number, message: string, body: Record<string, unknown> = {}) {
      super(message);
      this.name = 'ApiError';
      this.body = body;
      this.remainingAttempts = typeof body.remaining_attempts === 'number' ? body.remaining_attempts : undefined;
      this.retryAfterSeconds = typeof body.retry_after_seconds === 'number' ? body.retry_after_seconds : undefined;
      this.lockedUntil = typeof body.locked_until === 'string' ? body.locked_until : undefined;
      this.captchaRequired = body.captcha_required === true ? true : undefined;
    }
    remainingAttempts?: number;
    retryAfterSeconds?: number;
    lockedUntil?: string;
    captchaRequired?: boolean;
  },
}));

const mockApiRequest = vi.mocked(apiRequest);

import {
  loginStep1,
  loginVerify2FA,
  loginVerify2FACode,
  loginForcedChange,
  getCaptcha,
  resetPasswordCode,
  resetPasswordVerifyCode,
  resetPasswordCommit,
  isNeedChangePwd,
  isNeed2FA,
  isNeed2FASetup,
} from '@/lib/api/auth';
import type { LoginResponse } from '@/types/user';

describe('auth api client (login2fa)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loginStep1 forwards optional captcha fields when present', async () => {
    mockApiRequest.mockResolvedValueOnce({ token: 't', expires_at: '', role: 'system_admin', tenant_id: null });
    await loginStep1({
      username: 'u',
      password: 'p',
      captcha_id: 'cid',
      captcha_answer: 'ABC1',
    });
    expect(mockApiRequest).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { username: 'u', password: 'p', captcha_id: 'cid', captcha_answer: 'ABC1' },
    });
  });

  it('loginVerify2FA sends trust_device', async () => {
    const ok: LoginResponse = { token: 't', expires_at: '', role: 'system_admin', tenant_id: null };
    mockApiRequest.mockResolvedValueOnce(ok);
    await loginVerify2FA('tk', '123456', true);
    expect(mockApiRequest).toHaveBeenCalledWith('/auth/login/2fa', {
      method: 'POST',
      body: { ticket: 'tk', code: '123456', trust_device: true },
    });
  });

  it('loginVerify2FA defaults trust_device to false', async () => {
    mockApiRequest.mockResolvedValueOnce({ token: 't', expires_at: '', role: 'system_admin', tenant_id: null });
    await loginVerify2FA('tk', '000000');
    expect(mockApiRequest).toHaveBeenCalledWith('/auth/login/2fa', {
      method: 'POST',
      body: { ticket: 'tk', code: '000000', trust_device: false },
    });
  });

  it('loginVerify2FACode POSTs ticket for resend', async () => {
    mockApiRequest.mockResolvedValueOnce(undefined);
    await loginVerify2FACode('tk');
    expect(mockApiRequest).toHaveBeenCalledWith('/auth/login/2fa/code', {
      method: 'POST',
      body: { ticket: 'tk' },
    });
  });

  it('loginForcedChange POSTs ticket + new_password', async () => {
    mockApiRequest.mockResolvedValueOnce({ token: 't', expires_at: '', role: 'system_admin', tenant_id: null });
    await loginForcedChange('tk', 'NewPass1!');
    expect(mockApiRequest).toHaveBeenCalledWith('/auth/password/forced-change', {
      method: 'POST',
      body: { ticket: 'tk', new_password: 'NewPass1!' },
    });
  });

  it('getCaptcha GETs /auth/captcha', async () => {
    mockApiRequest.mockResolvedValueOnce({ captcha_id: 'cid', image_svg: '<svg/>' });
    const r = await getCaptcha();
    expect(r.captcha_id).toBe('cid');
    expect(mockApiRequest).toHaveBeenCalledWith('/auth/captcha', { method: 'GET' });
  });

  it('resetPasswordCode sends account + method', async () => {
    mockApiRequest.mockResolvedValueOnce({ ticket: 't', method: 'sms', masked_target: '***1234' });
    await resetPasswordCode('alice', 'sms');
    expect(mockApiRequest).toHaveBeenCalledWith('/auth/password/reset/code', {
      method: 'POST',
      body: { account: 'alice', method: 'sms' },
    });
  });

  // GT-11959 split the reset flow. The old single request carried the password
  // alongside the code, which forced the server to validate the password BEFORE
  // proving the code — and that leaked account existence once the policy became
  // per-tenant (a decoy ticket falls back to the baseline, a real one answers with
  // its tenant's stricter value, and the two 400s differ, with no valid code
  // needed). The password must not leave the client until the code is proven.
  it('resetPasswordVerifyCode sends ONLY the ticket + code — never the password', async () => {
    mockApiRequest.mockResolvedValueOnce({
      continuation_ticket: 'cont-1',
      policy: { minLength: 12, minCharClasses: 3, historyLimit: 5 },
    });
    const r = await resetPasswordVerifyCode('t', '123456');

    expect(mockApiRequest).toHaveBeenCalledWith('/auth/password/reset/verify-code', {
      method: 'POST',
      body: { ticket: 't', code: '123456' },
    });
    const [, opts] = mockApiRequest.mock.calls[0] as [string, { body: unknown }];
    expect(JSON.stringify(opts.body)).not.toContain('password');
    // and it hands back the policy that will actually be enforced, so the rule
    // checklist can be exact rather than the loosest-possible public baseline
    expect(r.continuation_ticket).toBe('cont-1');
    expect(r.policy.minLength).toBe(12);
  });

  it('resetPasswordCommit spends the continuation ticket', async () => {
    mockApiRequest.mockResolvedValueOnce(undefined);
    await resetPasswordCommit('cont-1', 'NewPass1!');
    expect(mockApiRequest).toHaveBeenCalledWith('/auth/password/reset/commit', {
      method: 'POST',
      body: { continuation_ticket: 'cont-1', new_password: 'NewPass1!' },
    });
  });

  it('isNeedChangePwd narrows the union', () => {
    expect(isNeedChangePwd({ need_change_pwd: true, ticket: 't' })).toBe(true);
    expect(isNeedChangePwd({ token: 't', expires_at: '', role: 'system_admin', tenant_id: null })).toBe(false);
    expect(isNeed2FA({ need_2fa: true, ticket: 't', method: 'sms', masked_target: 'x' })).toBe(true);
    expect(isNeed2FASetup({ need_2fa_setup: true, ticket: 't' })).toBe(true);
  });

  it('ApiError exposes remaining_attempts / captcha_required siblings', () => {
    const err = new ApiError(401, 'bad', {
      remaining_attempts: 2,
      retry_after_seconds: 60,
      locked_until: '2026-07-01T12:00:00Z',
      captcha_required: true,
    });
    expect(err.remainingAttempts).toBe(2);
    expect(err.retryAfterSeconds).toBe(60);
    expect(err.lockedUntil).toBe('2026-07-01T12:00:00Z');
    expect(err.captchaRequired).toBe(true);
  });

  it('ApiError siblings stay undefined when absent', () => {
    const err = new ApiError(401, 'bad', {});
    expect(err.remainingAttempts).toBeUndefined();
    expect(err.captchaRequired).toBeUndefined();
  });
});
