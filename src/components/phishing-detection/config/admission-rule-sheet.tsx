'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useApiRequest } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { GROUPS_LIST_QUERY, ruleToGroup } from '@/lib/api/groups';
import { createAdmissionRule, updateAdmissionRule } from '@/lib/api/phishing-config';
import { OrgContactTreeSelect } from '@/components/organization/org-contact-tree-select';
import { GroupMultiSelect, type GroupMultiSelectOption } from '@/components/security/groups/group-multi-select';
import { GROUP_TAG_PREFIX } from '@/types/groups';
import type { PhishAdmissionRule } from '@/types/phishing-config';
import type { Rule } from '@/types/unified-rules';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rule: PhishAdmissionRule | null; // null = create
  onSaved: () => void;
}

type Direction = PhishAdmissionRule['directions'][number];
const DIRECTIONS: Direction[] = ['inbound', 'outbound', 'internal'];

function emptyDraft(): PhishAdmissionRule {
  return {
    name: '',
    directions: ['inbound'],
    recipient_tags: [],
    recipient_emails: [],
    recipient_dept_paths: [],
    require_url: true,
    max_size_mb: 0,
    sender_first_seen: true,
    require_qrcode: false,
    require_clickable_attachment: false,
    enabled: true,
    priority: 0,
  };
}

