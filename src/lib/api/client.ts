'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import type { User } from '@/types/user';
import { isDemoSessionEnabled, isMockEnabled } from '@/lib/mock/storage';
import { dispatch as mockDispatch, isMockable } from '@/lib/mock/dispatcher';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  // GT-12704：故意是 `object` 而不是 `unknown`。apiRequest 会对 body 做一次
  // `JSON.stringify`，所以调用方必须传**未序列化的对象**；`unknown` 会把
  // 「调用方自己先 stringify 一遍」这种双重序列化放过去（发出的请求体顶层是
  // 字符串，后端按结构体绑定直接 400），而 TS 一声不吭。收成 `object` 后同类
  // 写法在编译期就报错。
  body?: object;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  responseType?: 'json' | 'blob';
}

export type ApiRequestFn = <T>(path: string, options?: RequestOptions) => Promise<T>;

export class ApiError extends Error {
  body: Record<string, unknown>;
  // Login-related siblings carried on the wire alongside the error envelope
  // (Plans 2/3/4): remaining login attempts, lockout countdown, captcha gate.
  remainingAttempts?: number;
  retryAfterSeconds?: number;
  lockedUntil?: string;
  captchaRequired?: boolean;
  // Task 9b: rule-sync replica_readonly siblings (internal/api/rulesync_errors.go).
  // isReplicaReadOnly lets a caller that wants extra affordance (e.g. a link
  // to primaryAddr) detect the case precisely, without re-parsing body.error.code;
  // most callers don't need this — `message` below is already the localized,
  // "edit this on the primary" copy (see replicaReadOnlyMessage).
  isReplicaReadOnly?: boolean;
  primaryAddr?: string;
  // GT-12606：后端的**稳定错误码 + 结构化参数**。前端据此按 locale 渲染文案，
  // 不再拿英文 message 做子串匹配（后端润色一个字就静默失配，且没有任何测试会红）。
  // 见 design/implement/spec/2026-08-01-api-error-code-params-design.md。
  code?: string;
  params?: Record<string, unknown>;

  constructor(public status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.body = body;
    this.remainingAttempts = typeof body.remaining_attempts === 'number' ? body.remaining_attempts : undefined;
    this.retryAfterSeconds = typeof body.retry_after_seconds === 'number' ? body.retry_after_seconds : undefined;
    this.lockedUntil = typeof body.locked_until === 'string' ? body.locked_until : undefined;
    this.captchaRequired = body.captcha_required === true ? true : undefined;
    const errField = body.error;
    const code =
      typeof errField === 'object' && errField !== null
        ? (errField as { code?: unknown }).code
        : undefined;
    if (typeof code === 'string' && code !== '') {
      this.code = code;
    }
    const rawParams =
      typeof errField === 'object' && errField !== null
        ? (errField as { params?: unknown }).params
        : undefined;
    if (typeof rawParams === 'object' && rawParams !== null) {
      this.params = rawParams as Record<string, unknown>;
    }
    if (status === 403 && code === 'replica_readonly') {
      this.isReplicaReadOnly = true;
      this.primaryAddr = typeof body.primary_addr === 'string' ? body.primary_addr : undefined;
    }
  }
}

// GT-11966: when the backend is unreachable the response is not the API's JSON
// error envelope (nginx returns a 502 HTML page, or fetch rejects outright), so
// there is no server-supplied message to show. The fallback used to be a
// hardcoded English literal, which leaked "Request failed" into an otherwise
// Chinese UI. apiRequest lives outside React, so it cannot use useTranslations;
// derive the locale from the URL the same way the 401 redirect below already
// does, and fall back to zh (the default locale).
const REQUEST_FAILED_FALLBACK: Record<string, string> = {
  zh: '请求失败，服务暂时不可用，请稍后重试',
  en: 'Request failed: the service is temporarily unavailable, please retry later',
  th: 'คำขอล้มเหลว: บริการไม่พร้อมใช้งานชั่วคราว โปรดลองใหม่ภายหลัง',
  ru: 'Запрос не выполнен: сервис временно недоступен, повторите попытку позже',
};

function requestFailedMessage(): string {
  const locale =
    typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : '';
  return REQUEST_FAILED_FALLBACK[locale] ?? REQUEST_FAILED_FALLBACK.zh;
}

