'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import { Bot } from 'lucide-react';
import { API_BASE } from '@/lib/api/client';
import { getTenantHeader } from '@/lib/api/logs';
import { isMockEnabled } from '@/lib/mock/storage';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { Direction } from '@/lib/api/delivery-traffic';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: { direction: Direction; start_date: string; end_date: string; tenant_id: number | null };
  snapshot: Record<string, unknown> | null;
}

export function AiAnalysisDrawer({ open, onOpenChange, filters, snapshot }: Props) {
  const t = useTranslations('deliveryTraffic.ai');
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setMarkdown('');
    setFailed(false);
    setLoading(true);

    if (isMockEnabled()) {
      setMarkdown(t('mockSummary'));
      setLoading(false);
      abortRef.current = null;
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/statistics/delivery-traffic/ai-analysis`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...getTenantHeader() },
        body: JSON.stringify({ filters, snapshot: snapshot ?? {} }),
        signal: ctrl.signal,
      });
      if (!response.ok || !response.body) throw new Error('stream unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          let event = 'message';
          let payload = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: ')) event = line.slice(7).trim();
            if (line.startsWith('data: ')) payload = line.slice(6);
          }
          if (event === 'error') throw new Error('stream error');
          if (event === 'done') return;
          if (event === 'token' && payload) {
            try {
              const token = JSON.parse(payload);
              setMarkdown((current) => current + (typeof token === 'string' ? token : payload));
            } catch {
              setMarkdown((current) => current + payload);
            }
          }
        }
      }
    } catch {
      if (!ctrl.signal.aborted) setFailed(true);
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [filters, snapshot, t]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setMarkdown('');
      setFailed(false);
      setLoading(false);
      return;
    }
    void start();
    return () => abortRef.current?.abort();
    // Opening is the explicit trigger; filter changes do not restart an active stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader><SheetTitle className="flex items-center gap-2"><Bot className="h-4 w-4" />{t('drawerTitle')}</SheetTitle></SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] pr-4">
          {loading && !markdown ? (
            <div className="space-y-2" aria-label={t('loading')}><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
          ) : failed && !markdown ? (
            <div className="space-y-2"><p className="text-sm text-muted-foreground">{t('failed')}</p><Button variant="outline" size="sm" onClick={() => void start()}>{t('retry')}</Button></div>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{markdown || t('empty')}</ReactMarkdown></div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
