'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2, Search, AlertCircle, LockOpen, Power, LogOut, FileText, KeyRound, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { usePermission } from '@/hooks/use-permission';
import { useAuth } from '@/contexts/auth-context';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import type { TenantUser, User, UserStatus, BulkUsersAction } from '@/types/user';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  unlockUser,
  setUserStatus,
  forceOfflineUser,
  bulkUsers,
} from '@/lib/api/users';
import {
  getTenantUsers,
  createTenantUser,
  updateTenantUser,
  deleteTenantUser,
  setTenantUserStatus,
  forceOfflineTenantUser,
  bulkTenantUsers,
} from '@/lib/api/tenant-users';
import { listTenants } from '@/lib/api/tenants';
import { getRoles, roleQueryKeys } from '@/lib/api/roles';
import { useApiRequest } from '@/lib/api/client';
import { formatDate, cn } from '@/lib/utils';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LoginSecurityTab } from '@/components/admin/login-security/LoginSecurityTab';
import { RolePermissionTab } from '@/components/admin/rbac/RolePermissionTab';
import { ResetPasswordDialog, generatePassword } from '@/components/admin/reset-password-dialog';

// GT-12307：对齐原型 layer-1 的字段校验（手机号 /^1[3-9]\d{9}$/、邮箱格式、
// 姓名 ≤64 字符）。格式仅在非空时校验；创建模式的必填约束在 handleSubmit
// 里逐字段 setError（编辑模式沿用"留空=不改"语义，不能静态写进 schema）。
// message 存 users.validation.* 的键名，渲染时经 validationText() 翻译。
const userSchema = z.object({
  username: z.string().min(1, 'usernameRequired'),
  role_id: z.number().optional(),
  // 账号状态：新建与编辑均可自由选择（原为只读展示）。取值对齐 UserStatus。
  status: z.enum(['normal', 'disabled']).optional(),
  tenant_id: z.number().nullable().optional(),
  password: z.string().min(6, 'passwordMinLength').optional().or(z.literal('')),
  must_change_password: z.boolean().optional(),
  name: z.string().max(64, 'nameTooLong').optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/, 'phoneInvalid').optional().or(z.literal('')),
  email: z.string().email('emailInvalid').optional().or(z.literal('')),
});

type UserForm = z.infer<typeof userSchema>;

