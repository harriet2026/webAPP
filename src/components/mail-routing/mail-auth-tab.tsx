'use client';

// 发信认证 Tab —— html_spec 对齐重构（Task 8，design/implement/spec/2026-07-28-mail-
// routing-html-spec-alignment-design.md，doc/html-spec/admin-forwarding/index.html §2.6 +
// layer-8-auth-drawer.html）。行为契约见 task-8-brief.md。
//
// 从「Dialog 表单 + sslEnabled 单布尔 + 逗号分隔域名文本」重构为 demo 的表格 + Sheet 抽屉形
// 态：TLS 关闭/优先/强制三档（auth-tls-mode.ts 与真实契约 ssl_enabled/protocol_config.
// starttls 双布尔互相换算）+ 域名多选 Popover（All 与具体域名互斥）+ 协议/TLS 联动默认端
// 口 + 场景冲突前端预校验。
//
// 两处刻意偏离 demo（DEV-1/DEV-2，task-8-brief.md）：
//   - 优先级 hint 用本项目统一语义「数值越大越优先」，不用 demo 的「数字越小优先级越高」。
//   - 列表保留 priority 列；抽屉保留 LDAP bindDN（必填）与 SMTP authMech 协议参数区块 ——
//     这两个是真实后端必需字段，demo 没有对应 UI，隐藏会导致无法保存合法配置。
//
// 测试连接维持原有独立 Dialog 形态（用户名/密码可选 + 三态结果展示），不采用 layer-8 抽屉
// 内联「测试连接」按钮那套（brief 明确要求保留现状）。

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Loader2, Zap, X, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar } from '@/components/mail-routing/shared/list-toolbar';
import type { AuthTlsMode } from '@/components/mail-routing/mr-types';
import { toTlsMode, fromTlsMode, defaultPort, type AuthProtocol } from './auth-tls-mode';

import { useScopedApiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/client';
import { listTenantDomains } from '@/lib/api/mail-routing';
import {
  listMailAuthConfigs,
  createMailAuthConfig,
  updateMailAuthConfig,
  deleteMailAuthConfig,
  testMailAuthConnection,
} from '@/lib/api/mail-auth';
import type {
  MailAuthConfig,
  MailAuthConfigPayload,
  MailAuthDomainScope,
} from '@/lib/api/mail-auth';
import { cn, formatDate } from '@/lib/utils';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

// ─── Constants ────────────────────────────────────────────────────────────────

/** 抽屉场景勾选顺序照 demo：用户空间认证 / SMTP 发信认证 / 邮件同步代理。 */
const ALL_SCENES = ['userspace', 'smtpsend', 'mailsync'] as const;

const ALL_PROTOCOLS: AuthProtocol[] = ['smtp', 'ldap', 'pop3', 'imap'];

// ─── Filter state (筛选弹层，html_spec §2.2 + §3.13) ─────────────────────────

interface Filters {
  /** 'all' 或收信域管理已验证租户域名清单里的具体域名。 */
  domain: string;
  protocol: 'all' | AuthProtocol;
  scene: 'all' | (typeof ALL_SCENES)[number];
}

const EMPTY_FILTERS: Filters = { domain: 'all', protocol: 'all', scene: 'all' };

// ─── Draft state ──────────────────────────────────────────────────────────────

interface AuthDraft {
  priority: number;
  scopeAll: boolean;
  domains: string[];
  protocol: AuthProtocol;
  serverHost: string;
  serverPort: number;
  tlsMode: AuthTlsMode;
  verifyCert: boolean;
  authTimeout: number;
  authMech: string;
  bindDnTemplate: string;
  scenes: string[];
  isActive: boolean;
}

function defaultDraft(): AuthDraft {
  // 新建态默认 LDAP + 优先 TLS + 端口 636（layer-8a 实测）。
  const protocol: AuthProtocol = 'ldap';
  const tlsMode: AuthTlsMode = 'prefer';
  return {
    priority: 100,
    scopeAll: false,
    domains: [],
    protocol,
    serverHost: '',
    serverPort: defaultPort(protocol, tlsMode),
    tlsMode,
    verifyCert: true,
    authTimeout: 20,
    authMech: 'PLAIN',
    bindDnTemplate: '',
    scenes: [],
    isActive: true,
  };
}

function domainScopeOf(c: MailAuthConfig): { all: boolean; domains: string[] } {
  const ds = c.domain_scope as { all?: true; domains?: string[] } | undefined;
  return { all: !!ds?.all, domains: ds?.domains ?? [] };
}

function configToDraft(c: MailAuthConfig): AuthDraft {
  const pc = c.protocol_config ?? {};
  const ds = domainScopeOf(c);
  return {
    priority: c.priority,
    scopeAll: ds.all,
    domains: [...ds.domains],
    protocol: (c.protocol as AuthProtocol) || 'smtp',
    serverHost: c.server_host,
    serverPort: c.server_port,
    tlsMode: toTlsMode(c.ssl_enabled, !!pc.starttls),
    verifyCert: !pc.skip_verify,
    authTimeout: c.auth_timeout,
    authMech: (pc.auth_mech as string) || 'PLAIN',
    bindDnTemplate: (pc.bind_dn_template as string) || '',
    scenes: c.scenes ? [...c.scenes] : [],
    isActive: c.is_active,
  };
}

function draftToPayload(d: AuthDraft): MailAuthConfigPayload {
  const domainScope: MailAuthDomainScope = d.scopeAll ? { all: true } : { domains: d.domains };
  const { ssl_enabled, starttls } = fromTlsMode(d.tlsMode);
  const protocol_config: Record<string, unknown> = { starttls, skip_verify: !d.verifyCert };
  if (d.protocol === 'smtp') protocol_config.auth_mech = d.authMech || 'PLAIN';
  if (d.protocol === 'ldap') protocol_config.bind_dn_template = d.bindDnTemplate.trim();

  return {
    priority: d.priority,
    domain_scope: domainScope,
    protocol: d.protocol,
    server_host: d.serverHost.trim(),
    server_port: d.serverPort,
    ssl_enabled,
    auth_timeout: d.authTimeout,
    protocol_config,
    scenes: d.scenes,
    is_active: d.isActive,
  };
}

/** All 与任意域名互斥地"覆盖"一切；否则按具体域名交集判定。 */
function domainsOverlap(
  a: { all: boolean; domains: string[] },
  b: { all: boolean; domains: string[] },
): boolean {
  if (a.all || b.all) return true;
  return a.domains.some((d) => b.domains.includes(d));
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface MailAuthTabProps {
  tenantId: number;
  /** When set (auth-log deep-link `?config=<id>`), highlight that config row. */
  highlightConfigId?: number;
}

export function MailAuthTab({ tenantId, highlightConfigId }: MailAuthTabProps) {
  const t = useTranslations('mailRouting.auth');
  const apiErrorMessage = useApiErrorMessage();
  const ts = useTranslations('mailRouting.shared');
  const tc = useTranslations('common');
  const { apiRequest } = useScopedApiRequest(tenantId);
  const queryClient = useQueryClient();

  const queryKey = ['mail-auth-configs', tenantId];
  const { data: configs = [], isLoading } = useQuery<MailAuthConfig[]>({
    queryKey,
    queryFn: () => listMailAuthConfigs(apiRequest),
  });

  // 域名多选弹层的选项源 = 收信域管理已验证租户域名（html_spec 8b 实测："选项源为收信域
  // 管理的域名清单"）。Mock 下 = 5 个 fixture 域。
  const { data: domains = [] } = useQuery({
    queryKey: ['mail-auth-domains', tenantId],
    queryFn: () => listTenantDomains(tenantId, apiRequest),
  });
  const verifiedDomains = domains.filter((d) => d.verify_status === 'verified' && d.is_active);

  const [search, setSearch] = useState('');
  // 筛选弹层三项（html_spec §2.2 + §3.13 实测：域名/认证协议/场景，均为 Select，'all' 表示不
  // 限定该维度——final review finding 2，此前发信认证 Tab 只有搜索框，没有落地这层筛选）。
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });

  const filteredConfigs = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return configs.filter((c) => {
      const ds = domainScopeOf(c);
      if (kw) {
        const domainText = ds.all ? t('domainScopeAllLabel') : ds.domains.join('、');
        const matchesKw = c.server_host.toLowerCase().includes(kw) || domainText.toLowerCase().includes(kw);
        if (!matchesKw) return false;
      }
      // 域名筛选：配置的适用域名含「全部域名」时对任何具体域名筛选都命中（与
      // domainsOverlap 同一套"All 覆盖一切"语义），否则要求筛选域名在配置的具体域名列表里。
      if (filters.domain !== 'all' && !ds.all && !ds.domains.includes(filters.domain)) return false;
      if (filters.protocol !== 'all' && c.protocol !== filters.protocol) return false;
      if (filters.scene !== 'all' && !(c.scenes ?? []).includes(filters.scene)) return false;
      return true;
    });
  }, [configs, search, filters, t]);

  const filterCount =
    (filters.domain !== 'all' ? 1 : 0) + (filters.protocol !== 'all' ? 1 : 0) + (filters.scene !== 'all' ? 1 : 0);
  const resetFilters = () => {
    setSearch('');
    setFilters({ ...EMPTY_FILTERS });
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<AuthDraft>(defaultDraft());
  const [domainPickerOpen, setDomainPickerOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MailAuthConfig | null>(null);

  const [testTarget, setTestTarget] = useState<MailAuthConfig | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testUsername, setTestUsername] = useState('');
  const [testPassword, setTestPassword] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency_ms: number } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  // ─── Drawer helpers ───────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setDraft(defaultDraft());
    setDrawerOpen(true);
  };

  const openEdit = (cfg: MailAuthConfig) => {
    setEditingId(cfg.id);
    setDraft(configToDraft(cfg));
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setDomainPickerOpen(false);
  };

  function handleProtocolChange(proto: AuthProtocol) {
    setDraft((d) => ({ ...d, protocol: proto, serverPort: defaultPort(proto, d.tlsMode) }));
  }

  function handleTlsModeChange(mode: AuthTlsMode) {
    // 切换 TLS 档不清空证书校验的既有值——off 只是禁用控件（保留原值），
    // 与非 off 恢复时的显示状态一致（layer-8c off 编辑样本：checked+disabled）。
    setDraft((d) => ({ ...d, tlsMode: mode, serverPort: defaultPort(d.protocol, mode) }));
  }

  function setScopeAll(checked: boolean) {
    setDraft((d) => ({ ...d, scopeAll: checked, domains: checked ? [] : d.domains }));
  }

  function toggleDomain(domain: string) {
    setDraft((d) => {
      if (d.scopeAll) return d;
      const has = d.domains.includes(domain);
      return { ...d, domains: has ? d.domains.filter((x) => x !== domain) : [...d.domains, domain] };
    });
  }

  function removeDomain(domain: string) {
    setDraft((d) => ({ ...d, domains: d.domains.filter((x) => x !== domain) }));
  }

  function toggleScene(scene: string) {
    setDraft((d) => ({
      ...d,
      scenes: d.scenes.includes(scene) ? d.scenes.filter((s) => s !== scene) : [...d.scenes, scene],
    }));
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  const domainErr = !draft.scopeAll && draft.domains.length === 0 ? t('fields.domainScopeRequired') : '';
  const hostErr = !draft.serverHost.trim() ? t('fields.serverHostRequired') : '';
  const portErr =
    !Number.isInteger(draft.serverPort) || draft.serverPort < 1 || draft.serverPort > 65535
      ? t('fields.portRange')
      : '';
  const timeoutErr =
    !Number.isInteger(draft.authTimeout) || draft.authTimeout < 1 || draft.authTimeout > 300
      ? t('fields.authTimeoutRange')
      : '';
  const scenesErr = draft.scenes.length === 0 ? t('fields.scenesRequired') : '';
  const bindDnErr =
    draft.protocol === 'ldap' && !draft.bindDnTemplate.trim() ? t('fields.bindDnTemplateRequired') : '';

  // 同域名 + 同场景冲突前端预校验（后端 409 仍权威，这里只是提前拦截 + 友好提示）。
  const conflictConfig = useMemo(() => {
    if (draft.scenes.length === 0) return null;
    const draftScope = { all: draft.scopeAll, domains: draft.domains };
    return (
      configs.find((c) => {
        if (editingId != null && c.id === editingId) return false;
        if (!domainsOverlap(draftScope, domainScopeOf(c))) return false;
        return (c.scenes ?? []).some((s) => draft.scenes.includes(s));
      }) ?? null
    );
  }, [configs, draft.scopeAll, draft.domains, draft.scenes, editingId]);
  const conflictErr = conflictConfig ? t('fields.sceneConflict', { protocol: conflictConfig.protocol.toUpperCase() }) : '';

  const hasError = !!(domainErr || hostErr || portErr || timeoutErr || scenesErr || bindDnErr || conflictErr);

  // ─── Save / delete mutations ──────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = draftToPayload(draft);
      if (editingId != null) return updateMailAuthConfig(editingId, payload, apiRequest);
      return createMailAuthConfig(payload, apiRequest);
    },
    onSuccess: () => {
      toast.success(editingId != null ? t('toasts.updated') : t('toasts.created'));
      closeDrawer();
      invalidate();
    },
    onError: (e: Error) => {
      // 409 冲突 → 透传后端 message（域名+场景冲突的权威判定）。
      if (e instanceof ApiError && e.status === 409) {
        toast.error(apiErrorMessage(e));
      } else {
        toast.error(apiErrorMessage(e));
      }
    },
  });

  function handleSave() {
    if (hasError) {
      toast.error(t('toasts.saveError'));
      return;
    }
    saveMutation.mutate();
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMailAuthConfig(id, apiRequest),
    onSuccess: () => {
      toast.success(t('toasts.deleted'));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(apiErrorMessage(e)),
  });

  // ─── Test connection (独立 Dialog 形态维持不变) ───────────────────────────

  function openTest(cfg: MailAuthConfig) {
    setTestTarget(cfg);
    setTestUsername('');
    setTestPassword('');
    setTestResult(null);
    setTestOpen(true);
  }

  async function runTest() {
    if (!testTarget) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const [result] = await Promise.all([
        testMailAuthConnection(
          {
            protocol: testTarget.protocol,
            server_host: testTarget.server_host,
            server_port: testTarget.server_port,
            ssl_enabled: testTarget.ssl_enabled,
            auth_timeout: testTarget.auth_timeout,
            protocol_config: testTarget.protocol_config,
            ...(testUsername ? { username: testUsername, password: testPassword } : {}),
          },
          apiRequest,
        ),
        // 测试连接 loading 最少展示 ~0.9s（mock 端同步返回，靠组件侧兜底展示态）。
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : String(e), latency_ms: 0 });
    } finally {
      setTestLoading(false);
    }
  }

  // ─── Table cell helpers ───────────────────────────────────────────────────

  function domainScopeLabel(c: MailAuthConfig): string {
    const ds = domainScopeOf(c);
    return ds.all ? t('domainScopeAllLabel') : ds.domains.join('、') || '—';
  }

  const domainTriggerText = draft.scopeAll
    ? t('fields.domainScopeAllOption')
    : draft.domains.length > 0
      ? t('fields.domainScopeSelectedCount', { count: draft.domains.length })
      : t('fields.domainScopePlaceholder');
  const domainTriggerEmpty = !draft.scopeAll && draft.domains.length === 0;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5" data-testid="mr-auth-root">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('searchPlaceholder')}
        onReset={resetFilters}
        filterCount={filterCount}
        filterContent={
          <>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('columns.domainScope')}</span>
              <Select value={filters.domain} onValueChange={(v) => setFilters((f) => ({ ...f, domain: v ?? 'all' }))}>
                <SelectTrigger className="h-9" data-testid="mr-auth-filter-domain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.domainAll')}</SelectItem>
                  {verifiedDomains.map((d) => (
                    <SelectItem key={d.id} value={d.domain}>
                      {d.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('columns.protocol')}</span>
              <Select
                value={filters.protocol}
                onValueChange={(v) => setFilters((f) => ({ ...f, protocol: (v as Filters['protocol']) ?? 'all' }))}
              >
                <SelectTrigger className="h-9" data-testid="mr-auth-filter-protocol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.protocolAll')}</SelectItem>
                  {ALL_PROTOCOLS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`protocols.${p}` as `protocols.${string}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('columns.scenes')}</span>
              <Select value={filters.scene} onValueChange={(v) => setFilters((f) => ({ ...f, scene: (v as Filters['scene']) ?? 'all' }))}>
                <SelectTrigger className="h-9" data-testid="mr-auth-filter-scene">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.sceneAll')}</SelectItem>
                  {ALL_SCENES.map((scene) => (
                    <SelectItem key={scene} value={scene}>
                      {t(`scenes.${scene}` as `scenes.${string}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={openCreate} data-testid="mr-auth-create">
            <Plus className="h-4 w-4" />
            {ts('create')}
          </Button>
        }
        testIdPrefix="mr-auth"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredConfigs.length === 0 ? (
        <div data-testid="mr-auth-empty">
          <EmptyState
            title={ts('emptyText')}
            action={
              <Button variant="outline" size="sm" onClick={openCreate}>
                {ts('addNow')}
              </Button>
            }
          />
        </div>
      ) : (
        <Table data-testid="mr-auth-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.priority')}</TableHead>
              <TableHead>{t('columns.domainScope')}</TableHead>
              <TableHead>{t('columns.protocol')}</TableHead>
              <TableHead>{t('columns.server')}</TableHead>
              <TableHead>{t('columns.port')}</TableHead>
              <TableHead>{t('columns.authTimeout')}</TableHead>
              <TableHead>{t('columns.scenes')}</TableHead>
              <TableHead>{t('columns.updatedAt')}</TableHead>
              <TableHead className="w-[220px]">{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredConfigs.map((c) => {
              const pc = c.protocol_config ?? {};
              const mode = toTlsMode(c.ssl_enabled, !!pc.starttls);
              const verify = !pc.skip_verify;
              return (
                <TableRow
                  key={c.id}
                  data-testid={`mr-auth-row-${c.id}`}
                  className={highlightConfigId && c.id === highlightConfigId ? 'bg-amber-100 dark:bg-amber-950/30' : undefined}
                >
                  <TableCell>{c.priority}</TableCell>
                  <TableCell className="max-w-[220px] font-medium">
                    <Tooltip>
                      <TooltipTrigger render={<span className="block truncate">{domainScopeLabel(c)}</span>} />
                      <TooltipContent>{domainScopeLabel(c)}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {c.protocol.toUpperCase()}
                      {mode !== 'off' && (
                        <>
                          <Badge
                            variant="outline"
                            className="border-green-200 bg-green-50 font-normal text-green-600 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                          >
                            {mode === 'force' ? t('tlsBadges.force') : t('tlsBadges.prefer')}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              verify
                                ? 'border-blue-200 bg-blue-50 font-normal text-blue-600 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300'
                                : 'border-amber-200 bg-amber-50 font-normal text-amber-600 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
                            }
                          >
                            {verify ? t('tlsBadges.verify') : t('tlsBadges.noVerify')}
                          </Badge>
                        </>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{c.server_host}</TableCell>
                  <TableCell>{c.server_port}</TableCell>
                  <TableCell>{c.auth_timeout}s</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(c.scenes ?? []).map((s) => (
                        <Badge key={s} variant="secondary" className="font-normal">
                          {t(`scenes.${s}` as `scenes.${string}`)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(c.updated_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-muted-foreground"
                        onClick={() => openTest(c)}
                        data-testid={`mr-auth-test-${c.id}`}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        {t('testConnectionButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-blue-600"
                        onClick={() => openEdit(c)}
                        data-testid={`mr-auth-edit-${c.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t('editButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-destructive"
                        onClick={() => setDeleteTarget(c)}
                        data-testid={`mr-auth-delete-${c.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('deleteButton')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* ── Create / Edit 抽屉 ── */}
      <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent side="right" className="w-full sm:max-w-xl" data-testid="mr-auth-drawer">
          <SheetHeader>
            <SheetTitle>{editingId != null ? t('drawerTitleEdit') : t('drawerTitleNew')}</SheetTitle>
            <SheetDescription>{t('drawerDescription')}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {/* 基础配置 */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionBasic')}</h4>
              <div className="space-y-1.5">
                <Label>{t('fields.priority')}</Label>
                <Input
                  type="number"
                  className="w-40"
                  value={draft.priority}
                  onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) || 0 }))}
                  data-testid="mr-auth-priority-input"
                />
                <p className="text-xs text-muted-foreground">{t('fields.priorityHint')}</p>
              </div>

              <div className="space-y-1.5">
                <Label>
                  {t('fields.domainScope')}
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Popover open={domainPickerOpen} onOpenChange={setDomainPickerOpen}>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-4 py-2 text-sm font-normal shadow-xs hover:bg-accent"
                        data-testid="mr-auth-domain-trigger"
                      >
                        <span className={domainTriggerEmpty ? 'text-gray-400' : undefined}>{domainTriggerText}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </button>
                    }
                  />
                  <PopoverContent
                    align="start"
                    className="w-(--anchor-width) min-w-56 p-1.5"
                    data-testid="mr-auth-domain-popover"
                  >
                    <div className="max-h-56 space-y-0.5 overflow-y-auto">
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-900/40">
                        <Checkbox
                          checked={draft.scopeAll}
                          onCheckedChange={(v) => setScopeAll(Boolean(v))}
                          data-testid="mr-auth-domain-option-all"
                        />
                        {t('fields.domainScopeAllOption')}
                      </label>
                      {verifiedDomains.map((d) => (
                        <label
                          key={d.id}
                          className={cn(
                            'flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-900/40',
                            draft.scopeAll ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                          )}
                        >
                          <Checkbox
                            checked={draft.domains.includes(d.domain)}
                            disabled={draft.scopeAll}
                            onCheckedChange={() => toggleDomain(d.domain)}
                            data-testid={`mr-auth-domain-option-${d.domain}`}
                          />
                          {d.domain}
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {(draft.scopeAll || draft.domains.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {draft.scopeAll ? (
                      <Badge variant="secondary" className="gap-1 pr-1 font-normal" data-testid="mr-auth-domain-badge-all">
                        {t('fields.domainScopeAllBadge')}
                        <button
                          type="button"
                          aria-label={ts('removeTag', { value: t('fields.domainScopeAllBadge') })}
                          onClick={() => setScopeAll(false)}
                          className="rounded-sm p-0.5 hover:bg-gray-300/60 dark:hover:bg-gray-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : (
                      draft.domains.map((dom) => (
                        <Badge key={dom} variant="secondary" className="gap-1 pr-1 font-normal" data-testid={`mr-auth-domain-badge-${dom}`}>
                          {dom}
                          <button
                            type="button"
                            aria-label={ts('removeTag', { value: dom })}
                            onClick={() => removeDomain(dom)}
                            className="rounded-sm p-0.5 hover:bg-gray-300/60 dark:hover:bg-gray-700"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                )}
                {domainErr ? (
                  <p className="text-xs text-destructive" data-testid="mr-auth-domain-error">
                    {domainErr}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('fields.domainScopeHint')}</p>
                )}
              </div>
            </div>

            {/* 认证服务器 */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionServer')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    {t('fields.protocol')}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Select value={draft.protocol} onValueChange={(v) => v && handleProtocolChange(v as AuthProtocol)}>
                    <SelectTrigger data-testid="mr-auth-protocol-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_PROTOCOLS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {t(`protocols.${p}` as `protocols.${string}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t('fields.serverPort')}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    value={draft.serverPort}
                    onChange={(e) => setDraft((d) => ({ ...d, serverPort: Number(e.target.value) || 0 }))}
                    data-testid="mr-auth-port-input"
                  />
                  <p className="text-xs text-muted-foreground">{t('fields.serverPortHint')}</p>
                  {portErr && (
                    <p className="text-xs text-destructive" data-testid="mr-auth-port-error">
                      {portErr}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>
                  {t('fields.serverHost')}
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  value={draft.serverHost}
                  onChange={(e) => setDraft((d) => ({ ...d, serverHost: e.target.value }))}
                  placeholder={t('fields.serverHostPlaceholder')}
                  data-testid="mr-auth-host-input"
                />
                {hostErr && (
                  <p className="text-xs text-destructive" data-testid="mr-auth-host-error">
                    {hostErr}
                  </p>
                )}
              </div>

              {/* 协议参数区块（DEV-2，demo 之外）：真实后端必需字段，starttls/skip_verify 已被
                  下方 TLS 三档 + 校验证书吸收，不再单独暴露每协议控件。 */}
              {draft.protocol === 'ldap' && (
                <div className="space-y-1.5">
                  <Label>
                    {t('fields.bindDnTemplate')}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    value={draft.bindDnTemplate}
                    onChange={(e) => setDraft((d) => ({ ...d, bindDnTemplate: e.target.value }))}
                    placeholder="uid=%s,ou=users,dc=example,dc=com"
                    data-testid="mr-auth-binddn-input"
                  />
                  {bindDnErr && (
                    <p className="text-xs text-destructive" data-testid="mr-auth-binddn-error">
                      {bindDnErr}
                    </p>
                  )}
                </div>
              )}
              {draft.protocol === 'smtp' && (
                <div className="space-y-1.5">
                  <Label>{t('fields.authMech')}</Label>
                  <Select value={draft.authMech} onValueChange={(v) => setDraft((d) => ({ ...d, authMech: v ?? 'PLAIN' }))}>
                    <SelectTrigger data-testid="mr-auth-authmech-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLAIN">PLAIN</SelectItem>
                      <SelectItem value="LOGIN">LOGIN</SelectItem>
                      <SelectItem value="CRAM-MD5">CRAM-MD5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{t('fields.tlsMode')}</Label>
                <Select value={draft.tlsMode} onValueChange={(v) => v && handleTlsModeChange(v as AuthTlsMode)}>
                  <SelectTrigger data-testid="mr-auth-tls-mode-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">{t('fields.tlsModeOff')}</SelectItem>
                    <SelectItem value="prefer">{t('fields.tlsModePrefer')}</SelectItem>
                    <SelectItem value="force">{t('fields.tlsModeForce')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('fields.tlsModeHint')}</p>
              </div>

              <label
                className={cn(
                  'flex items-center gap-2 text-sm',
                  draft.tlsMode === 'off' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                )}
              >
                <Checkbox
                  checked={draft.verifyCert}
                  disabled={draft.tlsMode === 'off'}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, verifyCert: Boolean(v) }))}
                  data-testid="mr-auth-verify-cert-checkbox"
                />
                {t('fields.verifyCert')}
              </label>
              {draft.tlsMode === 'off' && (
                <p className="text-xs text-amber-600" data-testid="mr-auth-warn-plaintext">
                  {t('fields.warnPlaintext')}
                </p>
              )}
              {draft.tlsMode !== 'off' && !draft.verifyCert && (
                <p className="text-xs text-amber-600" data-testid="mr-auth-warn-nocert">
                  {t('fields.warnNoCertVerify')}
                </p>
              )}

              <div className="space-y-1.5">
                <Label>{t('fields.authTimeout')}</Label>
                <Input
                  type="number"
                  value={draft.authTimeout}
                  onChange={(e) => setDraft((d) => ({ ...d, authTimeout: Number(e.target.value) || 0 }))}
                  data-testid="mr-auth-timeout-input"
                />
                {timeoutErr && (
                  <p className="text-xs text-destructive" data-testid="mr-auth-timeout-error">
                    {timeoutErr}
                  </p>
                )}
              </div>
            </div>

            {/* 生效场景 */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <h4 className="text-sm font-medium">{t('sectionScenes')}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('scenesDesc')}</p>
              </div>
              <div className="space-y-1.5">
                {ALL_SCENES.map((scene) => (
                  <label
                    key={scene}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-900/40"
                  >
                    <Checkbox
                      checked={draft.scenes.includes(scene)}
                      onCheckedChange={() => toggleScene(scene)}
                      data-testid={`mr-auth-scene-${scene}`}
                    />
                    {t(`scenes.${scene}` as `scenes.${string}`)}
                  </label>
                ))}
              </div>
              {scenesErr && (
                <p className="text-xs text-destructive" data-testid="mr-auth-scenes-error">
                  {scenesErr}
                </p>
              )}
              {!scenesErr && conflictErr && (
                <p className="text-xs text-destructive" data-testid="mr-auth-conflict-error">
                  {conflictErr}
                </p>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="mr-auth-save">
              {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
            <Button variant="outline" onClick={closeDrawer} data-testid="mr-auth-cancel">
              {tc('cancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── 删除确认（静态标题，无动态名） ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="mr-auth-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="mr-auth-delete-cancel">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="mr-auth-delete-confirm"
            >
              {t('deleteConfirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 测试连接（保留独立 Dialog 形态） ── */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent data-testid="mr-auth-test-dialog">
          <DialogHeader>
            <DialogTitle>{t('testConnectionTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {testTarget?.server_host}:{testTarget?.server_port} ({testTarget?.protocol?.toUpperCase()})
            </p>
            <div className="space-y-1.5">
              <Label>{t('usernameOptional')}</Label>
              <Input
                value={testUsername}
                onChange={(e) => setTestUsername(e.target.value)}
                autoComplete="off"
                data-testid="mr-auth-test-username"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('passwordOptional')}</Label>
              <Input
                type="password"
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
                autoComplete="off"
                data-testid="mr-auth-test-password"
              />
            </div>
            {testResult && (
              <div
                className={`rounded-md p-3 text-sm ${
                  testResult.success
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                }`}
                data-testid="mr-auth-test-result"
              >
                <p className="font-medium">{testResult.success ? t('testSuccess') : t('testFailed')}</p>
                {testResult.message && <p className="mt-1">{testResult.message}</p>}
                {testResult.latency_ms > 0 && <p className="mt-1 text-xs opacity-80">{testResult.latency_ms}ms</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTestOpen(false)} data-testid="mr-auth-test-cancel">
              {tc('cancel')}
            </Button>
            <Button type="button" onClick={runTest} disabled={testLoading} data-testid="mr-auth-test-run">
              {testLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {testLoading ? t('testing') : t('testConnectionButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
