'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SimilarDomainConfig, AuthSpoofingAction, CheckItem } from '@/types/auth-spoofing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { CollapsibleCardTrigger } from '@/components/ui/collapsible-section-trigger';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTIONS: AuthSpoofingAction[] = ['accept', 'quarantine', 'reject', 'audit', 'discard'];

interface SimilarDomainSectionProps {
  config: SimilarDomainConfig;
  onChange: (config: SimilarDomainConfig) => void;
  disabled?: boolean;
}

export function SimilarDomainSection({ config, onChange, disabled }: SimilarDomainSectionProps) {
  const t = useTranslations('authSpoofing');
  const [open, setOpen] = useState(true);

  const enabledItem: CheckItem = {
    enabled: config.enabled,
    action: config.action,
    observe_mode: config.observe_mode,
  };

  const handleEnabledChange = (item: CheckItem) => {
    onChange({ ...config, enabled: item.enabled, action: item.action, observe_mode: item.observe_mode });
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleCardTrigger>
                <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', open && 'rotate-180')} />
                <CardTitle className="text-base font-semibold">{t('similarDomain.title')}</CardTitle>
                {config.enabled && (
                  <Badge variant="secondary" className="text-[10px] ml-2">
                    {t('action.' + config.action as any)}
                  </Badge>
                )}
              </CollapsibleCardTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <div className={cn('flex items-center gap-3 rounded-lg border p-3', !config.enabled && 'opacity-60')}>
              <Switch
                checked={config.enabled}
                onCheckedChange={(enabled) => onChange({ ...config, enabled })}
                disabled={disabled}
              />
              <div className="flex-1 text-sm font-medium">{t('similarDomain.enable')}</div>
              <div className="min-w-[140px]">
                <Select
                  value={config.action}
                  onValueChange={(v) => onChange({ ...config, action: v as AuthSpoofingAction })}
                  disabled={disabled || !config.enabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{t(`action.${config.action}` as any)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {t(`action.${a}` as any)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 min-w-[100px]">
                <Switch
                  size="sm"
                  checked={config.observe_mode}
                  onCheckedChange={(observe_mode) => onChange({ ...config, observe_mode })}
                  disabled={disabled || !config.enabled}
                />
                {config.observe_mode && config.enabled && (
                  <Badge variant="secondary" className="text-[10px]">{t('observing')}</Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('similarDomain.threshold')}</span>
                <span className="text-sm text-muted-foreground">{config.threshold}</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={config.threshold}
                onChange={(e) => onChange({ ...config, threshold: Number(e.target.value) })}
                disabled={disabled || !config.enabled}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{t('similarDomain.thresholdLoose')}</span>
                <span>{t('similarDomain.thresholdStrict')}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">{t('similarDomain.protectedDomains')}</span>
              <Textarea
                value={(config.protected_domains || []).join('\n')}
                onChange={(e) =>
                  onChange({
                    ...config,
                    protected_domains: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                  })
                }
                placeholder={t('similarDomain.protectedDomainsPlaceholder')}
                rows={4}
                disabled={disabled || !config.enabled}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">{t('similarDomain.protectedDomainsHint')}</p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
