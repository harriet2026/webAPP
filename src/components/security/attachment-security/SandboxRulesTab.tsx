'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Search, Plus, Pencil, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
      const dirLabel = tdir(rule.direction).toLowerCase();
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

  const summaryFor = (rule: SandboxRule): string => {
    const dirLabel = tdir(rule.direction);
    const typeLabels =
      rule.file_type_categories.length > 0 || rule.custom_extensions.length > 0
        ? [
            ...rule.file_type_categories.map((key) => t(`fileTypeCategories.${key}`)),
            ...rule.custom_extensions,
          ].join('、')
        : t('noFileTypeSelected');
    const highActionLabel = t(`riskActionOptions.${rule.risk_actions.high}`);
    return t('summaryLine', {
      direction: dirLabel,
      fileTypes: typeLabels,
      highAction: highActionLabel,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t('listTitle')}</h3>
        <div className="flex items-start gap-1.5">
          <p className="text-sm text-muted-foreground">{t('listDescription')}</p>
          <Tooltip>
            <TooltipTrigger
              render={<Info className="mt-0.5 size-3.5 shrink-0 cursor-help text-muted-foreground" />}
            />
            <TooltipContent>{t('sortHint')}</TooltipContent>
          </Tooltip>
        </div>
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
          <Button onClick={handleCreate} data-testid="sandbox-rule-create-button">
            <Plus className="size-4" />
            {t('createButton')}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filteredRules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {rules.length === 0 ? t('emptyState') : t('noSearchResult')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-lg border p-3"
              data-testid={`sandbox-rule-card-${rule.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${rule.enabled ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                  />
                  <span className="text-sm font-medium">{rule.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => handleToggleEnabled(rule)}
                    disabled={readOnly}
                    aria-label={t('enabledLabel')}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(rule)}
                    disabled={readOnly}
                    aria-label={t('editTitle')}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingRule(rule)}
                    disabled={readOnly}
                    aria-label={t('deleteConfirmTitle')}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{summaryFor(rule)}</p>
            </div>
          ))}
        </div>
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
            <AlertDialogDescription>{t('deleteConfirmDescription')}</AlertDialogDescription>
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