export default function UsersPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { canManageUsers, canManageLoginSecurity, canManageRoles, isTenantAdmin, isSystemAdmin } = usePermission();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  // GT-12315：当前登录账号自身的行禁止「停用 / 删除」（自保护）。登录响应不回带
  // 真实 user.id（auth-context 里恒为 0），故以 username 作为身份判据——它是
  // localStorage 持久化的登录名，与列表行的 username 一致。
  const { user: currentUser } = useAuth();
  const router = useRouter();

  // Task 9 (Plan B): a true platform super admin manages the platform-wide
  // `/users` list; a tenant admin (who never holds manage_users — see the
  // GT-11959 note below) now has a real backend capability of their own,
  // `/tenant-users` (Plan B Task 7), scoped server-side to their tenant. The
  // account tab therefore switches its ENTIRE data source — reads and every
  // write mutation below — on this single flag, not just the query.
  //
  // "impersonation drives tenant scope" (product decision): a system_admin
  // who has selected a tenant via the global TenantSelector is impersonating
  // that tenant, and the account tab must follow — same tenant-scoped
  // create/read/write paths a tenant_admin gets, not the platform view. This
  // is exactly what useApiRequest()'s effectiveTenantId already models: for
  // a system_admin it IS selectedTenantId (impersonation), for a tenant_admin
  // it is always their own tenant_id. So "system_admin with a tenant
  // selected" collapses to `isSystemAdmin && effectiveTenantId != null`,
  // needing no separate read of selectedTenantId off useAuth().
  const isTenantView = isTenantAdmin || (isSystemAdmin && effectiveTenantId != null);
  const canManageAccounts = canManageUsers || isTenantAdmin;
  // Coarse tenant-admin fallback, mirroring canManageAccounts above: a tenant
  // admin always reaches their own tenant's 登录安全 (2FA self-toggle) and
  // 角色权限 tabs, regardless of the fine-grained role matrix. The seeded
  // default tenant roles (tenant_ops/tenant_auditor) ship with an EMPTY matrix,
  // so a pure hasPermission() gate would hide these tabs from every real tenant
  // admin (Plan D §5 A-18 requires the opposite). Per Decision 5 these platform
  // /tenant tabs are menu-visibility, not a hard security boundary — the tenant
  // data source is scoped by isTenantView, and the backend enforces isolation.
  const canManageLoginSecurityTab = canManageLoginSecurity || isTenantAdmin;
  const canManageRolesTab = canManageRoles || isTenantAdmin;
  const usersQueryKey = isTenantView ? 'tenant-users' : 'users';

  // Deep-link from the tenant-management drawer ("主管理员 → 在用户管理中查看"):
  // ?tenant=<id> pre-filters the list to that tenant's users (spec §6).
  const searchParams = useSearchParams();
  const tenantParam = searchParams.get('tenant');
  const tenantFilter = tenantParam !== null && tenantParam !== '' ? Number(tenantParam) : null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [disableId, setDisableId] = useState<number | null>(null);
  const [forceOfflineId, setForceOfflineId] = useState<number | null>(null);
  // GT-12314：独立重置密码对话框的目标账号
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchAction, setBatchAction] = useState<BulkUsersAction | null>(null);
  const unlockMutation = useMutation({
    mutationFn: (id: number) => unlockUser(id, apiRequest),
    onSuccess: () => toast.success(t('users.unlockSuccess')),
    onError: (e) => toast.error(e instanceof Error ? e.message : t('users.unlockFailed')),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  // GT-11959: `enabled` is load-bearing, not an optimisation. This page is now
  // reachable by a tenant admin (for the 登录安全 tab), and /users is admin-only.
  // Without the gate the query fires on mount, BEFORE any permission branch, and a
  // tenant admin eats a 403 on every visit — noise at best, and a global error
  // banner at worst (see GT-12005/12008: a 403 that simply means "not for this
  // viewer" must never be dressed up as a fault). Task 9 extends the same gate to
  // canManageAccounts so a tenant admin's own /tenant-users query is equally lazy.
  // GT-12290：平台视角下若带了 ?tenant=<id>（来自租户抽屉的"在用户管理中查看"
  // 深链），必须显式按该租户取数——平台作用域的 /users 里没有任何租户账号
  // （GT-12393），继续拉全量再客户端过滤只会得到空列表。queryKey 带上
  // tenantFilter，否则从 ?tenant=A 切到 ?tenant=B 会读到 A 的缓存。
  const { data: users, isLoading } = useQuery({
    queryKey: [usersQueryKey, tenantFilter],
    queryFn: () =>
      isTenantView
        ? getTenantUsers(apiRequest)
        : getUsers(apiRequest, tenantFilter !== null && !Number.isNaN(tenantFilter) ? tenantFilter : undefined),
    enabled: canManageAccounts,
  });

  // Task 9: roles feed the create/edit drawer's role_id Select
  // (`internal/api/roles.go`, already scoped server-side via
  // GetEffectiveTenantID — a tenant caller only ever sees its own
  // tenant-scope roles + read-only templates). apiRequest here is
  // useApiRequest()'s hook, which already injects X-Tenant-ID from
  // effectiveTenantId — so a system_admin impersonating a tenant gets that
  // tenant's roles for free. The query key must carry effectiveTenantId too,
  // or switching the impersonated tenant (or clearing it) would keep serving
  // the previously-selected tenant's role list from cache (see the same
  // convention on rules/tag, sideline, quarantine, ... pages).
  const { data: roles } = useQuery({
    queryKey: roleQueryKeys.list(effectiveTenantId),
    queryFn: () => getRoles(apiRequest),
    enabled: canManageAccounts,
  });
  // GT-12309：创建/编辑账号的角色下拉按视角过滤作用域——租户视角只留
  // 租户角色（原有行为），平台视角只留平台角色（此前不过滤，真·超管的
  // GET /roles"见全部"联合列表会把租户模板角色也灌进平台下拉）。
  const roleOptions = useMemo(
    () => (roles ?? []).filter((r) => (isTenantView ? r.scope === 'tenant' : r.scope === 'platform')),
    [roles, isTenantView],
  );

  // The tenant column used to print the raw tenant_id (GT-12021); resolve ids to
  // names. page_size is hard-clamped to 100 server side, so page through the
  // whole list — otherwise any user whose tenant falls off page 1 keeps showing
  // the bare id and the column reads inconsistently.
  const { data: tenants } = useQuery({
    queryKey: ['tenants', 'names'],
    queryFn: async () => {
      const all: { id: number; name: string }[] = [];
      for (let page = 1; ; page++) {
        const res = await listTenants({ page, pageSize: 100 });
        all.push(...(res.items ?? []));
        if (all.length >= (res.total ?? all.length) || !res.items?.length) break;
      }
      return all;
    },
    enabled: canManageUsers,
    retry: false,
  });
  const tenantNames = useMemo(
    () => new Map((tenants ?? []).map((tn) => [tn.id, tn.name])),
    [tenants],
  );

  // GT-12290：服务端已按 tenantFilter 过滤（见上面的 useQuery），这里保留的
  // 客户端过滤对已过滤结果是幂等操作；不删是因为它同时承载 search 过滤，
  // 删掉会牵动搜索/分页逻辑，本任务不动。
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let list = users;
    if (tenantFilter !== null && !Number.isNaN(tenantFilter)) {
      list = list.filter((u) => u.tenant_id === tenantFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.username.toLowerCase().includes(q));
    }
    return list;
  }, [users, search, tenantFilter]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => (isTenantView ? deleteTenantUser(id, apiRequest) : deleteUser(id, apiRequest)),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [usersQueryKey] });
      toast.success(t('common.deleteSuccess'));
      setDeleteId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Task 9: enable/disable an account. Confirmed before disabling (it revokes
  // every live session for the account server-side); re-enabling fires
  // immediately, mirroring the demo (`AdminAccountTab.toggleStatus`).
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: UserStatus }) =>
      isTenantView ? setTenantUserStatus(id, status, apiRequest) : setUserStatus(id, status, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [usersQueryKey] });
      toast.success(t('common.updateSuccess'));
      setDisableId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setDisableId(null);
    },
  });

  // Task 9: kick every live session for an account without touching its
  // status — the holder can log back in immediately.
  const forceOfflineMutation = useMutation({
    mutationFn: (id: number) =>
      isTenantView ? forceOfflineTenantUser(id, apiRequest) : forceOfflineUser(id, apiRequest),
    onSuccess: () => {
      toast.success(t('users.forceOfflineSuccess'));
      setForceOfflineId(null);
      queryClient.invalidateQueries({ queryKey: [usersQueryKey] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setForceOfflineId(null);
    },
  });

  // Task 9: multi-select batch enable/disable/delete. The server preflights
  // the WHOLE batch (e.g. it would leave zero enabled super admins) and
  // rejects with 409 — surface that server message via toast rather than a
  // generic failure (spec §4.2 F6).
  const bulkMutation = useMutation({
    mutationFn: (body: { action: BulkUsersAction; ids: number[] }) =>
      isTenantView ? bulkTenantUsers(body, apiRequest) : bulkUsers(body, apiRequest),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [usersQueryKey] });
      // GT-12315：批量停用会跳过当前登录账号（服务端 filterBulkDisable），
      // 此前无任何提示，管理员会误以为自己也被停用。按服务端返回的
      // skipped 明细给出显式反馈。
      if (result?.skipped?.length) {
        toast.info(t('users.batchSkipped', { count: result.skipped.length }));
      } else {
        toast.success(t('users.batchSuccess'));
      }
      setSelectedIds(new Set());
      setBatchAction(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setBatchAction(null);
    },
  });

  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: '', password: '', must_change_password: true, status: 'normal' },
  });

  // GT-12307：schema/setError 里存的是 users.validation.* 的键名，这里集中
  // 翻译（保持 t() 字面键，i18n-literal-keys 守卫可静态提取）。
  const validationText = (key?: string): string | undefined => {
    switch (key) {
      case 'usernameRequired': return t('users.validation.usernameRequired');
      case 'nameRequired': return t('users.validation.nameRequired');
      case 'phoneRequired': return t('users.validation.phoneRequired');
      case 'emailRequired': return t('users.validation.emailRequired');
      case 'passwordRequired': return t('users.validation.passwordRequired');
      case 'roleRequired': return t('users.validation.roleRequired');
      case 'nameTooLong': return t('users.validation.nameTooLong');
      case 'phoneInvalid': return t('users.validation.phoneInvalid');
      case 'emailInvalid': return t('users.validation.emailInvalid');
      case 'passwordMinLength': return t('users.validation.passwordMinLength');
      default: return key;
    }
  };
  const fieldError = (field: keyof UserForm) => {
    const msg = form.formState.errors[field]?.message as string | undefined;
    if (!msg) return null;
    return (
      <p className="text-xs text-destructive" data-testid={`field-error-${field}`}>
        {validationText(msg)}
      </p>
    );
  };
  // Not memoized: react-hook-form's watch() is not a stable/memoizable value
  // (it re-reads live form state), and this lookup is cheap enough to redo on
  // every render.
  const watchedRoleId = form.watch('role_id');
  const selectedRole = roleOptions.find((r) => r.id === watchedRoleId);

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      form.reset({
        username: user.username,
        role_id: user.roleId ?? undefined,
        status: user.status === 'disabled' ? 'disabled' : 'normal',
        tenant_id: user.tenant_id,
        password: '',
        name: user.name ?? '',
        phone: user.phone ?? '',
        email: user.email ?? '',
        must_change_password: user.must_change_password ?? false,
      });
    } else {
      setEditingUser(null);
      form.reset({
        username: '',
        role_id: undefined,
        status: 'normal',
        password: '',
        tenant_id: null,
        name: '',
        phone: '',
        email: '',
        must_change_password: true,
      });
    }
    setDialogOpen(true);
  };

  // GT-12307：创建模式的必填逐字段校验。抽成独立函数是因为它要在两处运行：
  //   1) onValid（handleSubmit）——username 非空、zod 通过时进入；
  //   2) onInvalid（onInvalidSubmit）——username 留空会先在 zod resolver 上失败，
  //      onValid 永不触发，若不在 onInvalid 里补校验，则只有 username 一处红字，
  //      姓名/手机号/邮箱/密码/角色都不给反馈（GT-12307 复现的正是此）。
  const stampCreateRequiredErrors = (values: UserForm): boolean => {
    let hasError = false;
    if (!values.username?.trim()) { form.setError('username', { message: 'usernameRequired' }); hasError = true; }
    if (!values.name?.trim()) { form.setError('name', { message: 'nameRequired' }); hasError = true; }
    if (!values.phone?.trim()) { form.setError('phone', { message: 'phoneRequired' }); hasError = true; }
    if (!values.email?.trim()) { form.setError('email', { message: 'emailRequired' }); hasError = true; }
    if (!values.password) { form.setError('password', { message: 'passwordRequired' }); hasError = true; }
    if (!values.role_id) { form.setError('role_id', { message: 'roleRequired' }); hasError = true; }
    return hasError;
  };

  // onInvalid：zod resolver 失败时触发。仅创建模式补齐必填红字（编辑模式沿用
  // "留空=不改"语义，不强制必填）；格式错误已由 zod 各自 setError，无需重复。
  const onInvalidSubmit = () => {
    if (editingUser) return;
    stampCreateRequiredErrors(form.getValues());
    toast.error(t('users.validation.fixFormErrors'));
  };

  const handleSubmit = async (data: UserForm) => {
    setIsSubmitting(true);
    try {
      if (editingUser) {
        const updateData: Record<string, unknown> = {
          name: data.name || undefined,
          phone: data.phone || undefined,
          email: data.email || undefined,
          role_id: data.role_id,
        };
        if (!isTenantView) {
          // GT-12313：username 不随编辑提交（服务端也已拒绝改名）。
          updateData.tenant_id = data.tenant_id ?? undefined;
        }
        if (data.password) {
          updateData.password = data.password;
        }
        // GT-12318：不再下发 must_change_password。编辑不带该字段时服务端保持
        // 原值（Spec §1.4）；重置密码时服务端自动强制 true（临时密码须改）。
        if (isTenantView) {
          await updateTenantUser(editingUser.id, updateData, apiRequest);
        } else {
          await updateUser(editingUser.id, updateData, apiRequest);
        }
        // 账号状态改动走与行操作一致的专用接口（停用时同时终止在线会话）。
        const nextStatus: UserStatus = data.status ?? 'normal';
        const prevStatus: UserStatus = editingUser.status === 'disabled' ? 'disabled' : 'normal';
        if (nextStatus !== prevStatus) {
          if (isTenantView) {
            await setTenantUserStatus(editingUser.id, nextStatus, apiRequest);
          } else {
            await setUserStatus(editingUser.id, nextStatus, apiRequest);
          }
        }
        toast.success(t('common.updateSuccess'));
      } else {
        // GT-12307：原型要求创建时账号/姓名/手机号/邮箱/初始密码均必填、角色必选，
        // 逐字段红字反馈。校验统一走 stampCreateRequiredErrors（同一份逻辑也在
        // onInvalidSubmit 里用——因为 username 空会先被 zod 拦下，onValid 根本进不来）。
        if (stampCreateRequiredErrors(data)) {
          toast.error(t('users.validation.fixFormErrors'));
          setIsSubmitting(false);
          return;
        }
        const payload = {
          username: data.username,
          // 上面已按 hasError 校验过 password 非空并 return，此处必然有值；
          // hasError 标志无法让 TS 收窄类型，故显式断言以满足 CreateUserRequest。
          password: data.password!,
          role_id: data.role_id,
          status: data.status ?? 'normal',
          name: data.name || undefined,
          phone: data.phone || undefined,
          email: data.email || undefined,
          ...(isTenantView ? {} : { tenant_id: data.tenant_id ?? undefined }),
          // GT-12318：不再下发 must_change_password——所有新账号首登强制改密，
          // 由服务端默认 true 保证（管理界面不提供"是否强制"开关）。
        };
        if (isTenantView) {
          await createTenantUser(payload, apiRequest);
        } else {
          await createUser(payload, apiRequest);
        }
        toast.success(t('common.createSuccess'));
      }
      queryClient.invalidateQueries({ queryKey: [usersQueryKey] });
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Task 9: multi-select for the batch bar. The header checkbox toggles every
  // currently-filtered row (not just the current DataTable page — pagination
  // is a client-side view over `filteredUsers`, and "select all" should mean
  // all of it, matching the demo's `toggleAll`).
  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.has(u.id));
  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(filteredUsers.map((u) => u.id)) : new Set());
  };
  const toggleSelectRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const columns: ColumnDef<TenantUser>[] = [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={allFilteredSelected}
          onCheckedChange={(v) => toggleSelectAll(v === true)}
          aria-label={t('users.selectAll')}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          data-testid={`user-row-checkbox-${row.original.id}`}
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={(v) => toggleSelectRow(row.original.id, v === true)}
          aria-label={t('users.selectRow')}
        />
      ),
    },
    { accessorKey: 'id', header: 'ID', size: 60 },
    // GT-12312：表头对齐原型「账号/用户名」（抽屉标签同步）。
  { accessorKey: 'username', header: t('users.accountUsername') },
    // GT-11960: name / email / last_login_at were already on the wire (see
    // storage.ListUsers) but were never rendered.
    {
      accessorKey: 'name',
      header: t('users.name'),
      cell: ({ row }) => row.original.name || <span className="text-muted-foreground">-</span>,
    },
    {
      accessorKey: 'email',
      header: t('users.email'),
      cell: ({ row }) => row.original.email || <span className="text-muted-foreground">-</span>,
    },
    // Task 9: phone was already on the wire (Task 1/2 storage+API) but never rendered.
    {
      accessorKey: 'phone',
      header: t('users.phone'),
      cell: ({ row }) => row.original.phone || <span className="text-muted-foreground">-</span>,
    },
    { accessorKey: 'role', header: t('users.role'), cell: ({ row }) => {
      // GT-12391: show the ACTUAL role name (平台审计员 / 安全运营 / 审计员 /
      // custom), not the coarse system_admin/tenant_admin string — every platform
      // account carries role='system_admin' and every tenant account
      // role='tenant_admin', so the coarse string collapses distinct roles into
      // two labels. roleName is server-supplied on the tenant list; on the
      // platform list resolve roleId against the loaded roles. Fall back to the
      // coarse label only when neither is available.
      const isPlatform = row.original.role === 'system_admin';
      const serverRoleName =
        'roleName' in row.original && typeof row.original.roleName === 'string'
          ? row.original.roleName
          : undefined;
      const resolved =
        serverRoleName ??
        roles?.find((r) => r.id === row.original.roleId)?.name ??
        (isPlatform ? t('users.systemAdmin') : t('users.tenantAdmin'));
      return <StatusBadge status={resolved} variant={isPlatform ? 'default' : 'info'} />;
    } },
    {
      accessorKey: 'tenant_id',
      header: t('users.tenant'),
      size: 120,
      cell: ({ row }) => {
        const id = row.original.tenant_id;
        if (id == null) return '-';
        return tenantNames.get(id) ?? String(id);
      },
    },
    // Task 9: account enable/disable status. `status` is `omitempty` on the
    // wire — absent means normal (the pre-Plan-B default).
    {
      id: 'status',
      header: t('users.status'),
      size: 90,
      cell: ({ row }) =>
        row.original.status === 'disabled' ? (
          <StatusBadge
            status={t('users.disabled')}
            variant="error"
            data-testid={`user-status-badge-${row.original.id}`}
          />
        ) : (
          <StatusBadge
            status={t('users.normal')}
            variant="success"
            data-testid={`user-status-badge-${row.original.id}`}
          />
        ),
    },
    // Task 9: derived per-request online indicator (admin_sessions-backed).
    {
      id: 'online',
      header: t('users.online'),
      size: 90,
      cell: ({ row }) => (
        <span
          data-testid={`user-online-${row.original.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className={cn('h-2 w-2 rounded-full', row.original.online ? 'bg-emerald-500' : 'bg-muted-foreground/30')}
          />
          {row.original.online ? t('users.online') : t('users.offline')}
        </span>
      ),
    },
    {
      accessorKey: 'must_change_password',
      header: t('users.mustChangeColumnHeader'),
      size: 100,
      cell: ({ row }) => (
        row.original.must_change_password ? (
          <Badge variant="secondary" className="gap-1" data-testid={`user-must-change-badge-${row.original.id}`}>
            <AlertCircle className="h-3 w-3" />
            {t('users.mustChangeBadge')}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      ),
    },
    {
      accessorKey: 'last_login_at',
      header: t('users.lastLoginAt'),
      // GT-12312：原型在最后登录时间列以绿点标注在线账号，悬浮提示
      // 「当前在线」（独立的在线列保留——实现已多做的能力不回退）。
      // Tooltip 触发器必须包住日期文本本身（而非仅绿点），否则悬浮日期看不到提示；
      // 且对离线账号也常驻渲染 tooltip（内容回落为列名），保证任意一行日期悬浮都有提示。
      cell: ({ row }) =>
        row.original.last_login_at ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  data-testid={`user-lastlogin-${row.original.id}`}
                  className="inline-flex items-center gap-1.5"
                >
                  {row.original.online && (
                    <span
                      data-testid={`user-lastlogin-online-dot-${row.original.id}`}
                      className="h-2 w-2 rounded-full bg-emerald-500"
                    />
                  )}
                  {formatDate(row.original.last_login_at)}
                </span>
              }
            />
            <TooltipContent>
              {row.original.online ? t('users.currentlyOnline') : t('users.lastLoginAt')}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">{t('users.neverLoggedIn')}</span>
        ),
    },
    { accessorKey: 'created_at', header: t('logs.timestamp'), cell: ({ row }) => formatDate(row.original.created_at) },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => {
        const isDisabled = row.original.status === 'disabled';
        // GT-12315：自保护——当前登录账号自身不可「停用 / 删除」。
        const isSelf = !!currentUser?.username && row.original.username === currentUser.username;
        return (
          <div className="flex gap-1">
            {/* GT-11959: the ONLY console path out of a permanent lock
                (lockout_minutes = -1), which has no natural expiry. The alternative —
                the internal ResetAdminLockout — clears ALL lockouts cluster-wide, so
                freeing one user with it would lift brute-force protection for everyone.
                Without this button, "permanent lock" is a setting that bricks accounts
                with no way back. Idempotent: unlocking an unlocked account is a no-op.
                GT-12308：租户视角同样显示——POST /users/:id/unlock 本就挂在
                protected 组（spec A-16"勿移回 adminOnly"），handler 内做租户
                隔离，租户管理员可解锁本租户账号；之前 !isTenantView 的门
                把这条唯一的解锁通道从租户 UI 上藏掉了。 */}
            <Button
              variant="ghost"
              size="icon"
              title={t('users.unlock')}
              data-testid={`unlock-user-${row.original.id}`}
              onClick={() => unlockMutation.mutate(row.original.id)}
              disabled={unlockMutation.isPending}
            >
              <LockOpen className="h-4 w-4" />
            </Button>
            {/* Task 9: enable/disable. Disabling is confirmed (it revokes every
                live session server-side); re-enabling fires immediately. */}
            <Button
              variant="ghost"
              size="icon"
              title={isDisabled ? t('users.enable') : t('users.disable')}
              data-testid={`toggle-status-${row.original.id}`}
              disabled={isSelf}
              onClick={() => {
                if (isDisabled) {
                  statusMutation.mutate({ id: row.original.id, status: 'normal' });
                } else {
                  setDisableId(row.original.id);
                }
              }}
            >
              <Power className="h-4 w-4" />
            </Button>
            {/* Task 9: force-offline — kicks live sessions without touching status. */}
            <Button
              variant="ghost"
              size="icon"
              title={t('users.forceOffline')}
              data-testid={`force-offline-${row.original.id}`}
              onClick={() => setForceOfflineId(row.original.id)}
            >
              <LogOut className="h-4 w-4" />
            </Button>
            {/* GT-12315：原型行操作含「查看日志」——跳到操作日志页并按该账号
                预过滤（keyword 与 admin-audit 的关键字过滤对齐）。必须渲染成真正的
                <button>（而����� render=<Link/> 的 <a>），否则 U13 的
                button[title="查看日志"] 定位不到——这正是此前「查看日志按钮不存在」的根因。 */}
            <Button
              variant="ghost"
              size="icon"
              title={t('users.viewLogs')}
              data-testid={`view-logs-${row.original.id}`}
              onClick={() =>
                router.push(`/logs/admin-audit?keyword=${encodeURIComponent(row.original.username)}`)
              }
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={t('common.edit')}
              data-testid={`edit-user-${row.original.id}`}
              onClick={() => handleOpenDialog(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {/* GT-12314：独立重置密码入口（原型行操作），不再只能借道编辑抽屉。 */}
            <Button
              variant="ghost"
              size="icon"
              title={t('users.resetPassword.title')}
              data-testid={`reset-password-${row.original.id}`}
              onClick={() => setResetTarget(row.original)}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            {/* GT-12315：删除按钮补 title="删除"（U13 行操作决策表按 title 定位），
                并对当前登录账号自身禁用（自保护）。 */}
            <Button
              variant="ghost"
              size="icon"
              title={t('common.delete')}
              data-testid={`delete-user-${row.original.id}`}
              disabled={isSelf}
              onClick={() => setDeleteId(row.original.id)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  // No tab available -> genuinely nothing to show here.
  if (!canManageAccounts && !canManageLoginSecurityTab && !canManageRolesTab) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h1 className="text-2xl font-bold">403</h1>
          <p className="text-muted-foreground">{t('common.accessDenied')}</p>
        </div>
      </div>
    );
  }

  // Task 9: batch bar label/description per action (spec §4.2 F6 — whole-batch
  // preflight; batch-disable is confirmed the same way a single disable is,
  // since it revokes sessions the same way).
  const batchLabels: Record<BulkUsersAction, { title: string; description: string }> = {
    enable: { title: t('users.batchEnableTitle'), description: t('users.batchEnableDescription', { count: selectedIds.size }) },
    disable: { title: t('users.batchDisableTitle'), description: t('users.batchDisableDescription', { count: selectedIds.size }) },
    delete: { title: t('users.batchDeleteTitle'), description: t('users.batchDeleteDescription', { count: selectedIds.size }) },
  };

  // Tabs are gated INDIVIDUALLY. A tenant admin holds manage_login_security AND
  // (Task 9) their own tenant-scoped account capability via /tenant-users, so
  // canManageAccounts now covers both the true platform super admin and a
  // tenant admin — the data source itself is switched by isTenantView above.
  const accountsTab = (
    <>
      {isLoading ? (
        <PageSurface>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </PageSurface>
      ) : (
        <PageSurface>
          {/* GT: 对齐原型工具条——左侧搜索框，右侧（ml-auto）为「筛选 / 新建」按钮组。 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="user-search"
                placeholder={t('users.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
            {tenantFilter !== null && !Number.isNaN(tenantFilter) && (
              <Badge variant="secondary" className="gap-2" data-testid="user-tenant-filter">
                {t('users.filteredByTenant', { id: tenantFilter })}
                <Link href="/users" className="text-primary hover:underline">
                  {t('users.clearTenantFilter')}
                </Link>
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-2">
              {/* 原型的「筛选」按钮 aria-label 为「重置筛选」——这里落地为清空搜索
                  与租户深链过滤的重置动作（无破坏性）。 */}
              <Button
                variant="outline"
                aria-label={t('users.filterButton')}
                data-testid="user-filter-reset"
                onClick={() => {
                  setSearch('');
                  if (tenantFilter !== null && !Number.isNaN(tenantFilter)) router.push('/users');
                }}
              >
                <Filter className="h-4 w-4" />
                {t('users.filterButton')}
              </Button>
              <Button data-testid="user-new" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4" />
                {t('users.newButton')}
              </Button>
            </div>
          </div>

          {/* Task 9: batch bar, shown once any row is selected. */}
          {selectedIds.size > 0 && (
            <div
              data-testid="batch-bar"
              className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
            >
              <span>{t('users.batchSelected', { count: selectedIds.size })}</span>
              <div className="ml-auto flex gap-2">
                <Button data-testid="batch-enable" variant="outline" size="sm" onClick={() => setBatchAction('enable')}>
                  {t('users.enable')}
                </Button>
                <Button data-testid="batch-disable" variant="outline" size="sm" onClick={() => setBatchAction('disable')}>
                  {t('users.disable')}
                </Button>
                <Button
                  data-testid="batch-delete"
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setBatchAction('delete')}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          )}

          <DataTable
            columns={columns}
            data={filteredUsers}
            rowTestId={(user) => `user-row-${user.id}`}
          />
        </PageSurface>
      )}

      {/* GT: 对齐原型 layer-1——新建/编辑账号改用右侧抽屉（Sheet），表单分为
          「基础信息」与「角色与状态」两张分组卡片；抽屉标题固定为「管理员配置」。
          data-testid 沿用 create-user-dialog（既有防回归单测按此定位）。 */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent
          data-testid="create-user-dialog"
          className="flex w-full flex-col p-0 sm:max-w-xl"
        >
          <SheetHeader className="gap-1.5 border-b border-border px-6 pt-6 pb-3">
            <SheetTitle>{t('users.drawerTitle')}</SheetTitle>
            <SheetDescription>
              {editingUser ? t('users.drawerDescriptionEdit') : t('users.drawerDescriptionCreate')}
            </SheetDescription>
          </SheetHeader>

          <form
            onSubmit={form.handleSubmit(handleSubmit, onInvalidSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {/* 分组卡片一：基础信息 */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h4 className="text-sm font-medium text-foreground">{t('users.basicInfo')}</h4>
                <div className="space-y-1.5">
                  <Label>{t('users.accountUsername')}<span className="ml-0.5 text-destructive">*</span></Label>
                  {/* GT-12313：用户名是账号唯一标识，编辑时一律不可改（原型
                      "账号不可修改，密码留空表示不修改"），不再区分平台/租户视角。 */}
                  <Input {...form.register('username')} disabled={!!editingUser} />
                  {fieldError('username')}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('users.name')}{!editingUser && <span className="ml-0.5 text-destructive">*</span>}</Label>
                  <Input {...form.register('name')} />
                  {fieldError('name')}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('users.phone')}{!editingUser && <span className="ml-0.5 text-destructive">*</span>}</Label>
                  <Input data-testid="new-admin-phone" {...form.register('phone')} />
                  {fieldError('phone')}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('users.email')}{!editingUser && <span className="ml-0.5 text-destructive">*</span>}</Label>
                  <Input type="email" {...form.register('email')} />
                  {fieldError('email')}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {editingUser ? t('common.password') : t('users.initialPassword')}
                    {!editingUser && <span className="ml-0.5 text-destructive">*</span>}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input type="password" {...form.register('password')} placeholder={editingUser ? t('users.leaveBlank') : ''} className="flex-1" />
                    {!editingUser && (
                      <Button
                        type="button"
                        variant="outline"
                        data-testid="user-password-generate"
                        onClick={() => form.setValue('password', generatePassword(), { shouldValidate: true })}
                      >
                        {t('users.resetPassword.generate')}
                      </Button>
                    )}
                  </div>
                  {fieldError('password')}
                </div>
              </div>

              {/* 分组卡片二：角色与状态 */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h4 className="text-sm font-medium text-foreground">{t('users.roleAndStatus')}</h4>
                <div className="space-y-1.5">
                  <Label>{t('users.role')}<span className="ml-0.5 text-destructive">*</span></Label>
                  <Select
                    value={form.watch('role_id') !== undefined ? String(form.watch('role_id')) : ''}
                    onValueChange={(v) => form.setValue('role_id', Number(v))}
                  >
                    <SelectTrigger data-testid="new-admin-role-select">
                      <SelectValue>{selectedRole?.name ?? t('users.selectRolePlaceholder')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldError('role_id')}
                </div>
                {!isTenantView && selectedRole?.scope === 'tenant' && (
                  <div className="space-y-1.5">
                    <Label>{t('users.tenant')}</Label>
                    <Input type="number" {...form.register('tenant_id', { valueAsNumber: true })} />
                  </div>
                )}
                {/* 账号状态：新建与编辑均可自由选择。编辑时若改为「停用」，提交会走
                    与行操作相同的 setUserStatus/setTenantUserStatus 接口——该接口在
                    停用时仍会终止该账号的在线会话，安全语义不变。 */}
                <div className="space-y-1.5">
                  <Label>{t('users.accountStatus')}</Label>
                  <Select
                    value={form.watch('status') ?? 'normal'}
                    onValueChange={(v) => form.setValue('status', v as UserStatus)}
                  >
                    <SelectTrigger data-testid="new-admin-status-select">
                      <SelectValue>
                        {form.watch('status') === 'disabled'
                          ? t('users.statusDisabledOption')
                          : t('users.statusEnabledOption')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">{t('users.statusEnabledOption')}</SelectItem>
                      <SelectItem value="disabled">{t('users.statusDisabledOption')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* GT-12318：所有账号首次登录一律强制改密（临时密码安全契约），
                  不再提供"是否强制首登改密"开关——平台与租户视角统一显示固定
                  提示。新账号 must_change_password 由服务端默认 true 保证，前端
                  不再下发该字段（testid 沿用 tenant-must-change-notice）。 */}
              <p className="pt-1 text-xs text-muted-foreground" data-testid="tenant-must-change-notice">
                {t('users.tenantMustChangeNotice')}
              </p>
            </div>

            {/* 页脚：对齐原型「确定 / 取消」顺序（确定在前）。 */}
            <div className="flex items-center gap-2 border-t border-border px-6 py-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.save')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={t('users.deleteUser')}
        description={t('common.confirmDelete')}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        variant="destructive"
      />

      {/* Task 9: disable confirms (revokes every live session); enable fires
          immediately from the row action above, no dialog needed. */}
      <ConfirmDialog
        open={disableId !== null}
        onOpenChange={(open) => !open && setDisableId(null)}
        title={t('users.disableUserTitle')}
        description={t('users.confirmDisable')}
        onConfirm={() => disableId !== null && statusMutation.mutate({ id: disableId, status: 'disabled' })}
        variant="destructive"
      />

      <ConfirmDialog
        open={forceOfflineId !== null}
        onOpenChange={(open) => !open && setForceOfflineId(null)}
        title={t('users.forceOfflineTitle')}
        description={t('users.confirmForceOffline')}
        onConfirm={() => forceOfflineId !== null && forceOfflineMutation.mutate(forceOfflineId)}
        variant="destructive"
      />

      {/* GT-12314：独立重置密码对话框。提交按视角走对应端点；服务端按目标
          账号作用域的密码策略校验，并自动把 must_change_password 置回 true。 */}
      <ResetPasswordDialog
        open={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
        username={resetTarget?.username ?? ''}
        onSubmit={async (password) => {
          if (!resetTarget) return;
          if (isTenantView) {
            await updateTenantUser(resetTarget.id, { password }, apiRequest);
          } else {
            await updateUser(resetTarget.id, { password }, apiRequest);
          }
          queryClient.invalidateQueries({ queryKey: [usersQueryKey] });
        }}
      />

      {/* Task 9: batch enable/disable/delete, always confirmed. */}
      <ConfirmDialog
        open={batchAction !== null}
        onOpenChange={(open) => !open && setBatchAction(null)}
        title={batchAction ? batchLabels[batchAction].title : ''}
        description={batchAction ? batchLabels[batchAction].description : ''}
        onConfirm={() => batchAction && bulkMutation.mutate({ action: batchAction, ids: Array.from(selectedIds) })}
        variant="destructive"
      />
    </>
  );

  const tabs: { value: string; label: string; content: React.ReactNode }[] = [];
  if (canManageAccounts) {
    tabs.push({ value: 'accounts', label: t('users.tabs.accounts'), content: accountsTab });
  }
  // Plan C Task 7: 角色权限 tab. scope reuses isTenantView (defined above for
  // the account tab) — a true platform admin (no tenant impersonated)
  // manages the platform role matrix, everyone else (tenant_admin, or a
  // system_admin impersonating a tenant) manages their own tenant's.
  // GT-12312：页签顺序对齐原型——管理员账号 / 角色权限 / 登录安全。
  if (canManageRolesTab) {
    tabs.push({
      value: 'roles',
      label: t('users.tabs.roles'),
      content: <RolePermissionTab scope={isTenantView ? 'tenant' : 'platform'} />,
    });
  }
  if (canManageLoginSecurityTab) {
    tabs.push({
      value: 'login-security',
      label: t('users.tabs.loginSecurity'),
      content: <LoginSecurityTab />,
    });
  }

  return (
    // GT: 页面底色与「邮件安全总览」页对齐——沿用其 PageShell 的底色处理
    // （浅灰 #F8F9FB + 32px 外扩阴影抵消父容器 padding，让灰底铺满内容区；
    // 深色模式回落到 --background）。避免各页底色逐页漂移。
    <PageShell className="min-h-full bg-[#F8F9FB] shadow-[0_0_0_32px_#F8F9FB] dark:bg-background dark:shadow-[0_0_0_32px_var(--background)]">
      {/* GT: 对齐原型页面框架——页头只保留标题 + 副标题（无 eyebrow），
          「新建」按钮下沉到账号页签的工具条右侧（见 accountsTab）。 */}
      <PageHeader
        title={t('users.title')}
        description={t('users.subtitle')}
      />

      <Tabs defaultValue={tabs[0]?.value} className="w-full space-y-4">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} data-testid={`users-tab-${tab.value}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-0">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  );
}
