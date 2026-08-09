'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Copy, Mail, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApiRequest, ApiError } from '@/lib/api/client';
import {
  listAdmissionRules,
  setAdmissionRuleStatus,
  deleteAdmissionRule,
  createAdmissionRule,
} from '@/lib/api/phishing-config';
import type { PhishAdmissionRule } from '@/types/phishing-config';
import { AdmissionRuleSheet } from './admission-rule-sheet';

function isValidationError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  return err.message || null;
}

export function AdmissionRulesSection() {
  const t = useTranslations('phishingConfig.admission');
  const tdir = useTranslations('phishingConfig.admission.direction');
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PhishAdmissionRule | null>(null);
  const [search, setSearch] = useState('');

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['phish-admission-rules'],
    queryFn: () => listAdmissionRules(apiRequest),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['phish-admission-rules'] });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      setAdmissionRuleStatus(id, enabled, apiRequest),
    onSuccess: () => {
      toast.success(t('toggled'));
      invalidate();
    },
    onError: (err) => toast.error(isValidationError(err) ?? t('toggleFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdmissionRule(id, apiRequest),
    onSuccess: () => {
      toast.success(t('deleted'));
      invalidate();
    },
    onError: (err) => toast.error(isValidationError(err) ?? t('deleteFailed')),
  });

  const duplicateMutation = useMutation({
    mutationFn: (rule: PhishAdmissionRule) => {
      // 复制规则：沿用除 id/priority 之外的全部字段，名称追加「副本」后缀，
      // 新规则以停用状态创建，避免在管理员确认前立即生效影响线上邮件流。
      const rest: PhishAdmissionRule = { ...rule };
      delete rest.id;
      delete rest.priority;
      return createAdmissionRule(
        { ...rest, name: t('duplicateName', { name: rule.name }), enabled: false },
        apiRequest,
      );
    },
    onSuccess: () => {
      toast.success(t('duplicated'));
      invalidate();
    },
    onError: (err) => toast.error(isValidationError(err) ?? t('duplicateFailed')),
  });

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (rule: PhishAdmissionRule) => {
    setEditing(rule);
    setSheetOpen(true);
  };

  const handleToggle = (rule: PhishAdmissionRule) => {
    if (!rule.id) return;
    toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled });
  };

  const handleDelete = (rule: PhishAdmissionRule) => {
    if (!rule.id) return;
    if (!window.confirm(t('confirmDelete', { name: rule.name }))) return;
    deleteMutation.mutate(rule.id);
  };

  const directionText = (rule: PhishAdmissionRule) =>
    rule.directions.map((d) => tdir(d)).join(' / ') || '-';
  // 检测范围列只展示方向本身（与截图对齐）；基础筛查门（require_url /
  // max_size_mb）是命中前提而非风险信号（spec §7 MI-5），挪到 tooltip 里，
  // 避免信息丢失的同时保持列表简洁。
  const scopeTooltip = (rule: PhishAdmissionRule) => {
    const base: string[] = [];
    if (rule.require_url) base.push(t('requireUrl'));
    if (rule.max_size_mb) base.push(`≤${rule.max_size_mb}MB`);
    return base.length ? base.join(' · ') : t('noBasicScreen');
  };
  // 群组标签去 `grp:` 前缀显示，与抽屉群组按钮（admission-rule-sheet `g.replace(/^grp:/, '')`）
  // 保持一致，避免列表显示原始 `grp:finance` 而抽屉显示 `finance`（MI-6）。
  const recipientText = (rule: PhishAdmissionRule) =>
    (rule.recipient_tags ?? []).length
      ? (rule.recipient_tags ?? []).map((tag) => tag.replace(/^grp:/, '')).join(', ')
      : t('allRecipients');
  // 风险信号列仅含真正的风险信号（发件人首现 / 二维码 / 可点击附件），与抽屉
  // section ② 的「发信人特征 / 邮件内容」分组一致；基础筛查门已移至检测范围列
  // 的 tooltip（MI-5）。文案用「、」分隔，内容类信号带「含」前缀，与截图对齐。
  const riskText = (rule: PhishAdmissionRule) => {
    const s: string[] = [];
    if (rule.sender_first_seen) s.push(t('riskLabels.senderFirstSeen'));
    if (rule.require_qrcode) s.push(t('riskLabels.qrcode'));
    if (rule.require_clickable_attachment) s.push(t('riskLabels.clickableAttachment'));
    return s.join('、') || '-';
  };

  // 按规则名称 / 检测范围（方向）/ 风险信号文本做前端过滤——规则数量小，无需
  // 接口分页搜索，也无需 useMemo（React Compiler 会自动处理）。大小写不敏感，
  // 兼容中英文混输。
  const searchQuery = search.trim().toLowerCase();
  const filteredRules = !searchQuery
    ? rules
    : rules.filter((rule) => {
        const haystack = [rule.name, directionText(rule), riskText(rule)].join(' ').toLowerCase();
        return haystack.includes(searchQuery);
      });

  return (
    <Card className="border-l-4 border-l-blue-500" data-testid="admission-rules-section">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-blue-600" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-8"
              data-testid="admission-rule-search"
            />
          </div>
          <Button onClick={openCreate} size="sm" data-testid="admission-rule-create">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('create')}
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : filteredRules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noSearchResults')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('colName')}</TableHead>
                <TableHead>{t('colEnabled')}</TableHead>
                <TableHead>{t('colScope')}</TableHead>
                <TableHead>{t('colRecipients')}</TableHead>
                <TableHead>{t('colRisk')}</TableHead>
                <TableHead className="text-right">{t('colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRules.map((rule) => (
                <TableRow key={rule.id ?? rule.name} data-testid="admission-rule-row">
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        data-testid={`admission-rule-toggle-${rule.id}`}
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule)}
                      />
                      <Badge
                        variant={rule.enabled ? 'default' : 'secondary'}
                        className="text-xs"
                        data-testid={`admission-rule-status-badge-${rule.id}`}
                      >
                        {rule.enabled ? t('statusEnabled') : t('statusDisabled')}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground" title={scopeTooltip(rule)}>
                    {directionText(rule)}
                  </TableCell>
                  <TableCell
                    className="max-w-[180px] truncate text-xs text-muted-foreground"
                    title={recipientText(rule)}
                  >
                    {recipientText(rule)}
                  </TableCell>
                  <TableCell
                    className="max-w-[220px] truncate text-xs text-muted-foreground"
                    title={riskText(rule)}
                  >
                    {riskText(rule)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => openEdit(rule)}
                        aria-label={t('edit')}
                        data-testid={`admission-rule-edit-${rule.id}`}
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => duplicateMutation.mutate(rule)}
                        disabled={duplicateMutation.isPending}
                        aria-label={t('duplicate')}
                        data-testid={`admission-rule-duplicate-${rule.id}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(rule)}
                        aria-label={t('delete')}
                        data-testid={`admission-rule-delete-${rule.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {rules.length > 0 && (
        <CardFooter className="text-xs text-muted-foreground" data-testid="admission-rules-footer">
          {t('footer', {
            total: rules.length,
            enabled: rules.filter((r) => r.enabled).length,
          })}
        </CardFooter>
      )}

      <AdmissionRuleSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        rule={editing}
        onSaved={() => {
          setSheetOpen(false);
          setEditing(null);
          invalidate();
        }}
      />
    </Card>
  );
}
