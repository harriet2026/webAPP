'use client';

// IP 黑白名单「批量导入」弹窗（GT-12137）。
//
// 原型（design/origin/spec/IP黑白名单需求文档.md §批量导入）要求：
//   - 文本框粘贴（每行一个 IP/IP段）
//   - 文件上传（格式与「导出」一致：rule-settings/v1 JSON，导出的 .json 可直接导回）
//   - 导入前预览解析结果
//   - 重复 IP 自动去重，可选覆盖或跳过
//   - 单次不超过 1000 条
//
// 解析/去重纯逻辑在 ip-filter-import.ts（已单测）；本组件只负责交互与提交编排。
// 提交复用既有单条 create/update API + 动作映射，后端无需改动。

import { useCallback, useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ApiRequestFn } from '@/lib/api/client';
import { createIPFilterRule, updateIPFilterRule } from '@/lib/api/ip-filter';
import { toGatewayPayload } from '@/lib/api/ip-filter-action-map';
import type { DemoAction, DemoBlacklistAction, DemoWhitelistAction, IPFilterListType, IPFilterRuleView } from '@/types/ip-filter';
import {
  parseImportInputs,
  parseExportEnvelope,
  buildImportPlan,
  MAX_IMPORT_ROWS,
  type EnvelopeRuleRow,
  type ExistingDuplicateStrategy,
  type ParsedImportRow,
} from './ip-filter-import';

interface IPFilterImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listType: IPFilterListType;
  // 当前名单已有规则，用于既有重复判定。只需其 ip_value。
  existingRules: IPFilterRuleView[];
  apiRequest: ApiRequestFn;
  onImported: () => void;
}

const BLACKLIST_ACTIONS: DemoBlacklistAction[] = ['block', 'quarantine', 'drop', 'review'];
const WHITELIST_ACTIONS: DemoWhitelistAction[] = ['deliver', 'tagDeliver'];

const ACTION_LABEL_KEY: Record<DemoAction, string> = {
  block: 'ipFilter.actionBlock',
  quarantine: 'ipFilter.actionQuarantine',
  drop: 'ipFilter.actionDrop',
  review: 'ipFilter.actionReview',
  deliver: 'ipFilter.actionDeliver',
  tagDeliver: 'ipFilter.actionTagDeliver',
};

