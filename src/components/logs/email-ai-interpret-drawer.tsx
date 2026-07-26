'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchSSE, buildAIInterpretURL, type SSEEvent } from '@/lib/api/logs';
import { Copy, RefreshCw, ChevronDown, ChevronRight, Loader2, Sparkles, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Switch } from '@/components/ui/switch';

interface ToolCallEntry {
  name: string;
  args: Record<string, unknown>;
  ok?: boolean;
  ruleId?: number;
  ruleName?: string;
  page?: string;
}

interface EmailAIInterpretDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailId: number | null;
}

type Phase = 'idle' | 'starting' | 'querying_rules' | 'interpreting' | 'done' | 'error';

export function EmailAIInterpretDrawer({ open, onOpenChange, emailId }: EmailAIInterpretDrawerProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>('idle');
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [showThinking, setShowThinking] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const phaseRef = useRef<Phase>('idle');

  const cleanup = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const startInterpretation = useCallback(() => {
    cleanup();
    setPhase('starting');
    phaseRef.current = 'starting';
    setToolCalls([]);
    setMarkdown('');
    setThinkingContent('');
    setErrorMsg(null);

    if (!emailId) return;

    const abort = new AbortController();
    abortRef.current = abort;

    const url = buildAIInterpretURL(emailId, locale, showThinking);

    const handleError = (serverMsg: string) => {
      if (phaseRef.current === 'done') return;
      setErrorMsg(serverMsg || t('logs.email.aiInterpret.errors.llmUnavailable'));
      setPhase('error');
      phaseRef.current = 'error';
      cleanup();
    };

    const processStream = async () => {
      try {
        for await (const ev of fetchSSE(url)) {
          if (abort.signal.aborted) return;

          switch (ev.event) {
            case 'start':
              setPhase('starting');
              phaseRef.current = 'starting';
              break;
            case 'tool_call': {
              const data = JSON.parse(ev.data);
              setPhase('querying_rules');
              phaseRef.current = 'querying_rules';
              setToolCalls((prev) => [...prev, { name: data.name, args: data.args || {} }]);
              break;
            }
            case 'tool_result': {
              const data = JSON.parse(ev.data);
              setToolCalls((prev) => {
                const copy = [...prev];
                if (copy.length > 0) {
                  copy[copy.length - 1] = {
                    ...copy[copy.length - 1],
                    ok: data.ok,
                    ruleId: data.rule_id,
                    ruleName: data.rule_name,
                    page: data.page,
                  };
                }
                return copy;
              });
              break;
            }
            case 'thinking': {
              const data = JSON.parse(ev.data);
              setPhase('interpreting');
              phaseRef.current = 'interpreting';
              setThinkingContent((prev) => prev + (data.delta || ''));
              break;
            }
            case 'token': {
              const data = JSON.parse(ev.data);
              setPhase('interpreting');
              phaseRef.current = 'interpreting';
              setMarkdown((prev) => prev + (data.delta || ''));
              break;
            }
            case 'done':
              setPhase('done');
              phaseRef.current = 'done';
              cleanup();
              break;
            case 'error': {
              let serverMsg = '';
              try {
                const parsed = JSON.parse(ev.data);
                serverMsg = parsed?.message || '';
              } catch {}
              handleError(serverMsg);
              return;
            }
          }
        }
      } catch {
        if (abort.signal.aborted) return;
        handleError('');
      }
    };

    processStream();
  }, [emailId, locale, showThinking, cleanup, t]);

  useEffect(() => {
    if (open && emailId) {
      startInterpretation();
    }
    if (!open) {
      cleanup();
      setPhase('idle');
      phaseRef.current = 'idle';
      setToolCalls([]);
      setMarkdown('');
      setThinkingContent('');
      setErrorMsg(null);
    }
    return cleanup;
  }, [open, emailId, startInterpretation, cleanup]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {}
  }, [markdown]);

  const handleRegenerate = useCallback(() => {
    startInterpretation();
  }, [startInterpretation]);

  const phaseLabels: Record<Phase, string> = {
    idle: '',
    starting: t('logs.email.aiInterpret.phase.starting'),
    querying_rules: t('logs.email.aiInterpret.phase.queryingRules'),
    interpreting: t('logs.email.aiInterpret.phase.interpreting'),
    done: t('logs.email.aiInterpret.phase.done'),
    error: '',
  };

  const phaseOrder: Phase[] = ['starting', 'querying_rules', 'interpreting', 'done'];
  const currentPhaseIdx = phaseOrder.indexOf(phase);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col p-0">
        <SheetHeader className="shrink-0 border-b border-border/70 px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t('logs.email.aiInterpret.title')}
            <div className="ml-auto flex items-center gap-2 pr-6">
              <span className="text-xs text-muted-foreground">{t('logs.email.aiInterpret.showThinking')}</span>
              <Switch
                checked={showThinking}
                onCheckedChange={setShowThinking}
                aria-label={t('logs.email.aiInterpret.showThinking')}
              />
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          {phase !== 'idle' && phase !== 'error' && (
            <div className="shrink-0 px-6 py-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                {phaseOrder.map((p, i) => (
                  <div key={p} className="flex items-center gap-2">
                    {i > 0 && <div className="w-6 h-px bg-border" />}
                    <div className={`flex items-center gap-1.5 text-xs ${i <= currentPhaseIdx ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {i < currentPhaseIdx && <span className="text-green-500">✓</span>}
                      {i === currentPhaseIdx && (phase === 'done' ? <span className="text-green-500">✓</span> : <Loader2 className="h-3 w-3 animate-spin" />)}
                      {i > currentPhaseIdx && <span className="w-3 h-3 rounded-full border border-muted-foreground/40" />}
                      <span>{phaseLabels[p]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase === 'error' && errorMsg && (
            <div className="shrink-0 px-6 py-3 border-b border-border/40">
              <p className="text-sm text-destructive">{errorMsg}</p>
            </div>
          )}

          {toolCalls.length > 0 && (
            <div className="shrink-0 px-6 py-2 border-b border-border/40">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setToolsExpanded(!toolsExpanded)}
              >
                {toolsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {t('logs.email.aiInterpret.toolCalls', { count: toolCalls.length })}
              </button>
              {toolsExpanded && (
                <div className="mt-2 space-y-1">
                  {toolCalls.map((tc, i) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span>{tc.ok !== undefined ? (tc.ok ? '✓' : '✗') : '⋯'}</span>
                      <span>
                        {tc.ruleName
                          ? t('logs.email.aiInterpret.ruleQuery', { id: tc.ruleId ?? '?', page: tc.ruleName })
                          : tc.ruleId
                            ? t('logs.email.aiInterpret.ruleQuery', { id: tc.ruleId, page: tc.page || tc.name })
                            : `${tc.name}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {thinkingContent && (
            <div className="shrink-0 px-6 py-2 border-b border-border/40">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setThinkingExpanded(!thinkingExpanded)}
              >
                {thinkingExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Brain className="h-3 w-3" />
                {t('logs.email.aiInterpret.thinkingProcess')}
              </button>
              {thinkingExpanded && (
                <div className="mt-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {thinkingContent}
                </div>
              )}
            </div>
          )}

          <ScrollArea className="flex-1 px-6 py-4">
            {markdown && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{markdown}</ReactMarkdown>
              </div>
            )}
            {phase !== 'idle' && phase !== 'error' && !markdown && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="shrink-0 border-t border-border/70 px-6 py-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!markdown}
          >
            <Copy className="mr-1 h-4 w-4" />
            {t('logs.email.aiInterpret.copyMarkdown')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={phase !== 'done' && phase !== 'error'}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            {t('logs.email.aiInterpret.regenerate')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
