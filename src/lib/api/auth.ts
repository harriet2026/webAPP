import { apiRequest, clearStoredUser, getStoredUser, setStoredUser, markAuthenticated } from './client';
import type { ApiRequestFn } from './client';
import type { LoginRequest, LoginResponse, User } from '@/types/user';

// Login step-1 responses (discriminated union). The backend returns one of:
//   - a full token bundle (login complete)
//   - { need_2fa, ticket, method, masked_target }  → render code-input step
//   - { need_2fa_setup, ticket }                    → render forced-setup step
export interface Need2FA {
  need_2fa: true;
  ticket: string;
  method: 'sms' | 'email';
  masked_target: string;
}

export interface Need2FASetup {
  need_2fa_setup: true;
  ticket: string;
}

export interface NeedChangePwd {
  need_change_pwd: true;
  ticket: string;
  /**
   * The policy that will ACTUALLY be enforced for this user (GT-11959).
   *
   * The public /auth/password-policy endpoint can only ever return the platform
   * BASELINE — it is fetched before anyone has identified themselves, so it is the
   * loosest possible answer. Once the password has been verified the user IS
   * identified, and their tenant may have tightened the rules. Rendering the
   * checklist from the baseline would tell a tenant user their password is fine and
   * then have the server reject it.
   *
   * Optional so an older server still parses.
   */
  policy?: PublicPasswordPolicy;
}

export type LoginStep1Response = LoginResponse | Need2FA | Need2FASetup | NeedChangePwd;

export function isNeed2FA(r: LoginStep1Response): r is Need2FA {
  return (r as Need2FA).need_2fa === true;
}

export function isNeed2FASetup(r: LoginStep1Response): r is Need2FASetup {
  return (r as Need2FASetup).need_2fa_setup === true;
}

export function isNeedChangePwd(r: LoginStep1Response): r is NeedChangePwd {
  return (r as NeedChangePwd).need_change_pwd === true;
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
  });

  const user: User = {
    id: 0,
    username: credentials.username,
    role: response.role,
    tenant_id: response.tenant_id ?? null,
    // Plan C Task 2: persisted verbatim through `osgateway_user` so a page
    // reload rehydrates the same RBAC-matrix fields auth-context sets on a
    // live login (see auth-context.tsx login()/completeLogin()).
    role_id: response.role_id ?? null,
    is_super_admin: response.is_super_admin ?? false,
    created_at: '',
    updated_at: '',
  };
  setStoredUser(user);
  // Align the osgateway_auth UI cookie lifetime with the real token expiry so
  // the cookie does not outlive the token (avoids a first-fetch 401 flash).
  const expiresAtMs = Date.parse(response.expires_at);
  const maxAge = Number.isNaN(expiresAtMs) ? undefined : Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
  markAuthenticated(maxAge);

  return response;
}

// Login step-1 WITHOUT the side-effects of persisting the session. The login
// page uses this to inspect the response before deciding which step to show —
// it must not write a user to localStorage when the response is need_2fa(_setup).
export async function loginStep1(credentials: LoginRequest): Promise<LoginStep1Response> {
  return apiRequest<LoginStep1Response>('/auth/login', {
    method: 'POST',
    body: credentials,
  });
}

// Persist a token bundle obtained from a 2FA step (verify / setup-verify) and
// mark the UI as authenticated. Mirrors the side-effects of login().
export function completeLoginFromResponse(
  response: LoginResponse,
  username: string,
): User {
  const user: User = {
    id: 0,
    username,
    role: response.role,
    tenant_id: response.tenant_id ?? null,
    // Plan C Task 2: same as login() above.
    role_id: response.role_id ?? null,
    is_super_admin: response.is_super_admin ?? false,
    created_at: '',
    updated_at: '',
  };
  setStoredUser(user);
  const expiresAtMs = Date.parse(response.expires_at);
  const maxAge = Number.isNaN(expiresAtMs) ? undefined : Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
  markAuthenticated(maxAge);
  return user;
}

// Step-2: verify the 2FA code for an already-issued ticket. trustDevice, when
// true, makes the server skip the 2FA step on this device for a window (Plan 4).
export async function loginVerify2FA(ticket: string, code: string, trustDevice = false): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login/2fa', {
    method: 'POST',
    body: { ticket, code, trust_device: trustDevice },
  });
}

