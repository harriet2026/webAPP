'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { API_BASE } from '@/lib/api/client';
import { getTenantHeader } from '@/lib/api/logs';
import type { Direction } from '@/lib/api/security-overview';
import { isMockEnabled } from '@/lib/mock/storage';
import { mockSecurityAiMarkdown } from '@/lib/mock/security-overview-fixtures';

// 两种"没有正文"的收场（起不来 / 跑完了但是空）呈现方式相同：说明 + 重试。
// 抽出来避免两处各写一遍。
function FailureNotice({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}

export interface AiAnalysisDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: { direction: Direction; start_date: string; end_date: string };
  snapshot: Record<string, unknown> | null;
}

export function AiAnalysisDrawer({
  open,
  onOpenChange,
  filters,
  snapshot,
}: AiAnalysisDrawerProps) {
  const t = useTranslations('securityOverview');
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  // "流没有正常跑完"。至于是「压根没起来」还是「跑到一半被截断」，由是否已经收到
  // 正文推导（见下方 render）—— 不需要第二个 flag。
  const [streamFailed, setStreamFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setMarkdown('');
    setStreamFailed(false);
    setLoading(true);
    try {
      if (isMockEnabled()) {
        setMarkdown(mockSecurityAiMarkdown);
        return;
      }
      const res = await fetch(`${API_BASE}/statistics/security-overview/ai-analysis`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...getTenantHeader(),
        },
        body: JSON.stringify({ filters, snapshot: snapshot ?? {} }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        setStreamFailed(true);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
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
            if (line.startsWith('event: ')) evt = line.slice(7).trim();
            else if (line.startsWith('data: ')) payload = line.slice(6);
          }
          if (evt === 'error') {
            // 后端在「流被截断」（SSE 上界到期 / 客户端断开）时也发 error，此时
            // 可能已经流出了半篇正文。只置 failed、**不清空 markdown**：render 层
            // 据此区分「压根没起来」（无正文 → 失败 + 重试）与「跑到一半被截断」
            // （有正文 → 保留正文 + 截断提示 + 重试）。
            setStreamFailed(true);
            return;
          }
          if (evt === 'token' && payload) {
            // 后端 writeSSE 对 Data 做了 json.Marshal，token 的 Data 是一个字符串，
            // 所以 payload 必然是一个 JSON 字符串字面量。（不再保留兄弟页抄来的
            // `obj?.delta` 分支 —— 这个协议下永远不会走到，是死代码。）
            try {
              const delta = JSON.parse(payload);
              if (typeof delta === 'string' && delta) {
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
      setStreamFailed(true);
    } finally {
      if (abortRef.current === ctrl) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [filters, snapshot]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setMarkdown('');
      setStreamFailed(false);
      setLoading(false);
      return;
    }
    void startStream();
    // 卸载时必须 abort：只在 !open 分支里 abort 是不够的 —— 用户在流还没跑完时
    // 直接切走页面（或 BottomActions 因 scope 变化被卸载），那条分支根本不会执行，
    // 于是 fetch 一直挂着，服务端的 loginterpret 并发信号量槽位（max_concurrent，
    // 默认 10）也一直被占。开了又切走十次，之后所有 AI 请求都会 429。
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
    // 只在打开的那一刻起流；filters/snapshot 变化不应中途重开流。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            {t('ai.drawerTitle')}
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 px-6 py-4">
          {loading && !markdown ? (
            <div className="space-y-2" aria-label={t('ai.loading')}>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : streamFailed && !markdown ? (
            // 流没跑起来（LLM 不可达 / 非 2xx / 首个 token 之前就断）。
            <FailureNotice message={t('ai.aiFailed')} retryLabel={t('ai.retry')} onRetry={startStream} />
          ) : !streamFailed && !markdown ? (
            // 流正常跑完，却一个 token 都没有（LLM 返回空）。没有这个分支的话，
            // 用户看到的是一张只有标题的空白抽屉 —— 与"页面坏了"无从区分，恰恰是
            // GT-11984 要消除的观感。
            <FailureNotice message={t('ai.empty')} retryLabel={t('ai.retry')} onRetry={startStream} />
          ) : (
            <div className="space-y-3">
              {/* 已经流出了正文、但流没跑完 = 被截断。保留已算出的内容（丢掉它对
                  用户毫无好处），但必须明确标注这不是一份完整的分析 —— 否则管理员
                  可能照着半句建议去处置。 */}
              {streamFailed && (
                <div
                  role="alert"
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
                >
                  <p>{t('ai.truncated')}</p>
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void startStream()}>
                    {t('ai.retry')}
                  </Button>
                </div>
              )}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{markdown}</ReactMarkdown>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
