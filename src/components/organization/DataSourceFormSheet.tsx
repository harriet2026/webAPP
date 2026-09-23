'use client';

// 新增/编辑数据源抽屉 —— 逐字段对齐 demo data-source-tab.tsx 的 Sheet：
// 三个 SectionCard（基础信息 / 连接参数 / 同步策略）+ 4 种同步方式表单联动 +
// 实时行内校验 + 测试连接状态机 + 「确定」点击式闸门（toast 阻断，不禁用按钮）。
// 所有数据源必须验证实际待保存配置；LDAP 编辑保留未修改映射及已存密钥。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { isMockEnabled } from '@/lib/mock/storage';
import { useScopedApiRequest } from '@/lib/api/client';
import { useProductForm } from '@/contexts/product-form-context';
import {
  useContactSourceMutations,
  testContactSourceNew,
  testContactSource,
} from './api';
import { CSVImportFields } from './CSVImportFields';
import { Field, SectionCard, TestResultTag, type TestState } from './shared';
import type { ContactSource, SourceType } from './types';

const DEFAULT_USER_FILTER = '(objectClass=person)';
const DEFAULT_ATTR_MAP = { email: 'mail', display_name: 'cn', dept: 'department', job_title: 'title' };
const DEFAULT_CRON = '0 0 * * *';

interface DraftState {
  name: string;
  syncType: SourceType;
  priority: string;
  // ldap
  server: string;
  port: string;
  useTls: boolean;
  skipVerify: boolean;
  allowLegacyTls: boolean;
  userFilter: string;
  attrMap: Record<string, string>;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
  // coremail / neteml
  apiUrl: string;
  account: string;
  accountPassword: string;
  corpDomain: string;
  appId: string;
  authCode: string;
  openId: string;
  // CSV 的组织层级来自部门文件；不会显示不落库的组织字段。
  csvConfig: Record<string, unknown> | null;
  csvDirty: boolean;
  autoSync: boolean;
}

const emptyDraft = (): DraftState => ({
  name: '',
  syncType: 'ldap',
  priority: '50',
  server: '',
  port: '389',
  useTls: false,
  skipVerify: false,
  allowLegacyTls: false,
  userFilter: DEFAULT_USER_FILTER,
  attrMap: DEFAULT_ATTR_MAP,
  baseDn: '',
  bindDn: '',
  bindPassword: '',
  apiUrl: '',
  account: '',
  accountPassword: '',
  corpDomain: '',
  appId: '',
  authCode: '',
  openId: '',
  csvConfig: null,
  csvDirty: false,
  autoSync: false,
});

const isUrl = (v: string) => /^https?:\/\/.+/.test(v.trim());

interface DataSourceFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ContactSource | null;
  tenantId?: number | null;
  existingNames: { id: number; name: string }[];
}

