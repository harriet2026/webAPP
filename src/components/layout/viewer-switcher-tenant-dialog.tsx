'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { apiRequest } from '@/lib/api/client';

interface TenantListItem {
  id: number;
  name: string;
}

async function fetchTenantList(): Promise<TenantListItem[]> {
  const res = await apiRequest<{ items: TenantListItem[] }>('/tenants');
  return res.items ?? [];
}

/**
 * ViewerSwitcherTenantDialog — 弹出一个租户选择对话框，选完后切入 tenant 视角。
 *
 * 触发场景：平台管理员（system_admin）从顶栏 dropdown 切到"租户管理员"
 * 视角时，若 `selectedTenantId` 为 null（即尚未选中具体租户），不能
 * 直接进入—— 因为 security-scope（lib/security-scope.ts）会把
 * `viewer==='tenant' && isSystemAdmin && selectedTenantId==null` 静默
 * 归一化回 platform，导致用户点了看起来切了实际上没切。本 dialog 在
 * UI 层提前拦截，让用户先选定租户。
 *
 * 选定后调用顺序与 useImpersonate.ts 一致：
 *   setSelectedTenant(id) → setViewer('tenant')
 * context 的 useEffect[selectedTenantId] 会自动 refetch bootstrap，
 * 因此这里不跳路由，保持当前页面。
 *
 * query key 复用 ['tenants']（与 impersonation-banner.tsx 一致），
 * 这样切换后 banner 显示租户名字时可以直接命中缓存。
 *
 * 注意：本组件由 product-form-switcher 通过 `open` / `onOpenChange`
 * 受控渲染，不自带触发器。
 */
export function ViewerSwitcherTenantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('viewer');
  const { setSelectedTenant } = useAuth();
  const { setViewer } = useProductForm();
  const [picked, setPicked] = useState<number | null>(null);

  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: fetchTenantList,
    enabled: open,
  });

  // Base UI renders the raw value in <Select.Value> unless the Root gets `items`,
  // which showed the tenant id instead of its name (GT-12021).
  const selectItems = useMemo(
    () => Object.fromEntries((tenants ?? []).map((tenant) => [tenant.id.toString(), tenant.name])),
    [tenants],
  );

  const handleConfirm = () => {
    if (picked == null) return;
    setSelectedTenant(picked);
    setViewer('tenant');
    setPicked(null);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // 关闭时清空已选，避免下次打开残留上次选择。
      setPicked(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle>{t('selectTenantTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t('selectTenantDescription')}
        </p>
        <Select
          items={selectItems}
          value={picked?.toString() ?? ''}
          onValueChange={(v) => {
            if (typeof v !== 'string') return;
            const n = parseInt(v, 10);
            if (!isNaN(n)) setPicked(n);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('selectTenantPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {isLoading && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                …
              </div>
            )}
            {tenants?.map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id.toString()}>
                {tenant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t('selectTenantCancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={picked == null}>
            {t('selectTenantConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
