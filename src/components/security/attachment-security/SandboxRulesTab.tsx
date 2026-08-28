'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Search, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Skeleton } from '@/components/ui/skeleton';
import { SandboxRuleDrawer } from './SandboxRuleDrawer';
import { useApiRequest } from '@/lib/api/client';
import {
  listSandboxRules,
  deleteSandboxRule,
  setSandboxRuleStatus,
} from '@/lib/api/attachment-security';
import type { SandboxRule } from '@/types/attachment-security';

interface SandboxRulesTabProps {
  readOnly?: boolean;
}

export function SandboxRulesTab({ readOnly = false }: SandboxRulesTabProps) {
  const t = useTranslations('attachmentSecurity.sandbox');
  const tdir = useTranslations('attachmentSecurity.direction');
  const { apiRequest } = useApiRequest();

  const [rules, setRules] = useState<SandboxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<SandboxRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<SandboxRule | null>(null);

  const loadRules = async () => {
    setLoading(true);
    try {
      const items = await listSandboxRules(apiRequest);
      // 按创建时间升序：先创建的规则优先匹配（GT-附件沙箱-P0 已确认的排序即优先级方案）
      const sorted = [...items].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setRules(sorted);
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRules = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rules;
    return rules.filter((rule) => {
      const dirLabel = rule.direction
        .map((dir) => tdir(dir))
        .join(' ')
        .toLowerCase();
      const typeLabels = rule.file_type_categories
        .map((key) => t(`fileTypeCategories.${key}`))
        .join(' ')
        .toLowerCase();
      return (
        rule.name.toLowerCase().includes(keyword) ||
        dirLabel.includes(keyword) ||
        typeLabels.includes(keyword) ||
        rule.custom_extensions.some((ext) => ext.toLowerCase().includes(keyword))
      );
    });
  }, [rules, search, t, tdir]);

  const handleCreate = () => {
    setEditingRule(null);
    setDrawerOpen(true);
  };

  const handleEdit = (rule: SandboxRule) => {
    setEditingRule(rule);
    setDrawerOpen(true);
  };

  const handleSaved = () => {
    setDrawerOpen(false);
    loadRules();
  };

  const handleToggleEnabled = async (rule: SandboxRule) => {
    if (!rule.id) return;
    const nextEnabled = !rule.enabled;
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, enabled: nextEnabled } : r)),
    );
    try {
      await setSandboxRuleStatus(rule.id, nextEnabled, apiRequest);
    } catch {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)),
      );
      toast.error(t('statusUpdateFailed'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRule?.id) return;
    try {
      await deleteSandboxRule(deletingRule.id, apiRequest);
      toast.success(t('deleted'));
      setDeletingRule(null);
      loadRules();
    } catch {
      toast.error(t('deleteFailed'));
    }
  };

  // 文件类型列：预置分类 + 自定义扩展名合并展示，用 "、" 分隔；两者皆空时（理论上
  // 不会发生，抽屉侧已强制校验至少选一项）回退为 "-"，与检测范围/送检大小上限列的
  // 空值占位保持一致。
  const fileTypeText = (rule: SandboxRule): string => {
    const labels = [
      ...rule.file_type_categories.map((key) => t(`fileTypeCategories.${key}`)),
      ...rule.custom_extensions,
    ];
    return labels.length > 0 ? labels.join('、') : '-';
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t('title')}</h3>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-8"
            data-testid="sandbox-rule-search"
          />
        </div>
        {!readOnly && (
          <Button onClick={handleCreate} size="sm" data-testid="sandbox-rule-create-button">
            <Plus className="mr-1.5 size-3.5" />
            {t('createButton')}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rules.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('emptyTitle')}</p>
      ) : filteredRules.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('noMatch')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colName')}</TableHead>
              <TableHead>{t('colStatus')}</TableHead>
              <TableHead>{t('colDirection')}</TableHead>
              <TableHead>{t('colFileType')}</TableHead>
              <TableHead className="text-right">{t('colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRules.map((rule) => (
              <TableRow key={rule.id} data-testid={`sandbox-rule-row-${rule.id}`}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => handleToggleEnabled(rule)}
                      disabled={readOnly}
                      aria-label={t('enabledLabel')}
                      data-testid={`sandbox-rule-toggle-${rule.id}`}
                    />
                    <Badge
                      variant={rule.enabled ? 'default' : 'secondary'}
                      className="text-xs"
                      data-testid={`sandbox-rule-status-badge-${rule.id}`}
                    >
                      {rule.enabled ? t('statusEnabled') : t('statusDisabled')}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {rule.direction.map((dir) => tdir(dir)).join(' / ')}
                </TableCell>
                <TableCell
                  className="max-w-[220px] truncate text-xs text-muted-foreground"
                  title={fileTypeText(rule)}
                >
                  {fileTypeText(rule)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => handleEdit(rule)}
                      disabled={readOnly}
                      aria-label={t('editTitle')}
                      data-testid={`sandbox-rule-edit-${rule.id}`}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeletingRule(rule)}
                      disabled={readOnly}
                      aria-label={t('deleteConfirmTitle')}
                      data-testid={`sandbox-rule-delete-${rule.id}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {rules.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="sandbox-rules-footer">
          {t('footer', {
            total: rules.length,
            enabled: rules.filter((r) => r.enabled).length,
          })}
        </p>
      )}

      <SandboxRuleDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        rule={editingRule}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={!!deletingRule}
        onOpenChange={(open) => !open && setDeletingRule(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('deleteConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
