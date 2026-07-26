'use client';

import { useEffect, useState } from 'react';
import { useApiRequest } from '@/lib/api/client';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import {
  canEditSecurityModule,
  getSecurityModules,
  setSecurityModuleEnabled,
  type SecurityModulePage,
} from '@/lib/api/security-modules';

/** 策略流水线各面板「总开关」的注册表状态 + 立即持久化切换。
 *  与 ModuleMasterSwitch 的非 deferred 逻辑等价，供不经 ModuleMasterSwitch 包裹的
 *  独立面板（URL / Intent / Recipient）复用：读 GET /security/modules，
 *  写 PUT /security/modules/:page（乐观更新，失败回滚）。权限统一由模块作用域、
 *  当前 viewer、角色与所选租户共同决定。 */
export function useModuleMaster(page: SecurityModulePage) {
  const { apiRequest } = useApiRequest();
  const { user, selectedTenantId } = useAuth();
  const { capabilities, viewer } = useProductForm();
  const editable = canEditSecurityModule({
    page,
    role: user?.role,
    viewer,
    multiTenant: capabilities?.multiTenant ?? true,
    selectedTenantId,
  });
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSecurityModules(apiRequest)
      .then((m) => setEnabled(m[page] ?? true))
      .catch(() => {});
  }, [apiRequest, page]);

  const toggle = async (next: boolean) => {
    if (!editable) return;
    setSaving(true);
    const prev = enabled;
    setEnabled(next);
    try {
      await setSecurityModuleEnabled(page, next, apiRequest);
    } catch {
      setEnabled(prev);
    } finally {
      setSaving(false);
    }
  };

  return { enabled, saving, toggle, editable };
}
