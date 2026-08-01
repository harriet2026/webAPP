'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Download,
  Search,
  Server,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MailLifecycleLog, MailLogDetail } from '@/types/email-disposal-detail';

interface RawLogsSectionProps {
  detail: MailLogDetail;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  // A successful request and an unrequested query both contain an empty
  // array. Keep that distinction explicit so the collapsed header never
  // claims "0 entries" before disk collection has run.
  loaded?: boolean;
  // Every item is a source line found in a real component's node-local file.
  // No mail detail field is serialized or synthesized in this section.
  logs?: MailLifecycleLog[];
  truncated?: boolean;
  // A node failure must remain visible even when other nodes returned useful
  // lines; otherwise an incomplete lifecycle looks authoritative.
  partial?: boolean;
  failedNodes?: string[];
  loading?: boolean;
  error?: boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Keep the existing 10,000-line guard and dependency-free virtualization.
// Each expanded component owns a small scroll viewport, so a pathological
// component cannot force all lifecycle rows into the DOM at once.
const VIRTUALIZE_THRESHOLD = 5000;
const ROW_HEIGHT_PX = 28;
const OVERSCAN_ROWS = 20;
const MAX_LOG_LINES = 10_000;

type LogLevel = 'INFO' | 'WARN' | 'ERROR';
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface ParsedJsonLine {
  prefix: string;
  value: JsonValue[] | { [key: string]: JsonValue };
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  INFO: 'text-blue-400',
  WARN: 'text-amber-400',
  ERROR: 'text-red-400',
};

interface LogLine {
  level: LogLevel;
  node: string;
  component: string;
  // Full authoritative source line, including its original timestamp.
  text: string;
  json: ParsedJsonLine | null;
  source: MailLifecycleLog;
}

interface RenderedLogLine extends LogLine {
  no: number;
  html: string;
}

interface LogGroup {
  key: string;
  node: string;
  component: string;
  lines: RenderedLogLine[];
}

function isJsonContainer(value: unknown): value is JsonValue[] | { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null;
}

// Structured services usually emit a pure JSONL object. Some operational
// loggers prepend a timestamp/level before that object, so also try a small
// bounded set of JSON-looking suffixes that start after whitespace. Postfix
// tokens such as smtpd[123] are intentionally not candidates.
function parseJsonLogLine(text: string): ParsedJsonLine | null {
  const firstNonWhitespace = text.search(/\S/);
  if (firstNonWhitespace < 0) return null;

  const content = text.slice(firstNonWhitespace);
  const candidateOffsets = [0];
  const suffixPattern = /\s([\[{])/g;
  let match: RegExpExecArray | null;
  while ((match = suffixPattern.exec(content)) !== null && candidateOffsets.length < 8) {
    candidateOffsets.push(match.index + match[0].length - 1);
  }

  for (const offset of candidateOffsets) {
    const candidate = content.slice(offset);
    try {
      const value: unknown = JSON.parse(candidate);
      if (!isJsonContainer(value)) continue;
      return {
        prefix: text.slice(0, firstNonWhitespace + offset).trimEnd(),
        value,
      };
    } catch {
      // Try the next bounded suffix candidate.
    }
  }
  return null;
}

function buildRawLogLines(logs: MailLifecycleLog[]): LogLine[] {
  return [...logs]
    .filter((item) => item.raw_line.length > 0)
    .sort((a, b) => {
      const byTime = (a.event_time || '').localeCompare(b.event_time || '');
      return byTime || a.event_uid.localeCompare(b.event_uid);
    })
    .map((item) => {
      const level = item.level?.toLowerCase();
      return {
        level: level === 'error' || level === 'fatal' || level === 'panic'
          ? 'ERROR'
          : level === 'warn' || level === 'warning'
            ? 'WARN'
            : 'INFO',
        node: item.node ?? '',
        component: item.component,
        text: item.raw_line,
        json: parseJsonLogLine(item.raw_line),
        source: item,
      };
    });
}

function serializeLogsByComponent(lines: LogLine[]): string {
  const grouped = new Map<string, Omit<MailLifecycleLog, 'component'>[]>();
  for (const line of lines) {
    const { component, ...entry } = line.source;
    const entries = grouped.get(component);
    if (entries) entries.push(entry);
    else grouped.set(component, [entry]);
  }
  return `${JSON.stringify(Object.fromEntries(grouped), null, 2)}\n`;
}

async function writeTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined') {
    try {
      const clipboard = navigator.clipboard;
      if (typeof clipboard?.writeText === 'function') {
        await clipboard.writeText(text);
        return;
      }
    } catch {
      // Clipboard API may be blocked outside a secure context or denied by policy.
    }
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    throw new Error('Clipboard is unavailable');
  }

  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);

