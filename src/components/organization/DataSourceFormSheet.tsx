'use client';

// 新增/编辑数据源抽屉 —— 逐字段对齐 demo data-source-tab.tsx 的 Sheet：
// 三个 SectionCard（基础信息 / 连接参数 / 同步策略）+ 4 种同步方式表单联动 +
// 实时行内校验 + 测试连接状态机 + 「确定」点击式闸门（toast 阻断，不禁用按钮）。
// 有意偏离（spec E1/E2/E3）：LDAP 保留 TLS 两开关（产品安全规则强制）；
// user_filter/attr_map 不在 UI，保存时下发默认值；coremail/neteml 为后端 stub，
// 保存闸门按后端契约仅对 LDAP/CSV 生效。

import { useEffect, useMemo, useState } from 'react';
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
import {
  useContactSourceMutations,
  testContactSourceNew,
  testContactSource,
  uploadContactCSV,
  previewContactCSV,
} from './api';
import { Field, SectionCard, TestResultTag, type TestState } from './shared';
import type { ContactSource, SourceType } from './types';

const DEFAULT_USER_FILTER = '(objectClass=person)';
const DEFAULT_ATTR_MAP = { email: 'mail', display_name: 'cn', dept: 'department', job_title: 'title' };
const DEFAULT_CRON = '0 0 * * *';

// CSV 自动列映射（demo 无列映射 UI，Q2 拍板严格对齐 —— 按常见表头名自动映射）
const CSV_HEADER_ALIASES: Record<string, string[]> = {
  email: ['email', 'e-mail', 'mail', '邮箱', '邮箱地址', '电子邮箱'],
  display_name: ['name', 'display_name', 'username', '姓名', '用户名', '显示名'],
  dept: ['dept', 'department', 'dept_path', '部门', '部门路径'],
  job_title: ['job_title', 'title', 'position', '职务', '职位', '岗位'],
};

function autoColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(CSV_HEADER_ALIASES)) {
    const hit = headers.find((h) => aliases.includes(h.trim().toLowerCase()) || aliases.includes(h.trim()));
    if (hit) map[field] = hit;
  }
  return map;
}

interface DraftState {
  name: string;
  syncType: SourceType;
  priority: string;
  // ldap
  server: string;
  port: string;
  useTls: boolean;
  skipVerify: boolean;
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
  // csv（组织 ID/名称仅 UI 对齐 demo，不入 config —— 后端 CSV config 形状固定 4 键）
  orgId: string;
  orgName: string;
  csvConfig: Record<string, unknown> | null;
  csvFileName: string;
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
  orgId: '',
  orgName: '',
  csvConfig: null,
  csvFileName: '',
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