// Task 9b: every rule-write handler (IP/sender/keyword rules, auth-spoofing,
// phishing bands, link-protection auto rules, rule import, unified rules
// CRUD, ...) fails at the storage guard on a replica with a stable
// `replica_readonly` code (internal/api/rulesync_errors.go) and an English
// server message. The spec requires this to surface as an explicit "go edit
// this on the primary" — not the generic English server string, and not a
// silent/misleading failure. Hooking it HERE, in apiRequest's single error
// path, is what covers all ~30 call sites at once (same rationale as the
// backend's respondRuleSyncError single choke point): a new rule-writing
// page gets the correct message the day it's written, with nothing to
// remember to wire up per-handler.
const REPLICA_READONLY_FALLBACK: Record<string, (primaryAddr?: string) => string> = {
  zh: (addr) => `当前节点为规则同步副本（replica），全局规则在此节点只读，请前往主节点${addr ? `（${addr}）` : ''}操作`,
  en: (addr) =>
    `This node is a rule-sync replica: global rules are read-only here. Please make this change on the primary node${addr ? ` (${addr})` : ''}.`,
  th: (addr) =>
    `โหนดนี้เป็น replica ของการซิงค์กฎ: กฎส่วนกลางที่นี่อ่านได้อย่างเดียว กรุณาแก้ไขที่ primary${addr ? ` (${addr})` : ''}`,
  ru: (addr) =>
    `Этот узел — реплика синхронизации правил: глобальные правила здесь доступны только для чтения. Внесите изменение на основном узле${addr ? ` (${addr})` : ''}.`,
};

function replicaReadOnlyMessage(primaryAddr?: string): string {
  const locale =
    typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : '';
  const fn = REPLICA_READONLY_FALLBACK[locale] ?? REPLICA_READONLY_FALLBACK.zh;
  return fn(primaryAddr);
}

// GT-12697：规则变更后端会同步等执行面(antispam)重载快照；等不到确认时响应带
// X-OSG-Rule-Sync: pending，这里统一提示"数秒内生效"，避免管理员误以为已即时
// 生效。挂在 apiRequest 单收口，与 replica_readonly 同理：所有规则页一次覆盖。
const RULE_SYNC_PENDING_FALLBACK: Record<string, string> = {
  zh: '已保存，正在同步到检测引擎（数秒内自动生效）',
  en: 'Saved. Syncing to the detection engine (takes effect within seconds).',
  th: 'บันทึกแล้ว กำลังซิงค์ไปยังเอนจินตรวจจับ (มีผลภายในไม่กี่วินาที)',
  ru: 'Сохранено. Синхронизация с движком обнаружения (вступит в силу через несколько секунд).',
};

function notifyRuleSyncPending(response: Response): void {
  if (typeof window === 'undefined') return;
  // GT-12697 回归实录（mail-admission-api-path.test.ts）：真实浏览器 fetch 的
  // Response 恒有 headers，但仓库里存在合法的"最小 fetch stub"测试模式——只
  // mock `{ ok, status, json }` 裸对象、不带 headers（该模式在本改动之前是
  // 安全的，因为 apiRequest 从未读过 headers）。这里做一次形状守卫：headers
  // 缺失或不是真正的 Headers（没有 .get 方法）时直接跳过，不去改那批测试。
  const headers = (response as { headers?: unknown }).headers;
  if (!headers || typeof (headers as Headers).get !== 'function') return;
  if ((headers as Headers).get('X-OSG-Rule-Sync') !== 'pending') return;
  const locale = window.location.pathname.split('/')[1];
  toast.info(RULE_SYNC_PENDING_FALLBACK[locale] ?? RULE_SYNC_PENDING_FALLBACK.zh, {
    id: 'rule-sync-pending',
  });
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Mock 拦截：当开关开启时，命中已注册的 mock 路由直接返回 fixture，
  // 不发起真实网络请求。开关由 ProductFormSwitcher 里的「Mock 数据」
  // 菜单项控制（localStorage: osgateway_mock_enabled）。
  // 注意：只在浏览器端生效（SSR 时 isMockEnabled() 恒为 false），避免
  // 影响 Next.js 服务端渲染时的 bootstrap 预取。
  const method = options.method || 'GET';
  if (
    typeof window !== 'undefined' &&
    isMockEnabled() &&
    isMockable(method, path)
  ) {
    const { status, data } = mockDispatch({
      method,
      path,
      body: options.body,
      headers: options.headers,
    });
    if (status >= 400) {
      throw new ApiError(status, `Mock error ${status}`, data as Record<string, unknown>);
    }
    if (status === 204) return {} as T;
    return data as T;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    // fetch rejects (rather than resolving with a status) when the connection
    // itself fails — ERR_CONNECTION_REFUSED when apiserver is down. Never
    // swallow an intentional abort; the caller relies on it.
    //
    // Both abort flavours must pass through unwrapped: a user/unmount abort
    // rejects with AbortError, but AbortSignal.timeout() rejects with a
    // *TimeoutError*. Letting only AbortError through rewrapped every timed-out
    // request as a generic ApiError, so callers could no longer tell "timed out"
    // from "network died" — mailflow's isTimeoutError() then never matched and its
    // 10s TimeoutBanner never rendered (it showed the collection-anomaly banner,
    // or nothing at all when cached data was still on screen).
    if (
      err instanceof DOMException &&
      (err.name === 'AbortError' || err.name === 'TimeoutError')
    ) {
      throw err;
    }
    throw new ApiError(0, requestFailedMessage());
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredUser();
      // A deliberately entered demo session has no backend JWT. Mock coverage
      // is intentionally incremental, so an unregistered endpoint may still
      // reach the real API and return 401. Surface that request as an ordinary
      // page-level error without ejecting the user from the demo. The server-
      // provided login entry is the only normal path that sets this marker;
      // AuthProvider clears stale markers whenever the server flag is off.
      if (
        typeof window !== 'undefined' &&
        !isDemoSessionEnabled() &&
        !window.location.pathname.includes('/login')
      ) {
        const locale = window.location.pathname.split('/')[1] || 'zh';
        window.location.href = `/${locale}/login`;
      }
    }
    const error = await response.json().catch(() => ({}));
    let message =
      typeof error.error === 'string'
        ? error.error
        : error.error?.message || requestFailedMessage();
    if (response.status === 403 && error.error?.code === 'replica_readonly') {
      message = replicaReadOnlyMessage(
        typeof error.primary_addr === 'string' ? error.primary_addr : undefined,
      );
    }
    throw new ApiError(response.status, message, error);
  }

  notifyRuleSyncPending(response);

  if (response.status === 204) {
    return {} as T;
  }

  if (options.responseType === 'blob') {
    return response.blob() as Promise<T>;
  }

  return response.json();
}