export function IPFilterImportDialog({
  open,
  onOpenChange,
  listType,
  existingRules,
  apiRequest,
  onImported,
}: IPFilterImportDialogProps) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  // JSON 文件（导出格式）解析出的规则行 + 文件名（用于展示与清除）。
  const [fileRows, setFileRows] = useState<EnvelopeRuleRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [defaultAction, setDefaultAction] = useState<DemoAction>(
    listType === 'blacklist' ? 'block' : 'deliver',
  );
  const [strategy, setStrategy] = useState<ExistingDuplicateStrategy>('skip');
  const [submitting, setSubmitting] = useState(false);

  const actionChoices = listType === 'blacklist' ? BLACKLIST_ACTIONS : WHITELIST_ACTIONS;

  const existingIpValues = useMemo(
    () => existingRules.map((r) => r.ip_value).filter(Boolean),
    [existingRules],
  );

  const parsed = useMemo(
    () => parseImportInputs({ text, envelopeRows: fileRows }, { listType, defaultAction, existingIpValues }),
    [text, fileRows, listType, defaultAction, existingIpValues],
  );

  const plan = useMemo(() => buildImportPlan(parsed.rows, strategy), [parsed.rows, strategy]);

  const reset = useCallback(() => {
    setText('');
    setFileRows([]);
    setFileName('');
    setStrategy('skip');
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  // 文件格式 = 导出格式（rule-settings/v1 JSON envelope）。envelope 级错误整体拒绝并 toast；
  // 行级问题（表达式、名单不符、非法 IP）保留在预览里逐行标注。
  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const result = parseExportEnvelope(content, listType);
      if ('error' in result) {
        toast.error(t(`ipFilter.${result.error}` as never));
        return;
      }
      if (result.rules.length === 0) {
        toast.error(t('ipFilter.importJsonEmpty'));
        return;
      }
      setFileRows(result.rules);
      setFileName(file.name);
    } catch {
      toast.error(t('common.error'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [t, listType]);

  const handleSubmit = useCallback(async () => {
    if (parsed.exceededLimit) {
      toast.error(t('ipFilter.importExceedLimit', { max: MAX_IMPORT_ROWS }));
      return;
    }
    if (plan.length === 0) {
      toast.error(t('ipFilter.importNothingToImport'));
      return;
    }
    setSubmitting(true);
    // 覆盖模式需要按 ip_value 找到既有规则 id。
    const existingById = new Map(existingRules.map((r) => [r.ip_value.toLowerCase(), r]));
    let created = 0;
    let overwritten = 0;
    let failed = 0;
    // 优先级递增，保持导入顺序稳定；沿用单条创建默认区间的相对次序。
    const basePriority = 100;
    for (let i = 0; i < plan.length; i += 1) {
      const row = plan[i];
      const { action, add_headers } = toGatewayPayload(row.action);
      // JSON（导出格式）行保留原始 name/priority/启用状态，导出→导入闭环不丢属性；
      // 文本行沿用 import-<ip> 命名 + 递增优先级。
      const payload = {
        name: row.name || `import-${row.ipValue}`,
        list_type: listType,
        ip_config_type: row.kind === 'range' ? ('range' as const) : ('single' as const),
        ip_value: row.ipValue,
        action,
        priority: row.priority ?? basePriority + i,
        is_active: row.isActive ?? true,
        description: row.remark || undefined,
        add_headers,
      };
      try {
        if (row.mode === 'overwrite') {
          const existing = existingById.get(row.ipValue.toLowerCase());
          if (existing) {
            await updateIPFilterRule(existing.id, { ...payload, priority: row.priority ?? existing.priority }, apiRequest);
            overwritten += 1;
          } else {
            await createIPFilterRule(payload, apiRequest);
            created += 1;
          }
        } else {
          await createIPFilterRule(payload, apiRequest);
          created += 1;
        }
      } catch {
        failed += 1;
      }
    }
    setSubmitting(false);
    if (failed === 0) {
      toast.success(t('ipFilter.importDone', { created, overwritten }));
      onImported();
      handleClose(false);
    } else {
      toast.error(t('ipFilter.importPartialFail', { created, overwritten, failed }));
      onImported();
    }
  }, [parsed.exceededLimit, plan, existingRules, listType, apiRequest, t, onImported, handleClose]);

  const dupBadge = (row: ParsedImportRow) => {
    if (row.error) {
      return <Badge variant="destructive" className="text-xs">{t(`ipFilter.${row.error}`)}</Badge>;
    }
    if (row.duplicate === 'in_batch') {
      return <Badge variant="secondary" className="text-xs">{t('ipFilter.importDupInBatch')}</Badge>;
    }
    if (row.duplicate === 'existing') {
      return <Badge variant="outline" className="text-xs">{t('ipFilter.importDupExisting')}</Badge>;
    }
    return <Badge variant="default" className="text-xs">{t('ipFilter.importRowValid')}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('ipFilter.importTitle')}</DialogTitle>
          <DialogDescription>{t('ipFilter.importDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{t('ipFilter.importDefaultAction')}</Label>
              <Select value={defaultAction} onValueChange={(v) => setDefaultAction(v as DemoAction)}>
                <SelectTrigger className="w-40" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actionChoices.map((a) => (
                    <SelectItem key={a} value={a}>{t(ACTION_LABEL_KEY[a])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1" />
            {fileName && (
              <Badge variant="secondary" className="text-xs max-w-[240px]">
                <span className="truncate" title={fileName}>
                  {t('ipFilter.importFileLoaded', { name: fileName, count: fileRows.length })}
                </span>
                <button
                  type="button"
                  className="ml-1 inline-flex shrink-0 cursor-pointer rounded-sm text-muted-foreground transition-[color,background-color] duration-[120ms] ease-out motion-reduce:transition-none hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  aria-label={t('ipFilter.importFileClear')}
                  onClick={() => { setFileRows([]); setFileName(''); }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFile}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4 mr-1" />
              {t('ipFilter.importUploadJson')}
            </Button>
          </div>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('ipFilter.importPlaceholder')}
            rows={6}
            className="font-mono text-xs"
          />

          {parsed.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{t('ipFilter.importSummary', {
                  total: parsed.total,
                  valid: parsed.validCount,
                  error: parsed.errorCount,
                  dup: parsed.duplicateCount,
                })}</span>
                {parsed.exceededLimit && (
                  <Badge variant="destructive" className="text-xs">
                    {t('ipFilter.importExceedLimit', { max: MAX_IMPORT_ROWS })}
                  </Badge>
                )}
              </div>

              <ScrollArea className="h-56 rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>{t('ipFilter.ipAddress')}</TableHead>
                      <TableHead className="w-28">{t('ipFilter.action')}</TableHead>
                      <TableHead>{t('ipFilter.description')}</TableHead>
                      <TableHead className="w-28">{t('ipFilter.importStatus')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.map((row) => (
                      <TableRow key={row.lineNo} className={row.error ? 'opacity-70' : ''}>
                        <TableCell className="text-xs text-muted-foreground">{row.lineNo}</TableCell>
                        {/* 超长原始行（异常粘贴/坏文件）截断显示，防止撑爆弹窗 grid 宽度 */}
                        <TableCell className="font-mono text-xs max-w-[280px] truncate" title={row.ipValue || row.raw}>
                          {row.ipValue || row.raw}
                        </TableCell>
                        <TableCell className="text-xs">{t(ACTION_LABEL_KEY[row.action])}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]" title={row.remark}>
                          {row.remark || '—'}
                        </TableCell>
                        <TableCell>{dupBadge(row)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {parsed.duplicateCount > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('ipFilter.importDupStrategy')}</Label>
                  <RadioGroup
                    value={strategy}
                    onValueChange={(v) => setStrategy(v as ExistingDuplicateStrategy)}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="skip" id="dup-skip" />
                      <Label htmlFor="dup-skip" className="text-xs font-normal">{t('ipFilter.importDupSkip')}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="overwrite" id="dup-overwrite" />
                      <Label htmlFor="dup-overwrite" className="text-xs font-normal">{t('ipFilter.importDupOverwrite')}</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || plan.length === 0 || parsed.exceededLimit}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('ipFilter.importConfirm', { count: plan.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
