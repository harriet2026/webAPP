'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { API_BASE } from '@/lib/api/client';
import { getTenantHeader } from '@/lib/api/logs';
import type { Direction, LinkAttachmentStats } from '@/lib/api/link-attachment-security';

interface AiAnalysisDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: { direction: Direction; start_date: string; end_date: string };
  snapshot: LinkAttachmentStats | null;
}

export function AiAnalysisDrawer({ open, onOpenChange, filters, snapshot }: AiAnalysisDrawerProps) {
  const t = useTranslations('linkAttachmentSecurity');
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset content whenever the drawer closes.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setMarkdown('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const startStream = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setMarkdown('');
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/statistics/link-attachment-security/ai-analysis`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...getTenantHeader(),
        },
        body: JSON.stringify({
          filters,
          snapshot: snapshot ?? {},
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        setError(t('ai.aiFailed'));
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setError(t('ai.aiFailed'));
        return;
      }
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (!part.trim()) continue;
          let evt = 'message';
          let payload = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) {
              evt = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              payload = line.slice(6);
            }
          }
          if (evt === 'error') {
            setError(t('ai.aiFailed'));
            return;
          }
          if (evt === 'token' && payload) {
            try {
              const obj = JSON.parse(payload);
              const delta = typeof obj === 'string' ? obj : obj?.delta;
              if (delta) {
                setMarkdown((prev) => prev + delta);
              }
            } catch {
              setMarkdown((prev) => prev + payload);
            }
          } else if (evt === 'done') {
            return;
          }
        }
      }
    } catch {
      if (ctrl.signal.aborted) return;
      setError(t('ai.aiFailed'));
    } finally {
      if (abortRef.current === ctrl) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [filters, snapshot, t]);

  // Kick off the SSE stream when the drawer opens. We depend on `open` so that
  // toggling closed -> open triggers a fresh request.
  useEffect(() => {
    if (open) {
      void startStream();
    }
  }, [open, startStream]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {t('ai.drawerTitle')}
          </SheetTitle>
          <SheetDescription />
        </SheetHeader>
        <ScrollArea className="flex-1 px-4">
          {error ? (
            <div className="py-4 text-sm text-destructive">{error}</div>
          ) : loading && !markdown ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none py-4">
              {markdown ? (
                <ReactMarkdown>{markdown}</ReactMarkdown>
              ) : (
                <span className="text-muted-foreground">{t('ai.loading')}</span>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
