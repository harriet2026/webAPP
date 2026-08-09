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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { X } from 'lucide-react';
import { useApiRequest } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { GROUPS_LIST_QUERY, ruleToGroup } from '@/lib/api/groups';
import { createAdmissionRule, updateAdmissionRule, getAdmissionTagSuggestions } from '@/lib/api/phishing-config';
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
  const [tagInput, setTagInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [filterOn, setFilterOn] = useState(false);
  const [saving, setSaving] = useState(false);

  // 收件人/内容群组供下拉多选（spec §4.1：两类群组均可作为收件人筛选目标）。
  // 注意：后端 ListUnifiedRules 不读 group_type 参数，按 rule_class/stage/page 过滤，
  // 所以只发一次请求、在客户端按 g.type 区分（与 ContentRulesPage 一致），并按名字去重，
  // 避免重复渲染以及把 ip/sender 群组错误地暴露为收件人筛选目标。
  const { data: groups = [] } = useQuery<string[]>({
    queryKey: ['recipient-content-groups'],
    queryFn: async () => {
      const resp = await apiRequest<{ items: unknown[] }>(
        `/unified-rules?${new URLSearchParams(GROUPS_LIST_QUERY)}`,
      );
      const seen = new Set<string>();
      const names: string[] = [];
      for (const item of resp.items ?? []) {
        const g = ruleToGroup(item as Rule);
        if (!g || (g.type !== 'recipient' && g.type !== 'content')) continue;
        if (seen.has(g.name)) continue;
        seen.add(g.name);
        names.push(`grp:${g.name}`);
      }
      return names;
    },
  });

  const { data: tagSuggestions = [] } = useQuery<string[]>({
    queryKey: ['admission-tag-suggestions'],
    queryFn: () => getAdmissionTagSuggestions(apiRequest),
  });

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
        }
      : emptyDraft();
    setDraft(d);
    // Prefer the persisted filter_on (round-trips from rule metadata); fall
    // back to deriving from recipient_tags/emails for rules saved before the
    // field existed. Keeps the toggle faithful to what was saved.
    setFilterOn(d.filter_on ?? ((d.recipient_tags ?? []).length > 0 || (d.recipient_emails ?? []).length > 0));
    setTagInput('');
    setEmailInput('');
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
    // 收件人筛选开启时至少选一个对象（spec §4.1 / §7；review D1）。
    if (filterOn && (draft.recipient_tags ?? []).length === 0 && (draft.recipient_emails ?? []).length === 0) {
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

  const addTag = (v: string) => {
    const tag = v.trim();
    if (!tag) return;
    const cur = draft.recipient_tags ?? [];
    if (!cur.includes(tag)) patch({ recipient_tags: [...cur, tag] });
    setTagInput('');
  };
  const removeTag = (tag: string) =>
    patch({ recipient_tags: (draft.recipient_tags ?? []).filter((x) => x !== tag) });

  const addEmail = (v: string) => {
    const email = v.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    const cur = draft.recipient_emails ?? [];
    if (!cur.includes(email)) patch({ recipient_emails: [...cur, email] });
    setEmailInput('');
  };
  const removeEmail = (em: string) =>
    patch({ recipient_emails: (draft.recipient_emails ?? []).filter((x) => x !== em) });

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
                  {/* Tag sub-section */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t('tagSectionLabel')}</p>
                    {/* Suggestion buttons from API */}
                    {tagSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {tagSuggestions.map((tag) => {
                          const on = (draft.recipient_tags ?? []).includes(tag);
                          return (
                            <Button key={tag} type="button" size="sm" variant={on ? 'default' : 'outline'}
                              onClick={() => (on ? removeTag(tag) : addTag(tag))}>
                              {tag}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                    {/* grp: groups */}
                    {groups.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {groups.map((g) => {
                          const on = (draft.recipient_tags ?? []).includes(g);
                          return (
                            <Button key={g} type="button" size="sm" variant={on ? 'default' : 'outline'}
                              onClick={() => (on ? removeTag(g) : addTag(g))}>
                              {g.replace(/^grp:/, '')}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                    {/* Free-text input for custom tags */}
                    <div className="flex gap-2">
                      <Input
                        data-testid="rule-tag-input"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTag(tagInput);
                          }
                        }}
                        placeholder={t('tagPlaceholder')}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => addTag(tagInput)}>
                        {t('addTag')}
                      </Button>
                    </div>
                    {(draft.recipient_tags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1" data-testid="rule-tag-list">
                        {(draft.recipient_tags ?? []).map((tag) => (
                          <Badge key={tag} variant="secondary" className="gap-1">
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              aria-label={t('removeTag')}
                              className="ml-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Email sub-section */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t('emailSectionLabel')}</p>
                    <div className="flex gap-2">
                      <Input
                        data-testid="rule-email-input"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addEmail(emailInput);
                          }
                        }}
                        placeholder={t('emailPlaceholder')}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => addEmail(emailInput)}>
                        {t('addEmail')}
                      </Button>
                    </div>
                    {(draft.recipient_emails ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5" data-testid="rule-email-list">
                        {(draft.recipient_emails ?? []).map((em) => (
                          <Badge key={em} variant="secondary" className="gap-1">
                            {em}
                            <button
                              type="button"
                              onClick={() => removeEmail(em)}
                              aria-label={t('removeEmail')}
                              className="ml-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">{t('recipientTagsHint')}</p>
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
