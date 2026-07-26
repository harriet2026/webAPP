'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, type Control, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { Plus, X, Trash2, Loader2, Key, Settings, Mail, Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useApiRequest } from '@/lib/api/client';
import { toast } from 'sonner';
import type { DisposalSettings } from '@/types/disposal-settings';

interface Props {
  control: Control<DisposalSettings>;
  watch: UseFormWatch<DisposalSettings>;
  setValue: UseFormSetValue<DisposalSettings>;
}

const POLICY_OPTIONS = ['recall', 'notify', 'wait'] as const;
const NOTIFY_FREQUENCY_OPTIONS = ['realtime', 'hourly', 'daily', 'weekly'] as const;

// 触发源分组的圆点颜色：威胁情报橙、AI 检测紫（对齐 demo）
const SECTION_DOT_CLASS: Record<'threat_intel' | 'ai_detection', string> = {
  threat_intel: 'bg-orange-500',
  ai_detection: 'bg-purple-500',
};

interface RecallKey {
  id: number;
  key_id: string;
  key_secret: string;
  is_active: number;
  backend: 'coremail' | 'exchange';
  created_at: string;
  updated_at: string;
}

async function fetchRecallKeys(requestFn: ReturnType<typeof useApiRequest>['apiRequest']): Promise<RecallKey[]> {
  const resp = await requestFn<{ items: RecallKey[] }>('/recall-keys');
  return resp.items ?? [];
}

async function createRecallKey(
  data: { key_id: string; key_secret: string; backend: string },
  requestFn: ReturnType<typeof useApiRequest>['apiRequest'],
): Promise<RecallKey> {
  return requestFn<RecallKey>('/recall-keys', {
    method: 'POST',
    body: data,
  });
}

async function deleteRecallKey(
  id: number,
  requestFn: ReturnType<typeof useApiRequest>['apiRequest'],
): Promise<void> {
  return requestFn<void>(`/recall-keys/${id}`, {
    method: 'DELETE',
  });
}

