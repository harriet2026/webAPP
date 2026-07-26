'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AuthSpoofingAction, CheckItem, FormatChecksConfig } from '@/types/auth-spoofing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { FORMAT_ACTIONS } from './CheckItemRow';
import { formatActionKey } from '@/lib/auth-spoofing-labels';
import { ChevronDown, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const FORMAT_KEYS: { key: keyof FormatChecksConfig; labelKey: string; descKey: string; warningKey?: string }[] = [
  { key: 'mailfrom_empty', labelKey: 'formatChecks.mailFromEmpty', descKey: 'formatChecks.mailFromEmptyDesc', warningKey: 'mailfromEmptyWarning' },
  { key: 'mailfrom_invalid', labelKey: 'formatChecks.mailFromInvalid', descKey: 'formatChecks.mailFromInvalidDesc' },
  { key: 'envelope_header_mismatch', labelKey: 'formatChecks.envelopeHeaderMismatch', descKey: 'formatChecks.envelopeHeaderDesc', warningKey: 'envelopeMismatchWarning' },
];

interface FormatChecksSectionProps {
  config: FormatChecksConfig;
  onChange: (config: FormatChecksConfig) => void;
  disabled?: boolean;
}

interface FormatCheckCardProps {
  labelKey: string;
  descKey: string;
  warningKey?: string;
  item: CheckItem;
  onChange: (item: CheckItem) => void;
  disabled?: boolean;
}

function FormatCheckCard({ labelKey, descKey, warningKey, item, onChange, disabled }: FormatCheckCardProps) {
  const t = useTranslations('authSpoofing');
  const [pendingEnable, setPendingEnable] = useState(false);

  const handleEnableChange = (enabled: boolean) => {
    if (enabled && warningKey) {
      setPendingEnable(true);
    } else {
      // Sync observe off when the check is turned off (demo behavior), so a
      // saved config never carries { enabled: false, observe_mode: true }.
      onChange({ ...item, enabled, ...(enabled ? {} : { observe_mode: false }) });
    }
  };

  const isHighRisk =
    (item.action === 'reject' || item.action === 'discard') && !item.observe_mode && item.enabled;

  return (
    <div
      className={cn(
        'rounded-lg border bg-gray-50 p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900',
        !item.enabled && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Switch checked={item.enabled} onCheckedChange={handleEnableChange} disabled={disabled} />
          <span className="text-sm font-medium">{t(labelKey as any)}</span>
          {item.observe_mode && item.enabled && (
            <span className="flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              {t('observing')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Switch
            size="sm"
            checked={item.observe_mode}
            onCheckedChange={(observe_mode) => onChange({ ...item, observe_mode })}
            disabled={disabled || !item.enabled}
            className="data-checked:bg-blue-500"
          />
          <span className={cn('text-xs', !item.enabled && 'text-muted-foreground')}>{t('observe')}</span>
        </div>
      </div>

      {item.enabled && (
        <>
          <div className="flex items-center gap-3 pl-12">
            {item.observe_mode ? (
              <div className="flex items-center gap-2 rounded bg-gray-100 px-3 py-1.5 text-sm text-muted-foreground dark:bg-gray-800">
                {t('observingRecordOnly')}
              </div>
            ) : (
              <Select
                value={item.action}
                onValueChange={(v) => onChange({ ...item, action: v as AuthSpoofingAction })}
                disabled={disabled || !item.enabled}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue>{t(formatActionKey(item.action) as any)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {t(formatActionKey(a) as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isHighRisk && (
            <div className="ml-12 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">{t('highRiskWarning')}</p>
            </div>
          )}

          <div className="flex items-start gap-2 pl-12">
            <Info className="h-4 w-4 flex-shrink-0 text-blue-500 mt-0.5" />
            <p className="text-xs text-muted-foreground">{t(descKey as any)}</p>
          </div>
        </>
      )}

      {warningKey && (
        <AlertDialog
          open={pendingEnable}
          onOpenChange={(open) => {
            if (!open) setPendingEnable(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
                {t(`${warningKey}.title` as any)}
              </AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line">
                {t(`${warningKey}.desc` as any)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t(`${warningKey}.cancel` as any)}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => {
                  onChange({ ...item, enabled: true });
                  setPendingEnable(false);
                }}
              >
                {t(`${warningKey}.confirm` as any)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export function FormatChecksSection({ config, onChange, disabled }: FormatChecksSectionProps) {
  const t = useTranslations('authSpoofing');
  const [open, setOpen] = useState(true);

  const handleChange = (key: keyof FormatChecksConfig, item: CheckItem) => {
    onChange({ ...config, [key]: item });
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 cursor-pointer w-full text-left bg-transparent border-0 p-0"
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                <CardTitle className="text-base font-semibold">{t('formatChecks.title')}</CardTitle>
              </button>
            }
          />
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {FORMAT_KEYS.map(({ key, labelKey, descKey, warningKey }) => (
              <FormatCheckCard
                key={key}
                labelKey={labelKey}
                descKey={descKey}
                warningKey={warningKey}
                item={config[key]}
                onChange={(item) => handleChange(key, item)}
                disabled={disabled}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
