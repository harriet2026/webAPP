'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import { listStrategies, startScan } from '@/lib/api/threat-retro';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanned: () => void;
}

const DEFAULT_WINDOW_HOURS = 8;
const MAX_WINDOW_HOURS = 24;

function toLocalInput(d: Date): string {
  // datetime-local value: YYYY-MM-DDTHH:mm (local).
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ManualScanDialog({ open, onOpenChange, onScanned }: Props) {
  const t = useTranslations('threatRetro.manualScan');
  const tc = useTranslations('common');
  const { apiRequest } = useApiRequest();
  const { isAdmin } = useTenant();

  const { data: allStrategies = [] } = useQuery({
    queryKey: ['tr-strategies'],
    queryFn: () => listStrategies(apiRequest),
    enabled: open,
  });
  const strategies = allStrategies.filter((strategy) => strategy.mode === 'deep' && strategy.status === 'enabled');

  const initialEnd = new Date();
  const initialStart = new Date(initialEnd.getTime() - DEFAULT_WINDOW_HOURS * 3_600_000);

  const [strategyId, setStrategyId] = useState<string>('');
  const [start, setStart] = useState(toLocalInput(initialStart));
  const [end, setEnd] = useState(toLocalInput(initialEnd));

  // Snapshot defaults when the dialog opens (no useEffect → no cascading renders).
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
	  const now = new Date();
	  const eightHoursAgo = new Date(now.getTime() - DEFAULT_WINDOW_HOURS * 3_600_000);
      setStrategyId(strategies[0]?.id != null ? String(strategies[0].id) : '');
	  setStart(toLocalInput(eightHoursAgo));
	  setEnd(toLocalInput(now));
    }
  }
  // Auto-select first strategy when the query resolves while dialog is already open
  // and nothing has been manually selected yet (strategies may arrive after dialog opens).
  if (open && !strategyId && strategies.length > 0) {
    setStrategyId(String(strategies[0].id));
  }

  const windowHours = useMemo(() => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
    return (e - s) / 3_600_000;
  }, [start, end]);

  const tooLarge = windowHours === null || windowHours > MAX_WINDOW_HOURS;

  const scan = useMutation({
    mutationFn: () =>
      startScan(
        {
          strategy_id: Number(strategyId),
          window_start: new Date(start).toISOString(),
          window_end: new Date(end).toISOString(),
        },
        apiRequest,
      ),
    onSuccess: () => {
      toast.success(t('toastStarted'));
      onOpenChange(false);
      onScanned();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('toastError')),
  });

  const submit = () => {
    if (!strategyId || tooLarge) return;
    scan.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('strategy')}</Label>
            <Select value={strategyId} onValueChange={(v) => setStrategyId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('strategyPlaceholder')}>
                  {(() => {
                    const selected = strategies.find((s) => String(s.id) === strategyId);
                    return selected ? selected.name : undefined;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">{t('defaultWindowHint')}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="scan-start">{t('start')}</Label>
              <Input
                id="scan-start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={cn(tooLarge && 'border-destructive')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scan-end">{t('end')}</Label>
              <Input
                id="scan-end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={cn(tooLarge && 'border-destructive')}
              />
            </div>
          </div>
          {tooLarge ? (
            <p className="text-xs text-destructive">{t('windowTooLarge')}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={scan.isPending}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={!isAdmin || !strategyId || tooLarge || scan.isPending}
            data-testid="manual-scan-submit"
          >
            {scan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
