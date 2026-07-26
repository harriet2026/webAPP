'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionTitle } from './basic-info-block';
import { NotificationPreviewDialog } from '../notification-preview-dialog';
import type { DecisionMode, RecallPolicy, ThreatRetroStrategy } from '@/types/threat-retro';

interface Props {
  draft: ThreatRetroStrategy;
  patch: (p: Partial<ThreatRetroStrategy>) => void;
  errors: { recipients?: string; confidence?: string; autoConfidence?: string; decisionTimeout?: string; maxRecall?: string; circuitBreaker?: string; exclusionTags?: string; exclusionEmails?: string };
}

const DECISION_MODES: DecisionMode[] = ['conservative', 'auto', 'semi_auto'];

export function DispositionBlock({ draft, patch, errors }: Props) {
  const t = useTranslations('threatRetroStrategy.disposition');
  const [tagInput, setTagInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const addTag = (v: string) => {
    const tag = v.trim();
    if (!tag) return;
    if (!draft.exclusions.exclude_rcpt_sys_tags.includes(tag)) {
      patch({
        exclusions: { ...draft.exclusions, exclude_rcpt_sys_tags: [...draft.exclusions.exclude_rcpt_sys_tags, tag] },
      });
    }
    setTagInput('');
  };
  const removeTag = (tag: string) =>
    patch({
      exclusions: {
        ...draft.exclusions,
        exclude_rcpt_sys_tags: draft.exclusions.exclude_rcpt_sys_tags.filter((x) => x !== tag),
      },
    });
  const addEmail = (v: string) => {
    const em = v.trim().toLowerCase();
    if (!em) return;
    if (!draft.exclusions.exclude_email_list.includes(em)) {
      patch({
        exclusions: { ...draft.exclusions, exclude_email_list: [...draft.exclusions.exclude_email_list, em] },
      });
    }
    setEmailInput('');
  };
  const removeEmail = (em: string) =>
    patch({
      exclusions: {
        ...draft.exclusions,
        exclude_email_list: draft.exclusions.exclude_email_list.filter((x) => x !== em),
      },
    });
  const [recipientInput, setRecipientInput] = useState('');
  const commitRecipient = () => {
    if (!recipientInput.trim()) return;
    if (!draft.notify.recipients.includes(recipientInput.trim())) {
      patch({
        notify: { ...draft.notify, recipients: [...draft.notify.recipients, recipientInput.trim()] },
      });
    }
    setRecipientInput('');
  };
  const removeRecipient = (em: string) =>
    patch({
      notify: { ...draft.notify, recipients: draft.notify.recipients.filter((x) => x !== em) },
    });

  return (
    <section className="space-y-4">
      <SectionTitle index={4} title={t('title')} />

      <div className="flex flex-col gap-4">
      <div className="order-2 space-y-4">
      <div className="space-y-1.5">
        <Label>{t('decisionMode')}</Label>
        <RadioGroup
          value={draft.disposition.decision_mode}
          onValueChange={(v) => patch({ disposition: { ...draft.disposition, decision_mode: (v as DecisionMode) ?? 'conservative' } })}
          className="flex gap-4"
        >
          {DECISION_MODES.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <RadioGroupItem value={m} id={`dm-${m}`} />
              <Label htmlFor={`dm-${m}`} className="cursor-pointer">
                {t(`decisionModeValue.${m}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">{t('decisionModeHint')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="auto-conf">{t('autoConfidenceThreshold')}</Label>
          <Input
            id="auto-conf"
            type="number"
            min={1}
            max={100}
            value={draft.disposition.auto_confidence_threshold}
            onChange={(e) =>
              patch({
                disposition: { ...draft.disposition, auto_confidence_threshold: Number(e.target.value) || 0 },
              })
            }
			className={errors.autoConfidence ? 'border-destructive' : ''}
          />
		  {errors.autoConfidence ? <p className="text-xs text-destructive">{t('numberInvalid')}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timeout">{t('decisionTimeoutHours')}</Label>
          <Input
            id="timeout"
            type="number"
            min={1}
			max={24}
            value={draft.disposition.decision_timeout_hours}
            onChange={(e) =>
              patch({
                disposition: { ...draft.disposition, decision_timeout_hours: Number(e.target.value) || 0 },
              })
            }
			className={errors.decisionTimeout ? 'border-destructive' : ''}
          />
		  {errors.decisionTimeout ? <p className="text-xs text-destructive">{t('numberInvalid')}</p> : null}
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <p className="text-xs font-medium text-muted-foreground">{t('recallActionSoftDelete')}</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t('unreadPolicy')}</Label>
            <Select
              value={draft.disposition.unread_policy}
              onValueChange={(v) => patch({ disposition: { ...draft.disposition, unread_policy: (v ?? 'recall') as RecallPolicy } })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{t(`policy.${draft.disposition.unread_policy}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recall">{t('policy.recall')}</SelectItem>
                <SelectItem value="notify">{t('policy.notify')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('readPolicy')}</Label>
            <Select
              value={draft.disposition.read_policy}
              onValueChange={(v) => patch({ disposition: { ...draft.disposition, read_policy: (v ?? 'notify') as RecallPolicy } })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{t(`policy.${draft.disposition.read_policy}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recall">{t('policy.recall')}</SelectItem>
                <SelectItem value="notify">{t('policy.notify')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="max-recall">{t('maxRecallPerRun')}</Label>
            <Input
              id="max-recall"
              type="number"
              min={1}
			  max={100000}
              value={draft.disposition.max_recall_per_run}
              onChange={(e) =>
                patch({
                  disposition: { ...draft.disposition, max_recall_per_run: Number(e.target.value) || 0 },
                })
              }
			  className={errors.maxRecall ? 'border-destructive' : ''}
            />
			{errors.maxRecall ? <p className="text-xs text-destructive">{t('numberInvalid')}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cb-threshold">{t('circuitBreakerThreshold')}</Label>
            <Input
              id="cb-threshold"
              type="number"
              min={1}
			  max={100000}
              value={draft.disposition.circuit_breaker_threshold}
              onChange={(e) =>
                patch({
                  disposition: { ...draft.disposition, circuit_breaker_threshold: Number(e.target.value) || 0 },
                })
              }
			  className={errors.circuitBreaker ? 'border-destructive' : ''}
            />
			{errors.circuitBreaker ? <p className="text-xs text-destructive">{t('numberInvalid')}</p> : null}
          </div>
        </div>
      </div>
      </div>

      <div className="order-3 space-y-3 rounded-lg border p-3">
        <h5 className="text-sm font-medium">{t('exclusions')}</h5>
        <div className="space-y-1.5">
          <Label>{t('excludeTags')}</Label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder={t('tagPlaceholder')}
              className={errors.exclusionTags ? 'border-destructive' : ''}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => addTag(tagInput)}>
              {t('addTag')}
            </Button>
          </div>
          {errors.exclusionTags ? <p className="text-xs text-destructive">{t('tagInvalid')}</p> : null}
          {draft.exclusions.exclude_rcpt_sys_tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {draft.exclusions.exclude_rcpt_sys_tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} aria-label="remove">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>{t('excludeEmails')}</Label>
          <div className="flex gap-2">
            <Input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addEmail(emailInput);
                }
              }}
              placeholder={t('emailPlaceholder')}
              className={errors.exclusionEmails ? 'border-destructive' : ''}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => addEmail(emailInput)}>
              {t('addEmail')}
            </Button>
          </div>
          {errors.exclusionEmails ? <p className="text-xs text-destructive">{t('recipientInvalid')}</p> : null}
          {draft.exclusions.exclude_email_list.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {draft.exclusions.exclude_email_list.map((em) => (
                <Badge key={em} variant="secondary" className="gap-1">
                  {em}
                  <button type="button" onClick={() => removeEmail(em)} aria-label="remove">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="order-1 space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <h5 className="text-sm font-medium">{t('notify')}</h5>
          <Checkbox
            checked={draft.notify.enabled}
            onCheckedChange={(checked) => patch({ notify: { ...draft.notify, enabled: Boolean(checked) } })}
            aria-label={t('notify')}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('notifyRecipients')}</Label>
          <div className="flex gap-2">
            <Input
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRecipient();
                }
              }}
              placeholder={t('emailPlaceholder')}
              className={errors.recipients ? 'border-destructive' : ''}
            />
            <Button type="button" variant="outline" size="sm" onClick={commitRecipient}>
              {t('addEmail')}
            </Button>
          </div>
          {errors.recipients ? (
            <p className="text-xs text-destructive">{t('recipientInvalid')}</p>
          ) : null}
          {draft.notify.recipients.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {draft.notify.recipients.map((em) => (
                <Badge key={em} variant="secondary" className="gap-1">
                  {em}
                  <button type="button" onClick={() => removeRecipient(em)} aria-label="remove">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-2 rounded-md bg-muted/30 p-3 text-sm">
          <label className="flex items-center gap-2"><Checkbox checked={draft.notify.high.enabled} onCheckedChange={(v) => patch({ notify: { ...draft.notify, high: { enabled: Boolean(v) } } })} />{t('highImmediate')}</label>
          <label className="flex flex-wrap items-center gap-2"><Checkbox checked={draft.notify.medium.enabled} onCheckedChange={(v) => patch({ notify: { ...draft.notify, medium: { ...draft.notify.medium, enabled: Boolean(v) } } })} />{t('mediumImmediate')}<Input type="number" min={70} max={89} className={`h-8 w-20 ${errors.confidence ? 'border-destructive' : ''}`} value={draft.notify.medium.min_confidence} onChange={(e) => patch({ notify: { ...draft.notify, medium: { ...draft.notify.medium, min_confidence: Number(e.target.value) } } })} />%</label>
          {errors.confidence ? <p className="text-xs text-destructive">{t('mediumThresholdInvalid')}</p> : null}
          <p className="text-xs text-muted-foreground">{t('mediumNoFallbackHint')}</p>
          <label className="flex flex-wrap items-center gap-2"><Checkbox checked={draft.notify.low.enabled} onCheckedChange={(v) => patch({ notify: { ...draft.notify, low: { ...draft.notify.low, enabled: Boolean(v) } } })} />{t('lowDigest')}<Input type="time" className="h-8 w-28" value={draft.notify.low.digest_time} onChange={(e) => patch({ notify: { ...draft.notify, low: { ...draft.notify.low, digest_time: e.target.value } } })} /></label>
        </div>
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{t('notifyVersionHint')}</p>
        <Button data-testid="notification-preview-open" type="button" variant="outline" onClick={() => setPreviewOpen(true)}>{t('preview')}</Button>
      </div>
      </div>
      <NotificationPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} />
    </section>
  );
}
