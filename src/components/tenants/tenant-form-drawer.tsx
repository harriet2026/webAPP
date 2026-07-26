'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Link } from '@/i18n/navigation';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createTenant,
  updateTenant,
  getTenantDomains,
  createTenantDomain,
  deleteTenantDomain,
} from '@/lib/api/tenants';
import { getUsers } from '@/lib/api/users';
import { ApiError } from '@/lib/api/client';
import type {
  Tenant,
  TenantDomain,
  CreateTenantRequest,
  UpdateTenantRequest,
  TenantLanguage,
} from '@/types/tenant';
import { normalizeTenantLanguage, TENANT_LANGUAGE_LABELS } from '@/types/tenant';
import { useProductForm } from '@/contexts/product-form-context';
import { cn } from '@/lib/utils';
import {
  makeTenantFormSchema,
  tenantConflictToastKey,
  diffTenantDomains,
  EMPTY_TENANT_FORM as EMPTY,
  type TenantFormValues,
} from './tenant-form-schema';

interface TenantFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTenant: Tenant | null;
}

export function TenantFormDrawer({ open, onOpenChange, editingTenant }: TenantFormDrawerProps) {
  const t = useTranslations('tenants');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const { registry } = useProductForm();
  // Capability checkboxes: only features flagged grantable in the registry.
  const grantableFeatures = registry.filter((f) => f.grantable);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failedDomains, setFailedDomains] = useState<string[]>([]);
  // GT-11844 removal guardrail: holds the submit that is waiting on the
  // operator's confirmation, plus the domains that would be deleted.
  const [pendingRemoval, setPendingRemoval] = useState<{
    values: TenantFormValues;
    removed: TenantDomain[];
  } | null>(null);

  // Primary admin (detail, edit mode only): derived from the users list
  // (the tenant_admin belonging to this tenant). Shares the ['users'] query
  // cache with the users page. Spec §6: 主管理员从 users 派生展示.
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => getUsers(),
    enabled: open && !!editingTenant,
  });
  const primaryAdmin = editingTenant
    ? users?.find((u) => u.tenant_id === editingTenant.id && u.role === 'tenant_admin')
    : undefined;

  // GT-11844: the edit drawer manages domains again (spec 2A L228 "域名登记";
  // PRD L141 "域名可增删多条"). Load the tenant's current domains so the form
  // can be seeded from them and the save can diff against them.
  const { data: existingDomains } = useQuery({
    queryKey: ['tenant-domains', editingTenant?.id],
    queryFn: () => getTenantDomains(editingTenant!.id),
    enabled: open && !!editingTenant,
  });

  // Domains are required in both modes (spec §5 / prototype). Re-derive the
  // schema by mode anyway so the flag stays explicit at the call site; RHF
  // reads the resolver on each render so switching create↔edit takes effect.
  const formSchema = useMemo(() => makeTenantFormSchema(true), []);
  const form = useForm<TenantFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'domains' });

  // Reset the form whenever the drawer target changes. Re-derive on open so the
  // fields are fresh even when navigating create → edit without unmounting.
  useEffect(() => {
    if (!open) return;
    setFailedDomains([]);
    setPendingRemoval(null);
    if (editingTenant) {
      // Wait for the domain list before seeding, otherwise the form would reset
      // to an empty domains array and a subsequent save would read that as
      // "delete every domain".
      if (!existingDomains) return;
      form.reset({
        name: editingTenant.name,
        code: editingTenant.code,
        language: normalizeTenantLanguage(editingTenant.language),
        expire_at: editingTenant.expire_at ? editingTenant.expire_at.slice(0, 10) : null,
        domains: existingDomains.map((d) => ({
          domain: d.domain,
          next_hop_type: d.next_hop_type === 'ip' ? ('ip' as const) : ('domain' as const),
          next_hop_host: d.next_hop_host || undefined,
          next_hop_port: d.next_hop_port || undefined,
        })),
        capability_flags: [...(editingTenant.capability_flags ?? [])],
      });
    } else {
      form.reset(EMPTY);
    }
  }, [open, editingTenant, existingDomains, form]);

  const toggleCapability = (id: string, checked: boolean) => {
    const current = form.getValues('capability_flags');
    const next = checked ? [...current, id] : current.filter((c) => c !== id);
    form.setValue('capability_flags', next, { shouldDirty: true });
  };

  // GT-11844: apply the edit-mode domain diff. Reuses the existing per-domain
  // endpoints (POST /tenants/:id/domains, DELETE /tenant-domains/:did) rather
  // than adding a bulk `domains` field to UpdateTenantRequest — those routes
  // already carry the tenant guard, cache invalidation and rule-change notify.
  const applyDomainDiff = async (tenantId: number, values: TenantFormValues) => {
    const { removed, added } = diffTenantDomains(existingDomains ?? [], values.domains);

    // Deletes first: doing adds first would trip the global unique constraint
    // on `domain` when a domain is being moved rather than genuinely added.
    for (const d of removed) {
      await deleteTenantDomain(d.id, tenantId);
    }
    for (const d of added) {
      const src = values.domains.find((v) => v.domain.trim() === d.domain.trim());
      await createTenantDomain(tenantId, {
        domain: d.domain.trim(),
        next_hop_type: src?.next_hop_type ?? '',
        next_hop_host: src?.next_hop_host ?? '',
        next_hop_port: src?.next_hop_port ?? 0,
      });
    }
    return { removedCount: removed.length, addedCount: added.length };
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    // Guardrail: removing a domain also drops its next-hops and egress
    // bindings, which silently breaks live mail routing for that domain. Make
    // the operator confirm before a general "edit tenant" save destroys
    // routing config — the prototype has no such gate, but it also has no real
    // routing behind the tag.
    if (editingTenant && !pendingRemoval) {
      const { removed } = diffTenantDomains(existingDomains ?? [], values.domains);
      if (removed.length > 0) {
        setPendingRemoval({ values, removed });
        return;
      }
    }
    setPendingRemoval(null);

    setIsSubmitting(true);
    try {
      if (editingTenant) {
        const payload: UpdateTenantRequest = {
          name: values.name,
          language: values.language,
          expire_at: values.expire_at ? `${values.expire_at}T23:59:59Z` : null,
          capability_flags: values.capability_flags,
          // optimistic lock — apiserver rejects with 409 tenant_modified on drift
          updated_at: editingTenant.updated_at,
        };
        await updateTenant(editingTenant.id, payload);
        await applyDomainDiff(editingTenant.id, values);
        toast.success(t('toast.updated'));
        queryClient.invalidateQueries({ queryKey: ['tenants'] });
        queryClient.invalidateQueries({ queryKey: ['tenant-stats'] });
        queryClient.invalidateQueries({ queryKey: ['tenant-domains'] });
        queryClient.invalidateQueries({ queryKey: ['routing-overview'] });
        onOpenChange(false);
      } else {
        const payload: CreateTenantRequest = {
          name: values.name,
          code: values.code,
          language: values.language,
          expire_at: values.expire_at ? `${values.expire_at}T23:59:59Z` : null,
          capability_flags: values.capability_flags,
          domains: values.domains.map((d: { domain: string; next_hop_type?: string; next_hop_host?: string; next_hop_port?: number }) => ({
            domain: d.domain,
            next_hop_type: d.next_hop_type,
            next_hop_host: d.next_hop_host,
            next_hop_port: d.next_hop_port,
          })),
        };
        const res = await createTenant(payload);
        if (res.domain_errors && res.domain_errors.length > 0) {
          setFailedDomains(res.domain_errors.map((e) => e.domain));
          toast.warning(t('toast.partial'));
          // tenant was still created — refresh the list so the partial success shows
          queryClient.invalidateQueries({ queryKey: ['tenants'] });
          queryClient.invalidateQueries({ queryKey: ['tenant-stats'] });
        } else {
          toast.success(t('toast.created'));
          queryClient.invalidateQueries({ queryKey: ['tenants'] });
          queryClient.invalidateQueries({ queryKey: ['tenant-stats'] });
          onOpenChange(false);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // GT-11553 — see tenantConflictToastKey: a 409 is either a duplicate
        // tenant code or optimistic-lock drift, and they need different copy.
        const code = (err.body?.error as { code?: string } | undefined)?.code;
        toast.error(t(tenantConflictToastKey(code)));
      } else {
        toast.error(err instanceof Error ? err.message : tc('error'));
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{editingTenant ? t('editTenant') : t('createTenant')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-5">
            {/* §1 — basic info */}
            <section className="space-y-4">
              <SectionLabel>{t('tenantName')}</SectionLabel>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>
                    {t('tenantName')} <span className="text-destructive">*</span>
                  </Label>
                  <Input {...form.register('name')} placeholder={t('namePlaceholder')} />
                  {form.formState.errors.name && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.name.message === 'nameRequired'
                        ? t('nameRequired')
                        : tc('required')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>
                    {t('form.code')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...form.register('code')}
                    placeholder="acme"
                    disabled={!!editingTenant}
                    readOnly={!!editingTenant}
                  />
                  {form.formState.errors.code && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.code.message === 'codeRequired'
                        ? t('codeRequired')
                        : tc('required')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t('form.expireAt')}</Label>
                  <Input type="date" {...form.register('expire_at')} />
                  {form.formState.errors.expire_at && (
                    <p className="text-xs text-destructive">
                      {t('expireAtBeforeToday')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t('form.language')}</Label>
                  <Select
                    value={form.watch('language')}
                    onValueChange={(v) => form.setValue('language', v as TenantLanguage)}
                  >
                    <SelectTrigger id="tenant-language" aria-labelledby="tenant-language-label">
                      <SelectValue>{TENANT_LANGUAGE_LABELS[form.watch('language')]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh">中文</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="th">ไทย</SelectItem>
                      <SelectItem value="ru">Русский</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <Separator />

            {/* §1.5 — primary admin (detail, edit mode only). Derived from the
                users list; links to user management filtered by this tenant.
                Spec §6: 「主管理员」在详情区从 users 派生展示, 链接到用户管理(按该租户过滤). */}
            {editingTenant && (
              <>
                <section className="space-y-3">
                  <SectionLabel>{t('detail.primaryAdmin')}</SectionLabel>
                  <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                    {primaryAdmin ? (
                      <span className="text-sm font-medium text-foreground">
                        {primaryAdmin.username}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t('detail.primaryAdminNone')}
                      </span>
                    )}
                    <Link
                      href={`/users?tenant=${editingTenant.id}`}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {t('detail.viewInUserManagement')}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </section>

                <Separator />
              </>
            )}

            {/* §2 — domain registration. GT-11844: shown in BOTH modes (spec 2A
                L228 "域名登记"; PRD L141 "域名可增删多条"). Edit mode seeds from
                GET /tenants/:id/domains and diffs on save; the dedicated
                /tenants/[id]/domains page remains the place for per-domain
                next-hop / ownership-verification management. */}
            {(
              <section className="space-y-4">
                {form.formState.errors.domains?.root && (
                  <p className="text-xs text-destructive">{t('domainsRequired')}</p>
                )}
                <div className="flex items-center justify-between">
                  <SectionLabel>{t('form.domains')}</SectionLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      append({
                        domain: '',
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    {t('addDomain')}
                  </Button>
                </div>

                {fields.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('descriptionPlaceholder')}</p>
                )}

                <div className="space-y-3">
                  {fields.map((field, idx) => {
                    const domainValue = form.watch(`domains.${idx}.domain`);
                    const isFailed = failedDomains.includes(domainValue);
                    const hopType = form.watch(`domains.${idx}.next_hop_type`);
                    return (
                      <div
                        key={field.id}
                        className={cn(
                          'rounded-xl border p-3',
                          isFailed
                            ? 'border-destructive/60 bg-destructive/5'
                            : 'border-border/70',
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('domain')} #{idx + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => remove(idx)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label>{t('domain')}</Label>
                            <Input
                              {...form.register(`domains.${idx}.domain`)}
                              placeholder="example.com"
                            />
                            {form.formState.errors.domains?.[idx]?.domain && (
                              <p className="text-xs text-destructive">{t('invalidDomain')}</p>
                            )}
                            {isFailed && (
                              <p className="text-xs text-destructive">{t('toast.partial')}</p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label>{t('nextHopType')}</Label>
                            <Select
                              value={hopType ?? ''}
                              onValueChange={(v) =>
                                form.setValue(`domains.${idx}.next_hop_type`, v as 'domain' | 'ip')
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="domain">{t('nextHopTypeDomain')}</SelectItem>
                                <SelectItem value="ip">{t('nextHopTypeIp')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>{t('nextHopPort')}</Label>
                            <Input
                              type="number"
                              {...form.register(`domains.${idx}.next_hop_port`, {
                                // Empty → undefined (not NaN) so an omitted port
                                // passes the optional schema check.
                                setValueAs: (v) =>
                                  v === '' || v === null || v === undefined
                                    ? undefined
                                    : Number(v),
                              })}
                              placeholder="25"
                            />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label>{t('nextHopHost')}</Label>
                            <Input
                              {...form.register(`domains.${idx}.next_hop_host`)}
                              placeholder={hopType === 'ip' ? '192.168.1.1' : 'smtp.internal'}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {!editingTenant && <Separator />}

            {/* §3 — capability grants */}
            <section className="space-y-4">
              <SectionLabel>{t('form.capabilities')}</SectionLabel>
              <div className="space-y-2">
                {grantableFeatures.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('descriptionPlaceholder')}</p>
                )}
                {grantableFeatures.map((feature) => {
                  const checked = form.watch('capability_flags').includes(feature.id);
                  return (
                    <label
                      key={feature.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 p-3 hover:bg-muted/40"
                      htmlFor={`cap-${feature.id}`}
                    >
                      <Checkbox
                        id={`cap-${feature.id}`}
                        checked={checked}
                        onCheckedChange={(c) => toggleCapability(feature.id, c)}
                      />
                      <span className="text-sm font-medium">
                        {t(`capability.${feature.id}` as const)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>

      {/* GT-11844 removal guardrail. Deleting a domain cascades to its
          next-hops and egress bindings, so a mis-click while editing an
          unrelated field would silently break that domain's mail routing.
          Domains that already carry routing config are called out explicitly. */}
      <ConfirmDialog
        open={!!pendingRemoval}
        onOpenChange={(o) => !o && setPendingRemoval(null)}
        title={t('confirm.removeDomains', { count: pendingRemoval?.removed.length ?? 0 })}
        description={
          pendingRemoval
            ? t('confirm.removeDomainsHint', {
                domains: pendingRemoval.removed.map((d) => d.domain).join('、'),
                routed: pendingRemoval.removed.filter((d) => !!d.next_hop_host).length,
              })
            : undefined
        }
        variant="destructive"
        onConfirm={() => {
          // pendingRemoval is set, so the guard at the top of handleSubmit is
          // bypassed on this second pass and the save proceeds.
          void handleSubmit();
        }}
      />
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground">{children}</h3>
  );
}