// Re-request the login 2FA code for an existing verify-stage ticket.
// Rate-limits apply per-ticket/user/IP; a 429 means back off.
export async function loginVerify2FACode(ticket: string): Promise<void> {
  await apiRequest<void>('/auth/login/2fa/code', { method: 'POST', body: { ticket } });
}

// Forced password change: invoked when Login step-1 returned need_change_pwd.
// The server may either return a fresh LoginResponse (login complete) or pivot
// into a 2FA/setup step, so this mirrors the LoginStep1Response union.
export async function loginForcedChange(ticket: string, newPassword: string): Promise<LoginStep1Response> {
  return apiRequest<LoginStep1Response>('/auth/password/forced-change', {
    method: 'POST',
    body: { ticket, new_password: newPassword },
  });
}

// Fetch a graphic captcha challenge (SVG). Called when a previous login attempt
// returned captcha_required: true.
export async function getCaptcha(): Promise<{ captcha_id: string; image_svg: string }> {
  return apiRequest<{ captcha_id: string; image_svg: string }>('/auth/captcha', { method: 'GET' });
}

// Public password-shape policy (D1): the login page's forced-change and
// forgot-password steps render a rule checklist from this so the client rules
// always match the server's actual policy instead of a hardcoded copy.
export interface PublicPasswordPolicy {
  minLength: number;
  minCharClasses: number;
  historyLimit: number;
}

export async function getPublicPasswordPolicy(): Promise<PublicPasswordPolicy> {
  return apiRequest<PublicPasswordPolicy>('/auth/password-policy', { method: 'GET' });
}

// Forgot-password flow step 1: request a reset code to the chosen channel.
export async function resetPasswordCode(
  account: string,
  method: 'sms' | 'email',
): Promise<{ ticket: string; method: 'sms' | 'email'; masked_target: string }> {
  return apiRequest<{ ticket: string; method: 'sms' | 'email'; masked_target: string }>(
    '/auth/password/reset/code',
    { method: 'POST', body: { account, method } },
  );
}

// Forgot-password step 2: prove the code.
//
// GT-11959 split the old single request (ticket + code + new_password) in two.
// It had to be split: that endpoint validated the password BEFORE consuming the
// code (deliberately, so a decoy ticket and a real one were indistinguishable by
// timing), which stopped working once the password policy became per-tenant — a
// decoy has no user and falls back to the baseline, a real ticket answers with
// its tenant's stricter value, and the two different 400s leak account existence
// without the attacker ever needing a valid code.
//
// The upside for the client: this step returns the policy that will ACTUALLY be
// enforced for this user, so the rule checklist can be exact instead of falling
// back to the (loosest) public baseline.
export async function resetPasswordVerifyCode(
  ticket: string,
  code: string,
): Promise<{ continuation_ticket: string; policy: PublicPasswordPolicy }> {
  return apiRequest<{ continuation_ticket: string; policy: PublicPasswordPolicy }>(
    '/auth/password/reset/verify-code',
    { method: 'POST', body: { ticket, code } },
  );
}

// Forgot-password step 3: spend the continuation ticket and set the password.
//
// A policy failure here does NOT burn the ticket — the user can just retype.
export async function resetPasswordCommit(
  continuationTicket: string,
  newPassword: string,
): Promise<void> {
  await apiRequest<void>('/auth/password/reset/commit', {
    method: 'POST',
    body: { continuation_ticket: continuationTicket, new_password: newPassword },
  });
}

// Forced-setup: request a verification code to the chosen target.
export async function loginSetupCode(
  ticket: string,
  method: 'sms' | 'email',
  target: string,
): Promise<void> {
  await apiRequest<void>('/auth/login/2fa/setup/code', {
    method: 'POST',
    body: { ticket, method, target },
  });
}

// Forced-setup: verify the code and obtain the token.
export async function loginSetupVerify(
  ticket: string,
  method: 'sms' | 'email',
  target: string,
  code: string,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login/2fa/setup/verify', {
    method: 'POST',
    body: { ticket, method, target, code },
  });
}

export async function changePassword(currentPassword: string, newPassword: string, apiRequestFn: ApiRequestFn): Promise<void> {
  await apiRequestFn('/auth/password', {
    method: 'PUT',
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch {
    // Ignore logout API errors
  } finally {
    clearStoredUser();
  }
}

export function getCurrentUser(): User | null {
  return getStoredUser();
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return !!getStoredUser();
}