  useEffect(() => {
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
        orgId: String(cfg.org_id ?? ''),
        orgName: String(cfg.org_name ?? ''),
        csvConfig: null,
        csvFileName: '',
        autoSync: editing.auto_sync_enabled,
      });
    } else {
      setDraft(emptyDraft());
    }
  }, [open, editing]);

  const patch = (p: Partial<DraftState>) => {
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
            server: draft.server.trim(),
            port: Number(draft.port),
            use_tls: draft.useTls,
            skip_verify: draft.skipVerify,
            base_dn: draft.baseDn.trim(),
            bind_dn: draft.bindDn.trim(),
            bind_password: draft.bindPassword,
            user_filter: DEFAULT_USER_FILTER,
            attr_map: DEFAULT_ATTR_MAP,
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
  }, [draft, editing]);

  const runTest = async () => {
    if (!canTest || test === 'loading') return;
    setTest('loading');
    setTestFailReason('');
    try {
      // Mock 模式补一个 demo 同款的 1.2s loading 期（mock dispatch 是同步的，
      // 否则「测试中…」状态一帧即逝，无法与 demo 对齐复核）。
      if (isMockEnabled()) await new Promise((r) => setTimeout(r, 1200));
      // 编辑态且密码未重填 → 测已存配置；否则测当前输入。
      const useStored = isEdit && editing && draft.syncType === 'ldap' && !draft.bindPassword;
      const result = useStored
        ? await testContactSource(editing!.id, scopedRequest)
        : await testContactSourceNew({ source_type: draft.syncType, config: buildConfig() }, scopedRequest);
      if (result.ok && result.test_token) {
        setTestToken(result.test_token);
        setTest('ok');
      } else {
        setTestToken('');
        setTestFailReason(typeof result.info === 'string' ? result.info : '');
        setTest('fail');
      }
    } catch (e) {
      setTestToken('');
      setTestFailReason((e as Error).message || '');
      setTest('fail');
    }
  };

  // CSV：选择文件即 上传 → 自动列映射 → 预览校验拿 test_token（demo 无列映射 UI）
  const handleCsvFile = async (file: File | null) => {
    if (!file) return;
    patch({ csvFileName: file.name, csvConfig: null });
    try {
      if (isMockEnabled()) {
        setDraft((d) => ({ ...d, csvConfig: { user_file_ref: 'mock-user.csv', dept_file_ref: '', uid_column: '', user_column_map: { email: '邮箱' } } }));
        setTestToken('mock-csv-test-token');
        return;
      }
      const up = await uploadContactCSV(file, { tenantId });
      const columnMap = autoColumnMap(up.headers || []);
      if (!columnMap.email) {
        toast.error(t('csvUploadFailed', { reason: t('csvEmailColMissing') }));
        return;
      }
      const preview = await previewContactCSV({
        user_file_ref: up.user_file_ref || '',
        user_column_map: columnMap,
        upload_token: up.upload_token,
      });
      setDraft((d) => ({
        ...d,
        csvConfig: {
          user_file_ref: up.user_file_ref || '',
          dept_file_ref: '',
          uid_column: '',
          user_column_map: columnMap,
        },
      }));
      setTestToken(preview.test_token);
    } catch (e) {
      toast.error(t('csvUploadFailed', { reason: (e as Error).message || '' }));
    }
  };

  const save = async () => {
    if (hasError) {
      toast.error(t('toastFixErrors'));
      return;
    }
    // 保存闸门：LDAP/CSV 必须持有效 test_token（后端契约）；demo 口径是全部非
    // CSV 类型测试通过 —— coremail/neteml 为 stub 放行（spec E3）。
    const requiresToken = draft.syncType === 'ldap' || draft.syncType === 'csv';
    if (requiresToken && !testToken) {
      toast.error(t('toastTestFirst'));
      return;
    }
    if (submitting) return;
    const payload = {
      name: draft.name.trim(),
      source_type: draft.syncType,
      config: buildConfig(),
      priority: Number(draft.priority) || 50,
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
            <Field label={t('fieldName')} required error={nameErr} data-testid="contacts-source-form-name">
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
                    patch({ syncType: v as SourceType, csvConfig: null, csvFileName: '' });
                  }}
                >
                  <SelectTrigger className="w-full" data-testid="contacts-source-form-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ldap">{t('typeLdap')}</SelectItem>
                    <SelectItem value="coremail">{t('typeCoremail')}</SelectItem>
                    <SelectItem value="neteml">{t('typeNeteml')}</SelectItem>
                    <SelectItem value="csv">{t('typeCsv')}</SelectItem>
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
                  <Field label={t('fieldPort')} required error={portErr} data-testid="contacts-source-form-port">
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
                {draft.useTls && (
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
                )}
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
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('fieldOrgId')} required>
                    <Input
                      value={draft.orgId}
                      onChange={(e) => setDraft((d) => ({ ...d, orgId: e.target.value }))}
                      placeholder={t('orgIdPlaceholder')}
                      data-testid="contacts-source-form-org-id"
                    />
                  </Field>
                  <Field label={t('fieldOrgName')} required>
                    <Input
                      value={draft.orgName}
                      onChange={(e) => setDraft((d) => ({ ...d, orgName: e.target.value }))}
                      placeholder={t('orgNamePlaceholder')}
                      data-testid="contacts-source-form-org-name"
                    />
                  </Field>
                </div>
                <Field label={t('fieldUpload')} hint={t('uploadHint')}>
                  <Input
                    type="file"
                    accept=".csv"
                    className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-sm dark:file:bg-gray-800"
                    onChange={(e) => handleCsvFile(e.target.files?.[0] ?? null)}
                    data-testid="contacts-source-form-csv-file"
                  />
                </Field>
              </>
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
