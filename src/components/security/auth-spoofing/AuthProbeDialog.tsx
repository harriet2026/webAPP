'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiRequest } from '@/lib/api/client';
import { probeAuthSpoofing } from '@/lib/api/auth-spoofing';
import type { ProbeResponse } from '@/types/auth-spoofing';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const RESULT_OPTIONS = ['pass', 'fail', 'neutral', 'none', 'softfail', 'temperror', 'permerror', 'nomatch', 'noptr', 'ehlo_mismatch'];

interface AuthProbeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthProbeDialog({ open, onOpenChange }: AuthProbeDialogProps) {
  const t = useTranslations('authSpoofing');
  const { apiRequest } = useApiRequest();

  const [clientIp, setClientIp] = useState('');
  const [sender, setSender] = useState('');
  const [fromHeader, setFromHeader] = useState('');
  const [recipients, setRecipients] = useState('');
  const [spfResult, setSpfResult] = useState('none');
  const [dkimResult, setDkimResult] = useState('none');
  const [dmarcResult, setDmarcResult] = useState('none');
  const [ptrResult, setPtrResult] = useState('nomatch');

  const [result, setResult] = useState<ProbeResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleProbe = async () => {
    if (!clientIp.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const rcpts = recipients.split(',').map((s) => s.trim()).filter(Boolean);
      const resp = await probeAuthSpoofing({
        client_ip: clientIp.trim(),
        sender: sender.trim(),
        from_header: fromHeader.trim() || undefined,
        recipients: rcpts.length > 0 ? rcpts : undefined,
        spf_result: spfResult,
        dkim_result: dkimResult,
        dmarc_result: dmarcResult,
        ptr_result: ptrResult,
      }, apiRequest);
      setResult(resp);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const actionColor = (action: string) => {
    switch (action) {
      case 'accept': return 'text-green-600 bg-green-50 dark:bg-green-950/30';
      case 'quarantine': return 'text-amber-600 bg-amber-50 dark:bg-amber-950/30';
      case 'reject': return 'text-red-600 bg-red-50 dark:bg-red-950/30';
      default: return 'text-gray-600 bg-gray-50 dark:bg-gray-950/30';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('probe.title')}</DialogTitle>
          <DialogDescription>{t('probe.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('probe.clientIp')} *</Label>
              <Input value={clientIp} onChange={(e) => setClientIp(e.target.value)} placeholder="1.2.3.4" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('probe.sender')} *</Label>
              <Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('probe.fromHeader')}</Label>
              <Input value={fromHeader} onChange={(e) => setFromHeader(e.target.value)} placeholder="Display <user@example.com>" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('probe.recipients')}</Label>
              <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="rcpt1@x.com, rcpt2@y.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([
              { label: 'SPF', value: spfResult, set: setSpfResult, options: ['pass', 'fail', 'neutral', 'none', 'softfail', 'temperror', 'permerror'] },
              { label: 'DKIM', value: dkimResult, set: setDkimResult, options: ['pass', 'fail', 'neutral', 'none', 'temperror'] },
              { label: 'DMARC', value: dmarcResult, set: setDmarcResult, options: ['pass', 'fail', 'none'] },
              { label: 'PTR', value: ptrResult, set: setPtrResult, options: ['match', 'nomatch', 'noptr', 'ehlo_mismatch'] },
            ] as const).map((field) => (
              <div key={field.label} className="space-y-1">
                <Label className="text-xs">{field.label}</Label>
                <div className="flex flex-wrap gap-1">
                  {field.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={cn(
                        'px-2 py-0.5 text-[11px] rounded border transition-colors',
                        field.value === opt
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                      onClick={() => field.set(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button onClick={handleProbe} disabled={loading || !clientIp.trim() || !sender.trim()} className="w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t('probe.run')}
          </Button>

          {result && (
            <div className="space-y-3 border rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('probe.finalAction')}:</span>
                <Badge className={cn('text-xs', actionColor(result.final_action))}>
                  {result.final_action}
                </Badge>
              </div>

              {result.hits.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{t('probe.hits')}</div>
                  {result.hits.map((hit, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs rounded border p-2">
                      <Badge variant="outline" className="text-[10px]">{hit.rule_name}</Badge>
                      <span className="text-muted-foreground">{hit.subfeature}/{hit.subkey}</span>
                      <Badge className={cn('text-[10px]', actionColor(hit.action))}>{hit.action}</Badge>
                      {hit.observed && (
                        <Badge variant="secondary" className="text-[10px]">{t('observing')}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">{t('probe.noHits')}</div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('probe.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
