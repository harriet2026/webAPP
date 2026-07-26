'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  // 检测范围 = 邮件流方向 + 基础筛查门（require_url / max_size_mb）。基础筛查门
  // 是命中前提，spec §7 明确「不计作风险信号」，故不放进 colRisk（MI-5）。
  const scopeText = (rule: PhishAdmissionRule) => {
    const base: string[] = [];
    if (rule.require_url) base.push(t('requireUrl'));
    if (rule.max_size_mb) base.push(`≤${rule.max_size_mb}MB`);
    return base.length ? `${directionText(rule)} · ${base.join(' · ')}` : directionText(rule);
  };
  // 群组标签去 `grp:` 前缀显示，与抽屉群组按钮（admission-rule-sheet `g.replace(/^grp:/, '')`）
  // 保持一致，避免列表显示原始 `grp:finance` 而抽屉显示 `finance`（MI-6）。
  const recipientText = (rule: PhishAdmissionRule) =>
    (rule.recipient_tags ?? []).length
      ? (rule.recipient_tags ?? []).map((tag) => tag.replace(/^grp:/, '')).join(', ')
      : t('allRecipients');
  // 风险信号列仅含真正的风险信号（发件人首现 / 二维码），与抽屉 section ② 的
  // 「发信人特征 / 邮件内容」分组一致；基础筛查门已移至检测范围列（MI-5）。
  const riskText = (rule: PhishAdmissionRule) => {
    const s: string[] = [];
    if (rule.sender_first_seen) s.push(t('senderFirstSeen'));
    if (rule.require_qrcode) s.push(t('qrcode'));
    return s.join(' · ') || '-';
  };

  return (
    <Card data-testid="admission-rules-section">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <Button onClick={openCreate} size="sm" data-testid="admission-rule-create">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('create')}
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
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
              {rules.map((rule) => (
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
                  <TableCell className="text-xs text-muted-foreground">
                    {scopeText(rule)}
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
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(rule)}
                        aria-label={t('edit')}
                        data-testid={`admission-rule-edit-${rule.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
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