export function RecallSettingsTab({ control, watch, setValue }: Props) {
  const t = useTranslations('disposalSettings');
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState('');
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [newKeyID, setNewKeyID] = useState('');
  const [newKeySecret, setNewKeySecret] = useState('');
  const [newKeyBackend, setNewKeyBackend] = useState<'coremail' | 'exchange'>('coremail');
  const [newKeySubmitting, setNewKeySubmitting] = useState(false);

  const notifyEmails = watch('recall.notify_emails');

  const { data: recallKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ['recall-keys'],
    queryFn: () => fetchRecallKeys(apiRequest),
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (id: number) => deleteRecallKey(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recall-keys'] });
      toast.success(t('keyDeleted'));
    },
    onError: () => {
      toast.error(t('keyDeleteFailed'));
    },
  });

  const [emailError, setEmailError] = useState('');

  // GT-12250：非法/重复邮箱此前是静默 return —— chip 不出现、输入框保留原值、
  // 没有任何提示，用户无从判断为什么没加上。改为把拒绝原因显示出来。
  const addEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(t('emailInvalid'));
      return;
    }
    if (notifyEmails.includes(trimmed)) {
      setEmailError(t('emailDuplicate'));
      return;
    }
    setEmailError('');
    setValue('recall.notify_emails', [...notifyEmails, trimmed], { shouldDirty: true });
    setNewEmail('');
  };

  const removeEmail = (email: string) =>
    setValue('recall.notify_emails', notifyEmails.filter((e) => e !== email), {
      shouldDirty: true,
    });

  const handleCreateKey = async () => {
    if (!newKeyID.trim() || !newKeySecret.trim()) return;
    setNewKeySubmitting(true);
    try {
      await createRecallKey(
        { key_id: newKeyID.trim(), key_secret: newKeySecret.trim(), backend: newKeyBackend },
        apiRequest,
      );
      queryClient.invalidateQueries({ queryKey: ['recall-keys'] });
      toast.success(t('keyCreated'));
      setNewKeyOpen(false);
      setNewKeyID('');
      setNewKeySecret('');
      setNewKeyBackend('coremail');
    } catch {
      toast.error(t('keyCreateFailed'));
    } finally {
      setNewKeySubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('basicSettings')}</h2>
        </div>

        <div className="flex items-center gap-4">
          <Label className="w-32 shrink-0">{t('taskTimeout')}</Label>
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="recall.task_timeout_seconds"
              render={({ field }) => (
                <Input
                  type="number"
                  min={1}
                  max={300}
                  className="w-32"
                  data-testid="disposal-settings-recall-timeout"
                  value={field.value}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                />
              )}
            />
            <span className="text-sm text-muted-foreground">{t('seconds')}</span>
          </div>
          <span className="text-xs text-muted-foreground">{t('defaultTimeoutHint')}</span>
        </div>

        <p className="text-xs text-amber-600 dark:text-amber-400">{t('recallEnginePending')}</p>
      </Card>

      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('recallPolicySettings')}</h2>
        </div>

        <div className="space-y-8">
          {(['threat_intel', 'ai_detection'] as const).map((section) => (
            <div key={section} className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${SECTION_DOT_CLASS[section]}`} />
                {t(section === 'threat_intel' ? 'threatIntel' : 'aiDetection')}
              </h3>
              <div className="ml-4 space-y-4">
                {(['read_policy', 'unread_policy'] as const).map((policyField) => {
                  const rw = policyField === 'read_policy' ? 'read' : 'unread';
                  return (
                    <div key={policyField} className="space-y-2">
                      <Label>{t(policyField === 'read_policy' ? 'readEmail' : 'unreadEmail')}</Label>
                      <Controller
                        control={control}
                        name={`recall.${section}.${policyField}`}
                        render={({ field }) => (
                          <RadioGroup value={field.value} onValueChange={field.onChange}>
                            {POLICY_OPTIONS.map((opt) => (
                              <div key={opt} className="flex items-center space-x-2">
                                <RadioGroupItem
                                  value={opt}
                                  data-testid={`disposal-settings-policy-${section}-${rw}-${opt}`}
                                />
                                <Label
                                  className="font-normal cursor-pointer"
                                  onClick={() => field.onChange(opt)}
                                >
                                  {t(`policy_${opt}`)}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 space-y-6" data-testid="disposal-settings-recall-keys">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('recallKeys')}</h2>
          <Button
            variant="outline"
            size="sm"
            data-testid="disposal-settings-recall-key-new"
            onClick={() => setNewKeyOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('newRecallKey')}
          </Button>
        </div>

        {keysLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : recallKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Key className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">{t('noRecallKeys')}</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('keyId')}</TableHead>
                  <TableHead>{t('agentType')}</TableHead>
                  <TableHead>{t('keySecret')}</TableHead>
                  <TableHead className="w-[80px]">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recallKeys.map((rk) => (
                  <TableRow key={rk.id} data-testid={`disposal-settings-recall-key-row-${rk.id}`}>
                    <TableCell className="font-medium font-mono text-xs">{rk.key_id}</TableCell>
                    <TableCell>
                      <Badge variant={rk.backend === 'exchange' ? 'default' : 'secondary'}>
                        {rk.backend === 'coremail' ? t('coremailAgent') : t('exchangeAgent')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">
                      {rk.key_secret}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        data-testid={`disposal-settings-recall-key-delete-${rk.id}`}
                        onClick={() => deleteKeyMutation.mutate(rk.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('recallNotificationSettings')}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label>{t('adminEmail')}</Label>
            <div className="mt-2 flex gap-2">
              <Input
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  if (emailError) setEmailError('');
                }}
                aria-invalid={emailError ? true : undefined}
                placeholder={t('enterEmailAddress')}
                data-testid="disposal-settings-recall-email-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEmail();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                data-testid="disposal-settings-recall-email-add"
                onClick={addEmail}
              >
                {t('add')}
              </Button>
            </div>
            {emailError && (
              <p
                className="mt-1 text-sm text-destructive"
                role="alert"
                data-testid="disposal-settings-recall-email-error"
              >
                {emailError}
              </p>
            )}
          </div>

          {notifyEmails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {notifyEmails.map((email) => (
                <span
                  key={email}
                  data-testid={`disposal-settings-recall-email-chip-${email}`}
                  className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  <Mail className="h-4 w-4" />
                  {email}
                  <button type="button" onClick={() => removeEmail(email)}>
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('recallNotifyFrequency')}</Label>
            <Controller
              control={control}
              name="recall.notify_frequency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" data-testid="disposal-settings-recall-frequency">
                    <SelectValue>{(v) => (v ? t(`rfreq_${v}`) : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFY_FREQUENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {t(`rfreq_${opt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </Card>

      <Dialog open={newKeyOpen} onOpenChange={setNewKeyOpen}>
        <DialogContent className="max-w-sm rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{t('newRecallKey')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('keyId')}</Label>
              <Input
                value={newKeyID}
                onChange={(e) => setNewKeyID(e.target.value)}
                placeholder={t('keyIdPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('keySecret')}</Label>
              <Input
                type="password"
                value={newKeySecret}
                onChange={(e) => setNewKeySecret(e.target.value)}
                placeholder={t('keySecretPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('agentType')}</Label>
              <RadioGroup
                value={newKeyBackend}
                onValueChange={(v) => setNewKeyBackend(v as 'coremail' | 'exchange')}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="coremail" />
                  <Label className="cursor-pointer" onClick={() => setNewKeyBackend('coremail')}>
                    {t('coremailAgent')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="exchange" />
                  <Label className="cursor-pointer" onClick={() => setNewKeyBackend('exchange')}>
                    {t('exchangeAgent')}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewKeyOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleCreateKey}
              disabled={!newKeyID.trim() || !newKeySecret.trim() || newKeySubmitting}
            >
              {newKeySubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