const USER_KEY = 'osgateway_user';
const AUTH_COOKIE = 'osgateway_auth';
const VIEWER_COOKIE = 'osg_viewer';
const TENANT_COOKIE = 'osg_selected_tenant';

export function clearStoredUser(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_KEY);
  // GT-11771 P3: also clear the paired localStorage tenant key — the cookie
  // clear above only removes the cookie; auth-context's boot effect re-reads
  // localStorage on next hard refresh and would restore the previous user's
  // selected tenant, silently scoping the new session to the wrong tenant.
  localStorage.removeItem('osgateway_selected_tenant');
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${VIEWER_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${TENANT_COOKIE}=; path=/; max-age=0`;
}

export function markAuthenticated(maxAgeSeconds?: number): void {
  if (typeof window === 'undefined') return;
  // Default to 24h to match the apiserver JWT default (cmd/apiserver/main.go).
  // Callers that know the real token expiry (login) pass it so the UI-auth
  // cookie does not outlive the token and cause a first-fetch 401 flash.
  const maxAge = maxAgeSeconds && maxAgeSeconds > 0 ? maxAgeSeconds : 60 * 60 * 24;
  document.cookie = `${AUTH_COOKIE}=1; path=/; max-age=${maxAge}; SameSite=Strict`;
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem(USER_KEY);
  return userStr ? JSON.parse(userStr) : null;
}

export function setStoredUser(user: User): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function useApiRequest() {
  const { selectedTenantId, isSystemAdmin, user } = useAuth();
  const effectiveTenantId = isSystemAdmin ? selectedTenantId : user?.tenant_id ?? null;

  const request = useCallback(async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
    const headers: Record<string, string> = {
      ...options.headers,
    };
    if (effectiveTenantId !== null) {
      headers['X-Tenant-ID'] = String(effectiveTenantId);
    }
    return apiRequest<T>(path, { ...options, headers });
  }, [effectiveTenantId]);

  return { apiRequest: request, effectiveTenantId };
}

// Like useApiRequest, but injects X-Tenant-ID from an explicit tenantId (the
// page-local resolved scope) instead of the global selectedTenantId. null →
// no header (all tenants). Used by the security-overview page-local scope.
export function useScopedApiRequest(tenantId: number | null) {
  const request = useCallback(async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
    const headers: Record<string, string> = { ...options.headers };
    if (tenantId !== null) {
      headers['X-Tenant-ID'] = String(tenantId);
    }
    return apiRequest<T>(path, { ...options, headers });
  }, [tenantId]);
  return { apiRequest: request };
}