export function AdmissionRuleSheet({ open, onOpenChange, rule, onSaved }: Props) {
  const t = useTranslations('phishingConfig.admission');
  const tdir = useTranslations('phishingConfig.admission.direction');
  const { apiRequest } = useApiRequest();
  const apiErrorMessage = useApiErrorMessage();

  const [draft, setDraft] = useState<PhishAdmissionRule>(emptyDraft());
  const [filterOn, setFilterOn] = useState(false);
  const [saving, setSaving] = useState(false);

  // 群组策略中的发信人群组 / 收信人群组供下拉多选（不再体现自由标签，也不再暴露
  // content 类型群组——关键词库属于邮件内容维度，与"筛选收发信人"语义不符）。
  // 后端 ListUnifiedRules 不读 group_type 参数，按 rule_class/stage/page 过滤，
  // 所以只发一次请求、在客户端按 g.type 分流到 sender/recipient 两组（与
  // ContentRulesPage 一致），并按名字去重，避免重复渲染。
  const { data: groupsByType } = useQuery<{
    sender: GroupMultiSelectOption[];
    recipient: GroupMultiSelectOption[];
  }>({
    queryKey: ['sender-recipient-groups'],
    queryFn: async () => {
      const resp = await apiRequest<{ items: unknown[] }>(
        `/unified-rules?${new URLSearchParams(GROUPS_LIST_QUERY)}`,
      );
      const seenSender = new Set<string>();
      const seenRecipient = new Set<string>();
      const sender: GroupMultiSelectOption[] = [];
      const recipient: GroupMultiSelectOption[] = [];
      for (const item of resp.items ?? []) {
        const g = ruleToGroup(item as Rule);
        if (!g) continue;
        if (g.type === 'sender' && !seenSender.has(g.name)) {
          seenSender.add(g.name);
          sender.push({ id: `${GROUP_TAG_PREFIX}${g.name}`, label: g.name });
        } else if (g.type === 'recipient' && !seenRecipient.has(g.name)) {
          seenRecipient.add(g.name);
          recipient.push({ id: `${GROUP_TAG_PREFIX}${g.name}`, label: g.name });
        }
      }
      return { sender, recipient };
    },
  });
  const senderGroups = groupsByType?.sender ?? [];
  const recipientGroups = groupsByType?.recipient ?? [];
  const senderGroupIds = useMemo(() => new Set(senderGroups.map((g) => g.id)), [senderGroups]);
  const recipientGroupIds = useMemo(() => new Set(recipientGroups.map((g) => g.id)), [recipientGroups]);
  const selectedSenderGroups = (draft.recipient_tags ?? []).filter((id) => senderGroupIds.has(id));
  const selectedRecipientGroups = (draft.recipient_tags ?? []).filter((id) => recipientGroupIds.has(id));

  // 进抽屉时快照 draft（keyed by open + rule identity，无 useEffect）。
  const baseKey = `${open ? 'open' : 'closed'}:${rule?.id ?? 'new'}:${rule?.name ?? ''}`;
  const [lastKey, setLastKey] = useState('');
  if (open && baseKey !== lastKey) {
    setLastKey(baseKey);
    const d = rule
      ? {
          ...rule,
          directions: [...rule.directions],
          recipient_tags: [...(rule.recipient_tags ?? [])],
          recipient_emails: [...(rule.recipient_emails ?? [])],
          recipient_dept_paths: [...(rule.recipient_dept_paths ?? [])],
        }
      : emptyDraft();
    setDraft(d);
    // Prefer the persisted filter_on (round-trips from rule metadata); fall
    // back to deriving from recipient_tags/emails/dept_paths for rules saved
    // before the field existed. Keeps the toggle faithful to what was saved.
    setFilterOn(
      d.filter_on ??
        ((d.recipient_tags ?? []).length > 0 ||
          (d.recipient_emails ?? []).length > 0 ||
          (d.recipient_dept_paths ?? []).length > 0),
    );
  } else if (!open && lastKey !== '') {
    setLastKey('');
  }

  const validationError = useMemo<string | null>(() => {
    if (draft.directions.length === 0) {
      return t('errors.needDirection');
    }
    if (draft.require_qrcode && draft.directions.includes('outbound')) {
      return t('errors.qrNoOutbound');
    }
    if (!draft.sender_first_seen && !draft.require_qrcode && !draft.require_clickable_attachment) {
      return t('errors.needRiskSignal');
    }
    // 收发信人筛选开启时至少选一个对象（spec §4.1 / §7；review D1）。
    if (
      filterOn &&
      (draft.recipient_tags ?? []).length === 0 &&
      (draft.recipient_emails ?? []).length === 0 &&
      (draft.recipient_dept_paths ?? []).length === 0
    ) {
      return t('errors.needRecipientTarget');
    }
    // 邮件大小上限镜像后端校验（phishing_admission.go validateAdmissionDTO：0..100000）。
    if ((draft.max_size_mb ?? 0) > 100000) {
      return t('errors.maxSizeTooLarge');
    }
    return null;
  }, [draft, filterOn, t]);

  const valid = useMemo(() => {
    if (!draft.name.trim()) return false;
    if (draft.directions.length === 0) return false;
    if (validationError) return false;
    if ((draft.max_size_mb ?? 0) < 0) return false;
    if ((draft.max_size_mb ?? 0) > 100000) return false;
    return true;
  }, [draft, validationError]);

  const patch = (p: Partial<PhishAdmissionRule>) => setDraft((cur) => ({ ...cur, ...p }));

  const toggleDirection = (d: Direction) => {
    const has = draft.directions.includes(d);
    const next = has ? draft.directions.filter((x) => x !== d) : [...draft.directions, d];
    patch({ directions: next });
  };

  // 发信人群组 / 收信人群组两个 GroupMultiSelect 各自只回传"自己那一类"的完整选中
  // 集合；写回 draft.recipient_tags 时需保留另一类已选项（两者共享同一个存储
  // 数组，按 grp: 前缀 + 群组名区分，互不冲突，因为群组管理里 sender/recipient
  // 是两个不相交的命名空间）。
  const handleSenderGroupsChange = (next: string[]) => {
    const others = (draft.recipient_tags ?? []).filter((id) => !senderGroupIds.has(id));
    patch({ recipient_tags: [...others, ...next] });
  };
  const handleRecipientGroupsChange = (next: string[]) => {
    const others = (draft.recipient_tags ?? []).filter((id) => !recipientGroupIds.has(id));
    patch({ recipient_tags: [...others, ...next] });
  };

  // 组织通讯录目标随方向自动切换语义提示：outbound 单独出现时约束的是内部
  // 发信人，其余方向（inbound/internal）约束的是收件人；混选时命中任一侧即算匹配。
  const recipientTarget = useMemo(() => {
    const dirs = draft.directions;
    const hasOutbound = dirs.includes('outbound');
    const hasOther = dirs.includes('inbound') || dirs.includes('internal');
    if (hasOutbound && hasOther) return t('targetEither');
    if (hasOutbound) return t('targetSender');
    return t('targetRecipient');
  }, [draft.directions, t]);

  // 群组策略里的发信人/收信人群组区块各自只在对应方向出现（互斥显示，与组织
  // 通讯录的方向语义一致）：勾选「外发」时只展示发信人群组；勾选「接收」/
  // 「域内」时只展示收信人群组；两类方向同时勾选则两个区块都展示。
  const showSenderGroups = draft.directions.includes('outbound');
  const showRecipientGroups = draft.directions.includes('inbound') || draft.directions.includes('internal');

  const onSave = async () => {
    if (!valid) {
      toast.error(t('validationFailed'));
      return;
    }
    const payload: PhishAdmissionRule = {
      ...draft,
      filter_on: filterOn,
      recipient_tags: filterOn ? draft.recipient_tags ?? [] : [],
      recipient_emails: filterOn ? draft.recipient_emails ?? [] : [],
      recipient_dept_paths: filterOn ? draft.recipient_dept_paths ?? [] : [],
    };
    setSaving(true);
    try {
      if (payload.id !== undefined) {
        await updateAdmissionRule(payload.id, payload, apiRequest);
      } else {
        await createAdmissionRule(payload, apiRequest);
      }
      toast.success(payload.id !== undefined ? t('updated') : t('created'));
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-[560px] flex flex-col gap-0 p-0"
        data-testid="admission-rule-sheet"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{rule ? t('editTitle') : t('createTitle')}</SheetTitle>
          <SheetDescription>{t('sheetDescription')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {/* 规则名��� */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">{t('colName')}</Label>
            <Input
              id="rule-name"
              data-testid="rule-name-input"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={t('namePlaceholder')}
            />
          </div>

          {/* ① 检测范围 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-xs font-semibold text-blue-700">
                1
              </span>
              <h4 className="text-sm font-semibold">{t('sectionScope')}</h4>
            </div>

            <div className="space-y-1.5">
              <Label>{t('colDirection')}</Label>
              <div className="flex flex-wrap gap-2" data-testid="rule-direction-group">
                {DIRECTIONS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={draft.directions.includes(d) ? 'default' : 'outline'}
                    onClick={() => toggleDirection(d)}
                    data-testid={`rule-direction-${d}`}
                  >
                    {tdir(d)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label>{t('recipientFilter')}</Label>
                <Switch
                  checked={filterOn}
                  onCheckedChange={setFilterOn}
                  data-testid="rule-recipient-filter"
                />
              </div>
              {filterOn && (
                <div className="space-y-4">
                  {/* 群组策略子区块：只引用群组管理里已有的「发信人群组」/「收信人群组」
                      两类原子群组，不再体现自由标签，也不再暴露 content 类型的关键词库
                      （内容维度与"筛选收发信人"语义无关）。按方向互斥显示，与组织通讯录
                      的方向语义保持一致。 */}
                  {showSenderGroups && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{t('senderGroupSectionLabel')}</p>
                      <GroupMultiSelect
                        options={senderGroups}
                        selected={selectedSenderGroups}
                        onChange={handleSenderGroupsChange}
                        triggerPlaceholder={t('selectSenderGroups')}
                        searchPlaceholder={t('searchGroups')}
                        emptyHint={t('noSenderGroupsHint')}
                        noMatchLabel={t('noMatch')}
                        selectedCountLabel={t('selectedCount', { n: selectedSenderGroups.length })}
                        removeLabel={t('removeTag')}
                        clearAllLabel={t('clearAll')}
                        testIdPrefix="rule-sender-group"
                      />
                    </div>
                  )}
                  {showRecipientGroups && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{t('recipientGroupSectionLabel')}</p>
                      <GroupMultiSelect
                        options={recipientGroups}
                        selected={selectedRecipientGroups}
                        onChange={handleRecipientGroupsChange}
                        triggerPlaceholder={t('selectRecipientGroups')}
                        searchPlaceholder={t('searchGroups')}
                        emptyHint={t('noRecipientGroupsHint')}
                        noMatchLabel={t('noMatch')}
                        selectedCountLabel={t('selectedCount', { n: selectedRecipientGroups.length })}
                        removeLabel={t('removeTag')}
                        clearAllLabel={t('clearAll')}
                        testIdPrefix="rule-recipient-group"
                      />
                    </div>
                  )}

                  {/* 组织通讯录：整体部门或定位到具体人员 */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t('orgSectionLabel')}</p>
                    <OrgContactTreeSelect
                      testIdPrefix="rule-org"
                      selectedDeptPaths={draft.recipient_dept_paths ?? []}
                      selectedEmails={draft.recipient_emails ?? []}
                      onDeptsChange={(paths) => patch({ recipient_dept_paths: paths })}
                      onEmailsChange={(emails) => patch({ recipient_emails: emails })}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t('recipientTagsHint', { target: recipientTarget })}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ② 风险信号 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-xs font-semibold text-amber-700">
                2
              </span>
              <h4 className="text-sm font-semibold">{t('sectionRisk')}</h4>
            </div>

            {/* 基础筛查 */}
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <h5 className="text-sm font-medium">{t('basicScreen')}</h5>
              <div className="flex items-center justify-between">
                <Label>{t('requireUrl')}</Label>
                <Switch
                  checked={draft.require_url}
                  data-testid="rule-require-url"
                  onCheckedChange={(v) => patch({ require_url: v })}
                />
              </div>
              {draft.require_url && draft.require_qrcode && (
                <p className="text-xs text-muted-foreground">{t('urlNotQRHint')}</p>
              )}
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="rule-maxsize">{t('maxSize')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="rule-maxsize"
                    type="number"
                    min={0}
                    className="h-8 w-20"
                    data-testid="rule-maxsize-input"
                    value={draft.max_size_mb ?? 0}
                    onChange={(e) =>
                      patch({ max_size_mb: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                  <span className="text-sm text-muted-foreground">MB</span>
                </div>
              </div>
            </div>

            {/* 发信人特征 */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label>{t('senderFirstSeen')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t('senderFirstSeenHint')}</p>
              </div>
              <Switch
                checked={draft.sender_first_seen}
                data-testid="rule-first-seen"
                onCheckedChange={(v) => patch({ sender_first_seen: v })}
              />
            </div>

            {/* 邮件内容：二维码 */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label>{t('qrcode')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t('qrcodeDesc')}</p>
              </div>
              <Switch
                checked={draft.require_qrcode}
                data-testid="rule-qrcode"
                onCheckedChange={(v) => patch({ require_qrcode: v })}
              />
            </div>

            {/* 邮件内容：可点击附件 */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label>{t('clickableAttachment')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t('clickableAttachmentDesc')}</p>
              </div>
              <Switch
                checked={draft.require_clickable_attachment}
                data-testid="rule-clickable-attachment"
                onCheckedChange={(v) => patch({ require_clickable_attachment: v })}
              />
            </div>

            {validationError && (
              <p
                className="text-sm text-destructive"
                data-testid="rule-validation-error"
              >
                {validationError}
              </p>
            )}
          </section>

          {/* 启用 */}
          <div className="flex items-center gap-3">
            <Switch
              id="rule-enabled"
              checked={draft.enabled}
              data-testid="rule-enabled-checkbox"
              onCheckedChange={(v) => patch({ enabled: v })}
            />
            <Label htmlFor="rule-enabled">{t('enabledLabel')}</Label>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            data-testid="rule-cancel"
          >
            {t('cancel')}
          </Button>
          <Button onClick={onSave} disabled={!valid || saving} data-testid="rule-save">
            {saving ? t('saving') : t('save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