export function DataSourceFormSheet({ open, onOpenChange, editing, tenantId, existingNames }: DataSourceFormSheetProps) {
  const t = useTranslations('organizationContacts');
  const tc = useTranslations('common');
  const { switcherEnabled } = useProductForm();
  const mutations = useContactSourceMutations();
  // GT-12039：连接测试端点是租户作用域的（requireSelectedTenantID），模块级
  // apiRequest 不带 X-Tenant-ID，system_admin 测已存数据源会 400。
  const { apiRequest: scopedRequest } = useScopedApiRequest(tenantId ?? null);
  const isEdit = !!editing;

  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  const [test, setTest] = useState<TestState>('idle');
  const [testFailReason, setTestFailReason] = useState('');
  const [testToken, setTestToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const testGeneration = useRef(0);

  useEffect(() => {
    testGeneration.current++;
    if (!open) return;
    setTest('idle');
    setTestToken('');
    setTestFailReason('');
    if (editing) {
      const cfg = (editing.config || {}) as Record<string, unknown>;
      setDraft({
        name: editing.name,
        syncType: editing.source_type,
        priority: String(editing.priority ?? 50),
        server: String(cfg.server ?? ''),
        port: String(cfg.port ?? '389'),
        useTls: Boolean(cfg.use_tls),
        skipVerify: Boolean(cfg.skip_verify),
        allowLegacyTls: Boolean(cfg.allow_legacy_tls),
        userFilter: String(cfg.user_filter ?? DEFAULT_USER_FILTER),
        attrMap: { ...DEFAULT_ATTR_MAP, ...(cfg.attr_map as Record<string, string> ?? {}) },
        baseDn: String(cfg.base_dn ?? ''),
        bindDn: String(cfg.bind_dn ?? ''),
        bindPassword: '',
        apiUrl: String(cfg.server_url ?? ''),
        account: String(cfg.account ?? ''),
        accountPassword: '',
        corpDomain: String(cfg.corp_domain ?? ''),
        appId: String(cfg.app_id ?? ''),
        authCode: '',
        openId: String(cfg.open_id ?? ''),
        csvConfig: null,
        csvDirty: false,
        autoSync: editing.auto_sync_enabled,
      });
    } else {
      setDraft(emptyDraft());
    }
  }, [open, editing, tenantId]);

  const patch = (p: Partial<DraftState>) => {
    testGeneration.current++;
    setDraft((d) => ({ ...d, ...p }));
    setTest('idle');
    setTestToken('');
    setTestFailReason('');
  };

  // —— 实时校验（demo 逐字文案）——
  const nameErr = !draft.name.trim()
    ? t('errNameRequired')
    : draft.name.trim().length > 64
      ? t('errNameMax')
      : existingNames.some((s) => s.id !== editing?.id && s.name.trim() === draft.name.trim())
        ? t('errNameDup')
        : '';
  const urlErr = (() => {
    if (draft.syncType === 'csv') return '';
    if (draft.syncType === 'ldap') return draft.server.trim() ? '' : t('errServerRequired');
    const v = draft.apiUrl;
    if (!v.trim()) return t('errServerRequired');
    return isUrl(v) ? '' : t('errUrlInvalid');
  })();
  const portErr =
    draft.syncType === 'ldap' && (!/^\d+$/.test(draft.port) || Number(draft.port) < 1 || Number(draft.port) > 65535)
      ? t('errPortRange')
      : '';
  // GT-12037：Base DN / Bind DN / 绑定密码 都是服务端必填（demo 也标了 *），
  // 之前只有星号没有校验，缺值要等测试连接/保存时才以 400 暴露。编辑态密码留空
  // 表示"沿用已存"，只有新建（或已存源没有密文）时才必填。
  const baseDnErr = draft.syncType === 'ldap' && !draft.baseDn.trim() ? t('errBaseDnRequired') : '';
  const bindDnErr = draft.syncType === 'ldap' && !draft.bindDn.trim() ? t('errBindDnRequired') : '';
  const passwordErr =
    draft.syncType === 'ldap' && !draft.bindPassword && !(isEdit && editing?.secret_present)
      ? t('errBindPasswordRequired')
      : '';
  // GT-12039：优先级是整数 0-9999，越界会被后端拒绝。
  const priorityErr =
    !draft.priority.trim() ||
    !Number.isInteger(Number(draft.priority)) ||
    Number(draft.priority) < 0 ||
    Number(draft.priority) > 9999
      ? t('errPriorityRange')
      : '';
  const hasError = !!(nameErr || urlErr || portErr || baseDnErr || bindDnErr || passwordErr || priorityErr);
  const canTest = !hasError && draft.syncType !== 'csv';

  const buildConfig = useMemo(() => {
    return (): Record<string, unknown> => {
      switch (draft.syncType) {
        case 'ldap':
          return {
            ...(isEdit && editing?.source_type === 'ldap' ? editing.config : {}),
            server: draft.server.trim(),
            port: Number(draft.port),
            use_tls: draft.useTls,
            skip_verify: draft.skipVerify,
            allow_legacy_tls: draft.allowLegacyTls,
            base_dn: draft.baseDn.trim(),
            bind_dn: draft.bindDn.trim(),
            bind_password: draft.bindPassword,
            user_filter: draft.userFilter,
            attr_map: draft.attrMap,
          };
        case 'coremail':
          return { server_url: draft.apiUrl.trim(), account: draft.account.trim(), password: draft.accountPassword };
        case 'neteml':
          return {
            server_url: draft.apiUrl.trim(),
            corp_domain: draft.corpDomain.trim(),
            app_id: draft.appId.trim(),
            auth_code: draft.authCode,
            open_id: draft.openId.trim(),
          };
        case 'csv':
          return draft.csvConfig ?? ((editing?.config as Record<string, unknown>) || {});
      }
    };
  }, [draft, editing, isEdit]);

  const runTest = async () => {
    if (!canTest || test === 'loading') return;
    setTest('loading');
    setTestFailReason('');
    const generation = testGeneration.current;
    try {
      // Mock 模式补一个 demo 同款的 1.2s loading 期（mock dispatch 是同步的，
      // 否则「测试中…」状态一帧即逝，无法与 demo 对齐复核）。
      if (isMockEnabled()) await new Promise((r) => setTimeout(r, 1200));
      // Existing-source endpoint merges only blank secrets, not stale fields.
      const result = isEdit && editing
        ? await testContactSource(editing.id, scopedRequest, buildConfig())
        : await testContactSourceNew({ source_type: draft.syncType, config: buildConfig() }, scopedRequest);
      if (generation !== testGeneration.current) return;
      if (result.ok && result.test_token) {
        setTestToken(result.test_token);
        setTest('ok');
      } else {
        setTestToken('');
        setTestFailReason(typeof result.info === 'string' ? result.info : '');
        setTest('fail');
      }
    } catch (e) {
      if (generation !== testGeneration.current) return;
      setTestToken('');
      setTestFailReason((e as Error).message || '');
      setTest('fail');
    }
  };

  const save = async () => {
    if (hasError) {
      toast.error(t('toastFixErrors'));
      return;
    }
    const unchangedCSV = isEdit && editing?.source_type === 'csv' && draft.syncType === 'csv' && !draft.csvDirty;
    if (!testToken && !unchangedCSV) {
      toast.error(t('toastTestFirst'));
      return;
    }
    if (submitting) return;
    const payload = {
      name: draft.name.trim(),
      source_type: draft.syncType,
      config: buildConfig(),
      priority: Number(draft.priority),
      auto_sync_enabled: draft.syncType === 'csv' ? false : draft.autoSync,
      cron_expr: draft.syncType === 'csv' ? '' : draft.autoSync ? editing?.cron_expr || DEFAULT_CRON : editing?.cron_expr || '',
      sync_mode: editing?.sync_mode || 'full',
      conflict_policy: editing?.conflict_policy || 'priority',
      test_token: testToken,
    };
    setSubmitting(true);
    try {
      if (isEdit && editing) {
        await mutations.update.mutateAsync({ id: editing.id, data: { ...payload, updated_at: editing.updated_at } });
        toast.success(t('toastUpdated'));
      } else {
        await mutations.create.mutateAsync(payload);
        toast.success(t('toastCreated'));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || tc('error'));
    } finally {
      setSubmitting(false);
    }
  };

  const pwdPlaceholder = isEdit ? t('passwordPlaceholderEdit') : t('passwordPlaceholderNew');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl" showCloseButton data-testid="contacts-source-form">
        <SheetHeader className="border-b border-gray-100 px-6 pb-3 pt-6 dark:border-gray-800">
          <SheetTitle>{isEdit ? t('sheetTitleEdit') : t('sheetTitleAdd')}</SheetTitle>
          <SheetDescription>{t('sheetDesc')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <SectionCard title={t('sectionBasic')}>
            <Field label={t('fieldName')} required error={nameErr} data-testid="contacts-source-form-name" errorTestId="contacts-source-form-name-error">
              <Input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder={t('namePlaceholder')}
                data-testid="contacts-source-form-name"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('fieldSyncType')} required>
                <Select
                  value={draft.syncType}
                  onValueChange={(v) => {
                    if (!v) return;
                    patch({ syncType: v as SourceType, csvConfig: null, csvDirty: false });
                  }}
                >
                  <SelectTrigger className="w-full" data-testid="contacts-source-form-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ldap">{t('typeLdap')}</SelectItem>
                    <SelectItem value="coremail">{t('typeCoremail')}</SelectItem>
                    {/* GT-12170: 网易完整联调暂缓，仅在显式开启产品形态切换器时展示入口。 */}
                    {switcherEnabled && <SelectItem value="neteml">{t('typeNeteml')}</SelectItem>}
                    <SelectItem value="csv" data-testid="contacts-source-form-type-option-csv">{t('typeCsv')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('fieldPriority')} hint={t('priorityHint')} error={priorityErr} data-testid="contacts-source-form-priority">
                <Input
                  type="number"
                  value={draft.priority}
                  onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
                  data-testid="contacts-source-form-priority"
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title={t('sectionConn')}>
            {draft.syncType === 'ldap' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('fieldServer')} required error={urlErr} data-testid="contacts-source-form-server">
                    <Input
                      value={draft.server}
                      onChange={(e) => patch({ server: e.target.value })}
                      placeholder={t('serverPlaceholder')}
                      data-testid="contacts-source-form-server"
                    />
                  </Field>
                  <Field label={t('fieldPort')} required error={portErr} data-testid="contacts-source-form-port" errorTestId="contacts-source-form-port-error">
                    <Input
                      type="number"
                      value={draft.port}
                      onChange={(e) => patch({ port: e.target.value })}
                      data-testid="contacts-source-form-port"
                    />
                  </Field>
                </div>
                <Field label={t('fieldBaseDn')} required error={baseDnErr} data-testid="contacts-source-form-base-dn">
                  <Input
                    value={draft.baseDn}
                    onChange={(e) => patch({ baseDn: e.target.value })}
                    placeholder={t('baseDnPlaceholder')}
                    data-testid="contacts-source-form-base-dn"
                  />
                </Field>
                <Field label={t('fieldBindDn')} required error={bindDnErr} data-testid="contacts-source-form-bind-dn">
                  <Input
                    value={draft.bindDn}
                    onChange={(e) => patch({ bindDn: e.target.value })}
                    placeholder={t('bindDnPlaceholder')}
                    data-testid="contacts-source-form-bind-dn"
                  />
                </Field>
                <Field label={t('fieldBindPassword')} required={!isEdit} error={passwordErr} data-testid="contacts-source-form-password">
                  <Input
                    type="password"
                    value={draft.bindPassword}
                    onChange={(e) => patch({ bindPassword: e.target.value })}
                    placeholder={pwdPlaceholder}
                    data-testid="contacts-source-form-password"
                  />
                </Field>
                {/* 产品安全规则（spec E1）：LDAP 凭据不得明文出网，TLS 开关必须保留 */}
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="ldap-use-tls" className="font-normal">{t('fieldUseTls')}</Label>
                    <p className="text-xs text-muted-foreground">{t('fieldUseTlsHint')}</p>
                  </div>
                  <Switch
                    id="ldap-use-tls"
                    data-testid="ldap-use-tls"
                    checked={draft.useTls}
                    onCheckedChange={(v) => patch({ useTls: v })}
                  />
                </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="ldap-skip-verify" className="font-normal">{t('fieldSkipVerify')}</Label>
                      <p className="text-xs text-muted-foreground">{t('fieldSkipVerifyHint')}</p>
                    </div>
                    <Switch
                      id="ldap-skip-verify"
                      data-testid="ldap-skip-verify"
                      checked={draft.skipVerify}
                      onCheckedChange={(v) => patch({ skipVerify: v })}
                    />
                  </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5"><Label htmlFor="ldap-legacy-tls">{t('fieldLegacyTls')}</Label><p className="text-xs text-muted-foreground">{t('fieldLegacyTlsHint')}</p></div>
                  <Switch id="ldap-legacy-tls" data-testid="ldap-legacy-tls" checked={draft.allowLegacyTls} onCheckedChange={v => patch({ allowLegacyTls: v })} />
                </div>
                <Field label={t('fieldUserFilter')} required><Input className="w-full" value={draft.userFilter} onChange={e => patch({ userFilter: e.target.value })} data-testid="contacts-ldap-filter" /></Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(['email', 'display_name', 'dept', 'job_title'] as const).map(field => <Field key={field} label={t(`csvFields.${field}`)} required={field === 'email'}><Input className="w-full" value={draft.attrMap[field] ?? ''} onChange={e => patch({ attrMap: { ...draft.attrMap, [field]: e.target.value } })} data-testid={`contacts-ldap-attr-${field}`} /></Field>)}
                </div>
              </>
            )}
            {draft.syncType === 'coremail' && (
              <>
                <Field label={t('fieldApiUrl')} required error={urlErr} data-testid="contacts-source-form-api-url">
                  <Input
                    value={draft.apiUrl}
                    onChange={(e) => patch({ apiUrl: e.target.value })}
                    placeholder="https://api.coremail.cn"
                    data-testid="contacts-source-form-api-url"
                  />
                </Field>
                <Field label={t('fieldAccount')} required>
                  <Input
                    value={draft.account}
                    onChange={(e) => patch({ account: e.target.value })}
                    placeholder={t('accountPlaceholder')}
                    data-testid="contacts-source-form-account"
                  />
                </Field>
                <Field label={t('fieldAccountPassword')} required>
                  <Input
                    type="password"
                    value={draft.accountPassword}
                    onChange={(e) => patch({ accountPassword: e.target.value })}
                    placeholder={pwdPlaceholder}
                    data-testid="contacts-source-form-api-password"
                  />
                </Field>
              </>
            )}
            {draft.syncType === 'neteml' && (
              <>
                <Field label={t('fieldApiUrl')} required error={urlErr} data-testid="contacts-source-form-api-url">
                  <Input
                    value={draft.apiUrl}
                    onChange={(e) => patch({ apiUrl: e.target.value })}
                    placeholder="https://api.qiye.163.com"
                    data-testid="contacts-source-form-api-url"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('fieldCorpDomain')} required>
                    <Input
                      value={draft.corpDomain}
                      onChange={(e) => patch({ corpDomain: e.target.value })}
                      placeholder={t('corpDomainPlaceholder')}
                      data-testid="contacts-source-form-corp-domain"
                    />
                  </Field>
                  <Field label={t('fieldAppId')} required>
                    <Input
                      value={draft.appId}
                      onChange={(e) => patch({ appId: e.target.value })}
                      placeholder={t('appIdPlaceholder')}
                      data-testid="contacts-source-form-app-id"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('fieldAuthCode')} required>
                    <Input
                      type="password"
                      value={draft.authCode}
                      onChange={(e) => patch({ authCode: e.target.value })}
                      placeholder={isEdit ? t('passwordPlaceholderEdit') : t('authCodePlaceholderNew')}
                      data-testid="contacts-source-form-auth-code"
                    />
                  </Field>
                  <Field label={t('fieldOpenId')} required>
                    <Input
                      value={draft.openId}
                      onChange={(e) => patch({ openId: e.target.value })}
                      placeholder={t('openIdPlaceholder')}
                      data-testid="contacts-source-form-open-id"
                    />
                  </Field>
                </div>
              </>
            )}
            {draft.syncType === 'csv' && (
              <CSVImportFields key={`${open}-${editing?.id ?? 'new'}-${tenantId}`} tenantId={tenantId} onChange={(config, token) => { setDraft(d => ({ ...d, csvConfig: config, csvDirty: true })); setTestToken(token); }} />
            )}
            {draft.syncType !== 'csv' && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canTest || test === 'loading'}
                  onClick={runTest}
                  data-testid="contacts-source-form-test"
                >
                  {test === 'loading' ? t('testing') : t('test')}
                </Button>
                <TestResultTag result={test} failReason={testFailReason} data-testid="contacts-source-form-test-result" />
              </div>
            )}
          </SectionCard>

          <SectionCard title={t('sectionPolicy')}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{t('autoSyncTitle')}</p>
                <p className="mt-0.5 text-xs text-gray-400">{t('autoSyncDesc')}</p>
              </div>
              <Switch
                checked={draft.autoSync}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, autoSync: v }))}
                data-testid="contacts-source-form-autosync"
              />
            </div>
          </SectionCard>
        </div>

        <div className="flex flex-row justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="contacts-source-form-cancel">
            {tc('cancel')}
          </Button>
          <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={save} data-testid="contacts-source-form-submit">
            {t('btnConfirm')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
