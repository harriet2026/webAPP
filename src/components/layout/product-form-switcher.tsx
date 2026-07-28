'use client';

import { useState, useEffect } from 'react';
import { Building2, Check, ExternalLink, FileText, User, FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FORM_METADATA, formMeta } from '@/lib/product-form/resolve';
import { useProductForm } from '@/contexts/product-form-context';
import { useAuth } from '@/contexts/auth-context';
import { ViewerSwitcherTenantDialog } from './viewer-switcher-tenant-dialog';
import { isMockEnabled, toggleMock, subscribeMockEnabled } from '@/lib/mock/storage';

export function ProductFormSwitcher() {
  const { switcherEnabled, effectiveForm, setFormOverride, viewer, setViewer } = useProductForm();
  const { isSystemAdmin, selectedTenantId, setSelectedTenant } = useAuth();
  const t = useTranslations('productForm');
  const tViewer = useTranslations('viewer');
  const tMock = useTranslations('mock');
  // 切到 tenant 视角但尚未选中租户时，弹租户选择 dialog。
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Mock 数据开关状态。仅在 switcherEnabled（开发形态切换器）可见时才有意义：
  // 这是给前端开发/演示用的无后端 mock 层入口。组件只在登录后的 dashboard
  // 客户端场景下挂载，因此可以安全地在 lazy initializer 里读取 localStorage
  // 作为初值；effect 只负责订阅跨标签页同步。
  const [mockEnabled, setMockEnabled] = useState(() => isMockEnabled());
  useEffect(() => subscribeMockEnabled(setMockEnabled), []);

  // 可见性门控：服务端 layout 仅在 OSGATEWAY_PRODUCT_FORM_SWITCHER=true
  // 时才给 provider 传 switcherEnabled=true。provider 会透传此 flag；
  // 开关关闭时本组件直接返回 null 不渲染。
  if (!switcherEnabled) return null;

  // effectiveForm 只可能是 preset 之一（context 有兜底），formMeta 一定命中。
  const i18nKey = formMeta(effectiveForm)?.i18nKey ?? 'aiMulti';

  // 切换登录视角的处理：
  // - 切 platform：直接 setViewer('platform')。
  // - 切 tenant：若已有 selectedTenantId，复用之（与 useImpersonate 顺序一致：
  //   setSelectedTenant → setViewer），否则弹租户选择 dialog（见下方渲染）。
  //   不弹 dialog 直接切的话，security-scope 会把 viewer==='tenant' &&
  //   selectedTenantId==null 静默归一化回 platform，用户会困惑"点了却没切"。
  //   注意 base-ui DropdownMenuItem 点击即关闭 dropdown，dialog 在其之后弹出。
  const handleSwitchViewer = (next: 'platform' | 'tenant') => {
    if (next === 'platform') {
      // Global security modules must be edited without X-Tenant-ID.  Keep the
      // viewer and tenant context in sync when returning from a tenant view.
      setSelectedTenant(null);
      setViewer('platform');
      return;
    }
    if (selectedTenantId != null) {
      // 租户已选中（如顶栏 TenantSelector 选过），直接切 viewer 即可。
      // 不必再 setSelectedTenant —— React 对相同原始值短路不 re-render，
      // cookie/localStorage 也已是该值；X-Tenant-ID 头由 selectedTenantId
      // 决定，本来就非 null，无需重写。
      setViewer('tenant');
    } else {
      setTenantDialogOpen(true);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-8 items-center gap-1 rounded border border-border/80 bg-card px-2.5 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label={t('label')}
        >
          {/* 产品形态始终显示（主标识） */}
          <span className="text-muted-foreground/70">{t('label')}:</span>
          {/* 产品形态名称 + 视角徽标 + Mock 徽标均依赖客户端 context，
              用 mounted 守卫确保 SSR 和客户端初始渲染输出一致，避免 hydration mismatch。 */}
          {mounted && (
            <>
              <span className="text-foreground">{t(i18nKey)}</span>
              {isSystemAdmin && viewer === 'tenant' && (
                <span className="ml-0.5 inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <User className="mr-1 h-3 w-3" />
                  {tViewer('tenant')}
                </span>
              )}
              {mockEnabled && (
                <span className="ml-0.5 inline-flex items-center rounded bg-violet-500/15 px-1.5 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
                  <FlaskConical className="mr-1 h-3 w-3" />
                  Mock
                </span>
              )}
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {/* 使用普通 div 作标题而非 DropdownMenuLabel，避免 base-ui 对
              MenuGroupRootContext 的严格校验（该上下文要求外层必须有 Group 包裹）。 */}
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t('label')}
          </div>
          <DropdownMenuSeparator />
          {FORM_METADATA.map((meta) => (
            <DropdownMenuItem
              key={meta.id}
              onClick={() => setFormOverride(meta.id)}
              className="flex items-center justify-between"
            >
              <span>{t(meta.i18nKey)}</span>
              {effectiveForm === meta.id && <Check className="ml-2 h-4 w-4" />}
            </DropdownMenuItem>
          ))}

          {/* 登录视角段：仅 system_admin 可见。tenant_admin 被 context
              钳制为 tenant（无法切换），不应看到此入口。 */}
          {isSystemAdmin && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {tViewer('label')}
              </div>
              <DropdownMenuItem
                onClick={() => handleSwitchViewer('platform')}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {tViewer('platform')}
                </span>
                {viewer === 'platform' && <Check className="ml-2 h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleSwitchViewer('tenant')}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {tViewer('tenant')}
                </span>
                {viewer === 'tenant' && <Check className="ml-2 h-4 w-4" />}
              </DropdownMenuItem>
            </>
          )}

          {/* Mock 数据开关段：开启后 client.ts 的 apiRequest 会用 fixture
              代替真实后端请求，便于无后端环境下的前端开发/演示。
              切换后自动刷新页面，让正在挂载中的组件重新以 mock 数据渲染。 */}
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {tMock('label')}
          </div>
          <DropdownMenuItem
            onClick={() => {
              toggleMock();
              // 切换后重新加载，确保所有已挂载组件用新的数据源重新渲染。
              if (typeof window !== 'undefined') window.location.reload();
            }}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              {tMock('enabled')}
            </span>
            {mockEnabled && <Check className="ml-2 h-4 w-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.open('/html-spec/index.html', '_blank', 'noopener,noreferrer');
              }
            }}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {tMock('htmlSpec')}
            </span>
            <ExternalLink className="ml-2 h-4 w-4 text-muted-foreground" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 切到 tenant 视角但 selectedTenantId 为空时的租户选择 dialog。
          受控渲染：open 状态由 dropdown menuitem 的 onClick 触发。 */}
      {isSystemAdmin && (
        <ViewerSwitcherTenantDialog
          open={tenantDialogOpen}
          onOpenChange={setTenantDialogOpen}
        />
      )}
    </>
  );
}
