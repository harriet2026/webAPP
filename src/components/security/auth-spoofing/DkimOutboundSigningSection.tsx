'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, KeyRound, Loader2, Settings2 } from 'lucide-react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DkimStatusBadge } from '@/components/dkim/dkim-status-badge';
import { DkimManageDrawer } from '@/components/dkim/dkim-manage-drawer';
import { getTenantDomains } from '@/lib/api/tenants';
import { listDkimKeys, type DkimKey } from '@/lib/api/dkim';
import { useTenant } from '@/hooks/use-tenant';
import { usePermission } from '@/hooks/use-permission';
import { useProductForm } from '@/contexts/product-form-context';
import { cn } from '@/lib/utils';

/**
 * DKIM 外发签名子卡 —— 隶属「认证协议检查」模块（策略流水线 → 阶段2 → 收发信人
 * 策略 → 身份认证与仿冒检测）。
 *
 * 与同卡的 SPF/DKIM/DMARC/PTR「入站校验」页签正交：那些页签判定收到的邮件的
 * DKIM 结果并采取动作；这里管理的是本租户「外发」邮件的 DKIM 签名密钥（生成/
 * 导入私钥、发布 DNS 公钥、校验、激活）。因此本子卡走 DKIM 自己的接口与内存态，
 * 完全不接入 AuthSpoofingConfig 的统一保存流，避免两种语义耦合。
 *
 * 权限（本次需求）：平台管理员（需先选定租户）与租户管理员均可管理本租户签名。
 * 平台管理员未选租户时（多租户形态）显示引导空态，不发起查询 —— 复刻
 * group-policy-page 的 platformWithoutTenant 约定。
 */
export function DkimOutboundSigningSection() {
  const t = useTranslations('authSpoofing');
  const queryClient = useQueryClient();
  const { effectiveTenantId, isSystemAdmin } = useTenant();
  const { isTenantAdmin } = usePermission();
  const { capabilities } = useProductForm();

  const [open, setOpen] = useState(true);
  const [manageDomain, setManageDomain] = useState<string | null>(null);

  // 多租户形态下，平台管理员未选租户 → 无从确定作用域，显示引导空态。
  const platformWithoutTenant =
    !!capabilities?.multiTenant && isSystemAdmin && effectiveTenantId == null;
  const canQuery =
    (isSystemAdmin || isTenantAdmin) && effectiveTenantId != null && !platformWithoutTenant;

  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ['dkim-outbound-domains', effectiveTenantId],
    queryFn: () => getTenantDomains(effectiveTenantId as number),
    enabled: canQuery,
  });

  const { data: keyList, isLoading: keysLoading } = useQuery({
    queryKey: ['dkim-keys', effectiveTenantId],
    queryFn: () => listDkimKeys({ tenant_id: effectiveTenantId as number, page: 1, page_size: 100 }),
    enabled: canQuery,
  });

  // 每个域名的「当前启用」密钥 + 是否已有任意密钥，驱动状态列展示。
  const { activeKeyByDomain, hasKeyByDomain } = useMemo(() => {
    const active: Record<string, DkimKey> = {};
    const has = new Set<string>();
    for (const k of keyList?.items ?? []) {
      has.add(k.domain);
      if (k.is_active) active[k.domain] = k;
    }
    return { activeKeyByDomain: active, hasKeyByDomain: has };
  }, [keyList]);

  const loading = domainsLoading || keysLoading;

  const handleManageClose = (next: boolean) => {
    if (!next) {
      setManageDomain(null);
      // 抽屉里的生成/导入/校验/激活/删除会改变密钥集合；广义失效 dkim-keys
      // 让本子卡的状态列与抽屉自身列表都刷新。
      queryClient.invalidateQueries({ queryKey: ['dkim-keys'] });
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10" data-testid="dkim-outbound-section">
      <Collapsible open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t('dkimOutbound.title')}</div>
            <p className="truncate text-xs text-muted-foreground">{t('dkimOutbound.description')}</p>
          </div>
        </button>

        <CollapsibleContent>
          <div className="px-4 pb-4">
            {platformWithoutTenant ? (
              <p className="rounded-md border border-dashed border-border/70 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                {t('dkimOutbound.selectTenant')}
              </p>
            ) : loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">{t('dkimOutbound.loading')}</span>
              </div>
            ) : (domains ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed border-border/70 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                {t('dkimOutbound.noDomains')}
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border/60 bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('dkimOutbound.domainCol')}</TableHead>
                      <TableHead>{t('dkimOutbound.statusCol')}</TableHead>
                      <TableHead className="w-[120px] text-right">{t('dkimOutbound.actionsCol')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(domains ?? []).map((d) => {
                      const active = activeKeyByDomain[d.domain];
                      const hasKey = hasKeyByDomain.has(d.domain);
                      return (
                        <TableRow key={d.id} data-testid={`dkim-outbound-row-${d.domain}`}>
                          <TableCell className="font-mono text-sm">{d.domain}</TableCell>
                          <TableCell>
                            {active ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {t('dkimOutbound.activeSelector', { selector: active.selector })}
                                </span>
                                <DkimStatusBadge status={active.dns_status} />
                              </div>
                            ) : hasKey ? (
                              <Badge variant="secondary">{t('dkimOutbound.pendingVerify')}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                {t('dkimOutbound.notSigned')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setManageDomain(d.domain)}
                              data-testid={`dkim-outbound-manage-${d.domain}`}
                            >
                              <Settings2 className="mr-1 h-3.5 w-3.5" />
                              {t('dkimOutbound.manage')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {manageDomain != null && effectiveTenantId != null && (
        <DkimManageDrawer
          open={manageDomain != null}
          onOpenChange={handleManageClose}
          tenantId={effectiveTenantId}
          domain={manageDomain}
        />
      )}
    </div>
  );
}
