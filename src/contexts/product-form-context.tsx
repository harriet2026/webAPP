'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchBootstrap, type Bootstrap } from '@/lib/api/bootstrap';
import { clearStoredUser } from '@/lib/api/client';
import { useAuth } from './auth-context';
import {
  capabilitiesForForm,
  FORM_OVERRIDE_COOKIE,
  isValidForm,
  type Capabilities,
  type FeatureDef,
  type Viewer,
} from '@/lib/product-form/resolve';

interface Ctx {
  capabilities: Capabilities | null;
  registry: FeatureDef[];
  grants: string[];
  // GT-12013: `registry` is [] until /bootstrap answers, and consumers treat a
  // feature that is missing from the registry as VISIBLE ("未登记=放行"). That
  // additive default is right for a feature nobody registered yet — but it is
  // wrong for "the registry has not arrived yet", where it makes platform-only
  // cards flash for tenant admins. Consumers must fail closed until this is true.
  registryReady: boolean;
  // GT-12368: 本地账号库是否启用（OSG_LOCAL_AUTH_ENABLED）。bootstrap 到达前
  // 以及字段缺失时均 fail-closed 为 false，避免创建凭证表单短暂/永久性地
  // 提供一个后端已禁用的 local 选项。
  localAuthEnabled: boolean;
  viewer: Viewer;
  setViewer: (v: Viewer) => void;
  // ---- 产品形态切换器（OSGATEWAY_PRODUCT_FORM_SWITCHER）----
  switcherEnabled: boolean;
  effectiveForm: string;
  setFormOverride: (form: string | null) => void;
}

function readViewerCookie(): Viewer {
  if (typeof document === 'undefined') return 'platform';
  const m = document.cookie.match(/(?:^|;\s*)osg_viewer=(platform|tenant)/);
  return m ? (m[1] as Viewer) : 'platform';
}

function readFormOverrideCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${FORM_OVERRIDE_COOKIE}=([a-z-]+)`));
  const candidate = m?.[1];
  return candidate && isValidForm(candidate) ? candidate : null;
}

function writeFormOverrideCookie(form: string | null) {
  if (typeof document === 'undefined') return;
  if (form === null) {
    document.cookie = `${FORM_OVERRIDE_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`;
  } else {
    // 会话 cookie：不设 Max-Age/Expires => 浏览器窗口关闭时即失效。
    document.cookie = `${FORM_OVERRIDE_COOKIE}=${form}; path=/; SameSite=Lax`;
  }
}

const ProductFormContext = createContext<Ctx | null>(null);

export function ProductFormProvider({
  children,
  switcherEnabled = false,
}: { children: React.ReactNode; switcherEnabled?: boolean }) {
  const [bs, setBs] = useState<Bootstrap | null>(null);
  const { user, selectedTenantId, setSelectedTenant } = useAuth();
  const isTenantAdmin = user?.role === 'tenant_admin';
  const [viewer, setViewerState] = useState<Viewer>(() => readViewerCookie());
  // 会话级产品形态 UI 覆盖值。挂载时从 cookie 读取，这样同一浏览器会话
  // 内刷新页面仍保留用户的选择。
  const [override, setOverride] = useState<string | null>(() => readFormOverrideCookie());

  // A system administrator's platform view must never retain an impersonated
  // tenant. Besides making global module controls look read-only, that stale
  // context is sent as X-Tenant-ID and the API correctly rejects the write.
  // Keep this reconciliation here as well as in the switcher so a refresh or
  // an older browser session repairs itself without another viewer switch.
  useEffect(() => {
    if (user?.role === 'system_admin' && viewer === 'platform' && selectedTenantId !== null) {
      setSelectedTenant(null);
    }
  }, [user?.role, viewer, selectedTenantId, setSelectedTenant]);

  useEffect(() => {
    // GT-11771 P3: out-of-order response guard. When a system_admin switches
    // tenant A→B quickly, the slower A response can resolve after B and
    // apply A's grants while the UI shows B. Track the latest request and
    // ignore responses from superseded ones. Also avoid nulling bs on
    // transient fetch errors — that reverts capabilities to defaults and
    // can hide the previous tenant's grants.
    let cancelled = false;
    const controller = new AbortController();

    // GT-12013 follow-up: this fetch used to have NO retry — a single transient
    // failure left `bs` null forever (the catch deliberately keeps the previous
    // value). That was survivable while consumers defaulted to "unregistered =
    // visible", but `registryReady` now fails CLOSED on a null bs, so one blip on
    // first load would permanently hide the platform-only infra cards with no
    // error shown. Retry with backoff so a transient failure self-heals.
    const load = async () => {
      const delays = [0, 500, 1500];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
        }
        if (cancelled) return;
        try {
          const b = await fetchBootstrap(undefined, { signal: controller.signal });
          if (cancelled) return;
          setBs(b);
          if (b.authStale) {
            clearStoredUser();
          }
          return;
        } catch {
          if (cancelled || controller.signal.aborted) return;
          // keep the previous bs; try again
        }
      }
      console.warn('[product-form] bootstrap failed after retries; feature registry unavailable');
    };
    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // Re-fetch when the impersonated tenant changes so grants reflect
    // the selected tenant's capability_flags, not the platform-admin state.
  }, [selectedTenantId]);

  // Clamp: tenant_admin must always be 'tenant'. Derive on read; sync the
  // cookie (external state) in an effect so a stale 'platform' cookie is fixed.
  const effectiveViewer: Viewer = isTenantAdmin ? 'tenant' : viewer;
  useEffect(() => {
    if (isTenantAdmin) {
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
    }
  }, [isTenantAdmin]);

  const setViewer = useCallback(
    (v: Viewer) => {
      const next = isTenantAdmin ? 'tenant' : v;
      setViewerState(next);
      document.cookie = `osg_viewer=${next}; path=/; SameSite=Strict`;
    },
    [isTenantAdmin],
  );

  const setFormOverride = useCallback((form: string | null) => {
    // 拒绝未知值，只接受真实存在的 preset。
    if (form !== null && !isValidForm(form)) return;
    setOverride(form);
    writeFormOverrideCookie(form);
  }, []);

  // 生效形态优先级：覆盖值（切换器开启时）> 后端 bootstrap > 环境变量默认值。
  const effectiveForm = switcherEnabled && override ? override : (bs?.form ?? 'ai-multi');
  const effectiveCapabilities = capabilitiesForForm(effectiveForm);

  return (
    <ProductFormContext.Provider
      value={{
        // 暴露「生效态」capabilities，这样所有现有消费者（侧栏可见性、
        // 页面级门控、品牌文案）会自动跟随覆盖值，无需各自感知切换器。
        capabilities: effectiveCapabilities,
        registry: bs?.featureRegistry ?? [],
        registryReady: bs != null,
        localAuthEnabled: bs?.localAuthEnabled ?? false,
        grants: bs?.grants ?? [],
        viewer: effectiveViewer,
        setViewer,
        switcherEnabled,
        effectiveForm,
        setFormOverride,
      }}
    >
      {children}
    </ProductFormContext.Provider>
  );
}

export function useProductForm(): Ctx {
  const c = useContext(ProductFormContext);
  // Isolated component tests and Storybook-like hosts intentionally mount leaf
  // security pages without the dashboard provider. Production always supplies
  // ProductFormProvider, but a safe read-only-compatible fallback keeps those
  // hosts from crashing merely because ModuleMasterSwitch needs viewer/scope
  // metadata. Preserve an explicit viewer cookie when one exists so even the
  // fallback never treats tenant impersonation as platform scope.
  if (!c) {
    return {
      capabilities: capabilitiesForForm('ai-multi'),
      registry: [],
      grants: [],
      registryReady: false,
      localAuthEnabled: false,
      viewer: readViewerCookie(),
      setViewer: () => {},
      switcherEnabled: false,
      effectiveForm: 'ai-multi',
      setFormOverride: () => {},
    };
  }
  return c;
}
