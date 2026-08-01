'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AuthSpoofingAction, CheckItem, ProtocolChecksConfig, Template } from '@/types/auth-spoofing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { CollapsibleCardTrigger } from '@/components/ui/collapsible-section-trigger';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { AuthFlowDiagram } from './AuthFlowDiagram';
import { ConfigHealthPanel } from './ConfigHealthPanel';
import { DkimOutboundSigningSection } from './DkimOutboundSigningSection';
import { applyTemplate } from '@/lib/auth-spoofing-templates';
import { protocolActionShortKey, protocolActionDescKey, dominantAction } from '@/lib/auth-spoofing-labels';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const PROTOCOL_GROUPS: { key: 'spf' | 'dkim' | 'dmarc' | 'ptr'; labelKey: string; keys: string[] }[] = [
  { key: 'spf', labelKey: 'protocolChecks.spf', keys: ['fail', 'softfail', 'none', 'temperror'] },
  { key: 'dkim', labelKey: 'protocolChecks.dkim', keys: ['fail', 'neutral', 'partial', 'none'] },
  { key: 'dmarc', labelKey: 'protocolChecks.dmarc', keys: ['reject', 'quarantine', 'none', 'no_record', 'query_fail'] },
  { key: 'ptr', labelKey: 'protocolChecks.ptr', keys: ['norecord', 'temperror', 'ehlomismatch', 'amismatch'] },
];

/** DMARC has no "accept" option (demo: block/drop/quarantine/tag only); the rest offer all 5 unified actions. */
const PROTOCOL_ACTIONS: AuthSpoofingAction[] = ['reject', 'discard', 'quarantine', 'audit', 'accept'];
const DMARC_ACTIONS: AuthSpoofingAction[] = ['reject', 'discard', 'quarantine', 'audit'];

const TEMPLATE_NAMES: Template[] = ['loose', 'standard', 'strict', 'custom'];

interface ProtocolChecksSectionProps {
  config: ProtocolChecksConfig;
  onChange: (config: ProtocolChecksConfig) => void;
  disabled?: boolean;
  ptrReadonly?: boolean;
  /** Estimated count of mail that would have been dropped, shown next to the global observe switch (Task 9 wires the real value) */
  wouldDrop?: number;
}