  let copied = false;
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
    activeElement?.focus();
  }

  if (!copied) {
    throw new Error('Clipboard is unavailable');
  }
}

function HighlightedJsonText({ text, query }: { text: string; query: string }) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text;
  const parts = text.split(new RegExp(`(${escapeRe(normalizedQuery)})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === normalizedQuery.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded bg-yellow-300 px-0.5 text-gray-900">
        {part}
      </mark>
    ) : (
      part
    ));
}

function JsonPrimitiveValue({ value, query }: { value: JsonPrimitive; query: string }) {
  const serialized = value === null ? 'null' : JSON.stringify(value);
  const color = value === null
    ? 'text-slate-400'
    : typeof value === 'string'
      ? 'text-emerald-300'
      : typeof value === 'number'
        ? 'text-amber-300'
        : 'text-violet-300';
  return (
    <span className={color}>
      <HighlightedJsonText text={serialized} query={query} />
    </span>
  );
}

function JsonTreeNode({
  value,
  propertyName,
  depth,
  trailingComma,
  query,
}: {
  value: JsonValue;
  propertyName?: string;
  depth: number;
  trailingComma: boolean;
  query: string;
}) {
  const property = propertyName === undefined ? null : (
    <>
      <span className="text-sky-300">
        <HighlightedJsonText text={JSON.stringify(propertyName)} query={query} />
      </span>
      <span className="text-slate-400">: </span>
    </>
  );

  if (!isJsonContainer(value)) {
    return (
      <div className="min-w-0 break-all leading-5">
        {property}
        <JsonPrimitiveValue value={value} query={query} />
        {trailingComma && <span className="text-slate-400">,</span>}
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
  const opening = Array.isArray(value) ? '[' : '{';
  const closing = Array.isArray(value) ? ']' : '}';

  if (entries.length === 0) {
    return (
      <div className="min-w-0 break-all leading-5">
        {property}
        <span className="text-slate-300">{opening}{closing}</span>
        {trailingComma && <span className="text-slate-400">,</span>}
      </div>
    );
  }

  return (
    <details
      open={depth === 0}
      className="min-w-0 text-slate-300 [&[open]>summary_.json-collapsed]:hidden"
      data-json-depth={depth}
    >
      <summary className="cursor-pointer select-none break-all leading-5 marker:text-slate-500">
        {property}
        <span>{opening}</span>
        <span className="json-collapsed ml-1 text-slate-500">
          … {closing}{trailingComma ? ',' : ''}
        </span>
      </summary>
      <div className="ml-2 space-y-0.5 border-l border-slate-600/70 pl-3">
        {entries.map(([key, item], index) => (
          <JsonTreeNode
            key={key}
            value={item}
            propertyName={key}
            depth={depth + 1}
            trailingComma={index < entries.length - 1}
            query={query}
          />
        ))}
      </div>
      <div className="leading-5 text-slate-300">
        {closing}{trailingComma ? ',' : ''}
      </div>
    </details>
  );
}

function JsonLogViewer({
  line,
  query,
}: {
  line: RenderedLogLine;
  query: string;
}) {
  if (!line.json) return null;
  return (
    <div
      data-testid={`raw-log-json-viewer-${line.no}`}
      className="min-w-0 flex-1 px-3 py-1.5 font-mono text-xs"
    >
      {line.json.prefix && (
        <div className={cn('mb-1 break-all leading-5', LEVEL_COLOR[line.level])}>
          <HighlightedJsonText text={line.json.prefix} query={query} />
        </div>
      )}
      <JsonTreeNode
        value={line.json.value}
        depth={0}
        trailingComma={false}
        query={query}
      />
    </div>
  );
}

function RawLogRows({ lines, query }: { lines: RenderedLogLine[]; query: string }) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(320);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height) setViewportHeight(height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const virtualized = lines.length > VIRTUALIZE_THRESHOLD;
  const { startIndex, endIndex, topPad, bottomPad } = useMemo(() => {
    if (!virtualized) {
      return { startIndex: 0, endIndex: lines.length, topPad: 0, bottomPad: 0 };
    }
    const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + OVERSCAN_ROWS * 2;
    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS);
    const last = Math.min(lines.length, first + visibleCount);
    return {
      startIndex: first,
      endIndex: last,
      topPad: first * ROW_HEIGHT_PX,
      bottomPad: (lines.length - last) * ROW_HEIGHT_PX,
    };
  }, [lines.length, scrollTop, viewportHeight, virtualized]);

  const visibleRows = virtualized ? lines.slice(startIndex, endIndex) : lines;

  return (
    <div
      ref={scrollRef}
      onScroll={virtualized ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
      className="max-h-[320px] overflow-y-auto bg-slate-800 font-mono text-sm"
    >
      {virtualized && topPad > 0 && <div style={{ height: topPad }} aria-hidden="true" />}
      {visibleRows.map((line) => (
        <div key={line.no} data-testid={`raw-log-line-${line.no}`} className="flex items-stretch">
          <span className="w-12 shrink-0 select-none border-r border-slate-600 py-1.5 pr-3 text-right text-slate-500">
            {line.no}
          </span>
          {line.json && !virtualized ? (
            <JsonLogViewer line={line} query={query} />
          ) : (
            <pre
              className={cn('min-w-0 flex-1 whitespace-pre-wrap break-all px-3 py-1.5', LEVEL_COLOR[line.level])}
              dangerouslySetInnerHTML={{ __html: line.html }}
            />
          )}
        </div>
      ))}
      {virtualized && bottomPad > 0 && <div style={{ height: bottomPad }} aria-hidden="true" />}
    </div>
  );
}

function RawLogGroup({
  group,
  index,
  open,
  onOpenChange,
  countLabel,
  query,
}: {
  group: LogGroup;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countLabel: string;
  query: string;
}) {
  const worstLevel = group.lines.some((line) => line.level === 'ERROR')
    ? 'ERROR'
    : group.lines.some((line) => line.level === 'WARN')
      ? 'WARN'
      : 'INFO';

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-lg border bg-card"
      data-testid={`raw-log-group-${index}`}
      data-component={group.component}
      data-node={group.node}
    >
      <CollapsibleTrigger
        data-testid={`raw-log-group-trigger-${index}`}
        render={
          <button
            type="button"
            className="group flex min-h-11 w-full min-w-0 items-center gap-3 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none"
          />
        }
      >
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[panel-open]:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            worstLevel === 'ERROR'
              ? 'bg-red-500'
              : worstLevel === 'WARN'
                ? 'bg-amber-500'
                : 'bg-blue-500',
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{group.component}</span>
          {group.node && (
            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Server className="h-3 w-3 shrink-0" aria-hidden="true" />
              {group.node}
            </span>
          )}
        </span>
        <Badge variant="secondary" className="shrink-0 text-xs">
          {countLabel}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden border-t opacity-100 transition-[height,opacity] duration-200 ease-out data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
        <RawLogRows lines={group.lines} query={query} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function RawLogsSection({
  detail,
  expanded,
  onExpandedChange,
  loaded = false,
  logs = [],
  truncated = false,
  partial = false,
  failedNodes = [],
  loading = false,
  error = false,
}: RawLogsSectionProps) {
  const t = useTranslations('emailDisposal.detail.rawLogs');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const allLogLines = useMemo(() => buildRawLogLines(logs), [logs]);
  const logLines = useMemo(() => allLogLines.slice(0, MAX_LOG_LINES), [allLogLines]);
  const totalCount = logLines.length;

  const filteredLines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return logLines;
    return logLines.filter((line) =>
      line.text.toLowerCase().includes(normalizedQuery)
      || line.component.toLowerCase().includes(normalizedQuery)
      || line.node.toLowerCase().includes(normalizedQuery));
  }, [logLines, query]);

  const renderedLines = useMemo(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return filteredLines.map((line, index) => ({
        ...line,
        no: index + 1,
        html: escapeHtml(line.text),
      }));
    }
    const re = new RegExp(`(${escapeRe(escapeHtml(normalizedQuery))})`, 'gi');
    return filteredLines.map((line, index) => ({
      ...line,
      no: index + 1,
      html: escapeHtml(line.text).replace(
        re,
        '<mark class="rounded bg-yellow-300 px-0.5 text-gray-900">$1</mark>',
      ),
    }));
  }, [filteredLines, query]);

  const groups = useMemo(() => {
    const grouped = new Map<string, LogGroup>();
    for (const line of renderedLines) {
      const key = `${line.node}\u0000${line.component}`;
      const current = grouped.get(key);
      if (current) {
        current.lines.push(line);
      } else {
        grouped.set(key, {
          key,
          node: line.node,
          component: line.component,
          lines: [line],
        });
      }
    }
    return [...grouped.values()];
  }, [renderedLines]);

  const totalGroups = useMemo(() => {
    const keys = new Set(logLines.map((line) => `${line.node}\u0000${line.component}`));
    return keys.size;
  }, [logLines]);

  function setGroupOpen(key: string, open: boolean) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function copyAll() {
    const text = serializeLogsByComponent(filteredLines);
    try {
      await writeTextToClipboard(text);
      toast.success(t('copied'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  function download() {
    const text = serializeLogsByComponent(logLines);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const date = new Date().toISOString().slice(0, 10);
    anchor.download = `email-log-${detail.id}-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const statusLabel = loading
    ? t('loadingBadge')
    : error
      ? t('loadFailedBadge')
      : loaded
        ? t('entriesBadge', { count: totalCount })
        : t('notLoaded');
  const showInitialLoading = loading && !loaded;
  const controlsDisabled = !loaded || loading || error || totalCount === 0;
  const hasSearch = query.trim().length > 0;

  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      data-testid="disposal-raw-logs"
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <CollapsibleTrigger
        data-testid="disposal-raw-logs-trigger"
        render={
          <button
            type="button"
            className="group flex min-h-14 w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none"
          />
        }
      >
        <ChevronRight
          className="h-5 w-5 shrink-0 text-primary transition-transform duration-200 ease-out group-data-[panel-open]:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 text-base font-semibold">{t('title')}</span>
        {loaded && totalGroups > 0 && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t('groupsBadge', { count: totalGroups })}
          </span>
        )}
        <Badge
          variant={error ? 'destructive' : 'secondary'}
          className="shrink-0 text-xs"
          data-testid="raw-logs-count-badge"
          aria-live="polite"
        >
          {statusLabel}
        </Badge>
        {(truncated || allLogLines.length > MAX_LOG_LINES) && (
          <span className="shrink-0 text-xs text-amber-600">{t('truncated')}</span>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden border-t opacity-100 transition-[height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
        {partial && (
          <div
            data-testid="raw-logs-partial-warning"
            className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('partial', { nodes: failedNodes.join(', ') || '-' })}</span>
          </div>
        )}

        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              data-testid="disposal-raw-logs-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              disabled={controlsDisabled}
              className="w-full border-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button
            type="button"
            data-testid="disposal-raw-logs-download"
            variant="outline"
            size="sm"
            disabled={controlsDisabled}
            onClick={download}
            className="shrink-0"
          >
            <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t('downloadLog')}
          </Button>
        </div>

        <div data-testid="raw-logs-viewer" className="min-h-20 p-3">
          {showInitialLoading ? (
            <div className="flex min-h-20 items-center justify-center rounded-lg bg-muted/30 px-4 text-sm text-muted-foreground">
              {t('loading')}
            </div>
          ) : error ? (
            <div className="flex min-h-20 items-center justify-center rounded-lg bg-destructive/5 px-4 text-sm text-destructive">
              {t('loadFailed')}
            </div>
          ) : !loaded ? (
            <div className="flex min-h-20 items-center justify-center rounded-lg bg-muted/30 px-4 text-sm text-muted-foreground">
              {t('loading')}
            </div>
          ) : renderedLines.length === 0 ? (
            <div className="flex min-h-20 items-center justify-center rounded-lg bg-muted/30 px-4 text-sm text-muted-foreground">
              {query ? t('noMatch') : t('empty')}
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group, index) => (
                <RawLogGroup
                  key={group.key}
                  group={group}
                  index={index}
                  open={hasSearch || openGroups.has(group.key)}
                  onOpenChange={(open) => setGroupOpen(group.key, open)}
                  countLabel={t('entriesBadge', { count: group.lines.length })}
                  query={query}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-12 items-center justify-between gap-3 border-t px-3 py-2">
          <Button
            type="button"
            data-testid="disposal-raw-logs-copy"
            variant="ghost"
            size="sm"
            disabled={controlsDisabled}
            className="h-8 text-xs"
            onClick={copyAll}
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                {t('copied')}
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                {t('copyAll')}
              </>
            )}
          </Button>
          {query && (
            <span className="text-xs text-muted-foreground" data-testid="disposal-raw-logs-found-count">
              {t('foundCount', { matched: filteredLines.length, total: totalCount })}
            </span>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