export function ProtocolChecksSection({ config, onChange, disabled, ptrReadonly, wouldDrop = 0 }: ProtocolChecksSectionProps) {
  const t = useTranslations('authSpoofing');
  const [open, setOpen] = useState(true);
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  const [activeTab, setActiveTab] = useState<'spf' | 'dkim' | 'dmarc' | 'ptr'>('spf');

  const lockNonCustom = disabled || config.template !== 'custom';

  const handleTemplateSelect = (name: Template) => {
    if (name === config.template) return;
    setPendingTemplate(name);
  };

  const confirmTemplate = () => {
    if (!pendingTemplate) return;
    if (pendingTemplate === 'custom') {
      // Switch to custom WITHOUT running applyTemplate: keep the current action
      // values but unlock the per-protocol Selects (lockNonCustom becomes false).
      onChange({ ...config, template: 'custom' });
    } else {
      const applied = applyTemplate(config, pendingTemplate);
      onChange(pendingTemplate === 'strict' ? { ...applied, observe_mode: true } : applied);
    }
    setPendingTemplate(null);
  };

  const handleCheckChange = (group: string, subkey: string, item: CheckItem) => {
    const currentGroup = config[group as keyof Omit<ProtocolChecksConfig, 'template'>] as Record<string, CheckItem>;
    const currentItem = currentGroup[subkey];
    const actionChanged = currentItem?.action !== item.action;
    onChange({
      ...config,
      [group]: { ...currentGroup, [subkey]: item },
      ...(actionChanged ? { template: 'custom' as Template } : {}),
    });
  };

  const flowFailActions: Record<'spf' | 'dkim' | 'dmarc' | 'ptr', AuthSpoofingAction> = {
    spf: dominantAction(config.spf),
    dkim: dominantAction(config.dkim),
    dmarc: dominantAction(config.dmarc),
    ptr: dominantAction(config.ptr),
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleCardTrigger>
                <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', open && 'rotate-180')} />
                <CardTitle className="text-base font-semibold">{t('protocolChecks.title')}</CardTitle>
              </CollapsibleCardTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 space-y-4 dark:border-blue-800 dark:from-blue-950/30 dark:to-indigo-950/30">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{t('policyTemplate')}:</span>
                  <div className="flex gap-1 p-1 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    {TEMPLATE_NAMES.map((name) => (
                      <Button
                        key={name}
                        variant={config.template === name ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleTemplateSelect(name)}
                        disabled={disabled}
                      >
                        {t(`protocolChecks.template.${name}` as any)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config.observe_mode ?? false}
                      onCheckedChange={(observe_mode) => onChange({ ...config, observe_mode })}
                      disabled={disabled}
                    />
                    <span className="text-sm font-medium">{t('globalObserve')}</span>
                  </div>
                  {config.observe_mode && (
                    <div className="flex items-center gap-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                      {t('wouldDropCount')}: {wouldDrop}
                    </div>
                  )}
                </div>
              </div>


            </div>

            <AuthFlowDiagram failActions={flowFailActions} activeTab={activeTab} onNodeClick={setActiveTab} />

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList>
                {PROTOCOL_GROUPS.map((g) => (
                  <TabsTrigger key={g.key} value={g.key}>
                    {t(g.labelKey as any)}
                  </TabsTrigger>
                ))}
              </TabsList>

              {PROTOCOL_GROUPS.map((g) => (
                <TabsContent key={g.key} value={g.key}>
                  <div className="space-y-3 pt-2">
                    {g.key === 'spf' && config.spf?.fail?.action === 'discard' && (
                      <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        {t('spfDropAlert')}
                      </div>
                    )}
                    {g.key === 'ptr' && ptrReadonly && (
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                        {t('protocolChecks.ptrReadonlyNotice')}
                      </div>
                    )}
                    {g.keys.map((subkey) => {
                      // Always render every defined subkey row; if the loaded config
                      // omits it (e.g. an older backend payload), fall back to a default
                      // item so the demo's full row set still shows and Save writes it back.
                      const item: CheckItem = config[g.key]?.[subkey] ?? { enabled: false, action: 'accept', observe_mode: false };
                      const label = t(`protocolChecks.${g.key}_${subkey}` as any);
                      const desc = t(`protocolChecks.${g.key}_${subkey}Desc` as any);
                      const isDisabled = lockNonCustom || (g.key === 'ptr' && ptrReadonly);
                      const actions = g.key === 'dmarc' ? DMARC_ACTIONS : PROTOCOL_ACTIONS;
                      return (
                        <div
                          key={subkey}
                          className="flex items-center justify-between gap-3 rounded-lg border bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900"
                        >
                          <div>
                            <div className="text-sm font-medium">{label}</div>
                            <div className="text-xs text-muted-foreground">{desc}</div>
                          </div>
                          <Select
                            value={item.action}
                            onValueChange={(v) =>
                              handleCheckChange(g.key, subkey, {
                                ...item,
                                action: v as AuthSpoofingAction,
                                enabled: (v as AuthSpoofingAction) !== 'accept',
                              })
                            }
                            disabled={isDisabled}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue>{t(protocolActionShortKey(item.action) as any)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false} className="w-72">
                              {actions.map((a) => (
                                <SelectItem key={a} value={a}>
                                  <div className="flex flex-col gap-0.5 py-0.5">
                                    <span>{t(protocolActionShortKey(a) as any)}</span>
                                    <span className="text-xs text-muted-foreground whitespace-normal leading-snug">
                                      {t(protocolActionDescKey(a) as any)}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            <ConfigHealthPanel config={config} onChange={onChange} />

            {/* DKIM 外发签名子卡：与上方 SPF/DKIM/DMARC/PTR「入站校验」正交，管理本
                租户外发邮件的 DKIM 签名密钥（生成/导入/发布 DNS/校验/激活）。自带
                租户作用域与权限门控，不接入 AuthSpoofingConfig 的统一保存流。 */}
            <DkimOutboundSigningSection />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={pendingTemplate !== null} onOpenChange={(open) => { if (!open) setPendingTemplate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('protocolChecks.templateConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('protocolChecks.templateConfirmDesc', { template: pendingTemplate ? t(`protocolChecks.template.${pendingTemplate}` as any) : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingTemplate && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                <p className="text-xs text-muted-foreground">{t(`templateDesc.${pendingTemplate}` as Parameters<typeof t>[0])}</p>
              </div>
              {pendingTemplate === 'strict' && (
                <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-xs text-amber-700 dark:text-amber-300">{t('strictObserveNotice')}</p>
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('protocolChecks.templateCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTemplate}>{t('protocolChecks.templateApply')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
