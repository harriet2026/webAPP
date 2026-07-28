'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Check, ChevronDown, Copy, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { MailLogDetail } from '@/types/email-disposal-detail';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { formatTimestamp } from '@/lib/format-time';
import { deriveThreatLevel, mailTypeConfig } from '../lib/detail-helpers';
import { formatHitDetail, getActionLabel, getModuleName, type DisposalLang } from '../lib/disposal-basis-config';

interface RawLogsSectionProps {
  detail: MailLogDetail;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 单封上限 10,000 行超出虚拟滚动 (spec §3.9，KEEP): above this many rendered
// rows we window the list instead of rendering every row. No virtualization
// library exists yet in webapp/package.json (checked; none used elsewhere in
// src/ either), so this is a minimal, dependency-free windowing approach
// rather than a new dependency for one feature -- see the DD-11 report.
// Bounded in practice by recipient/attachment/event counts on a single mail
// (not by an arbitrary JSON dump anymore), but kept for the pathological
// case of a very large distribution list.
const VIRTUALIZE_THRESHOLD = 5000;
const ROW_HEIGHT_PX = 28; // matches the px-3 py-1.5 text-sm font-mono row sizing below
const OVERSCAN_ROWS = 20;
const MAX_LOG_LINES = 10_000;

// v2 html_spec `logLevelColors` (webapp/doc/html-spec/
// email-handling-disposal-center/layer-13-detail-raw-logs.html §日志级别配色):
// CONNECT/SCAN=emerald, INFO/ENGINE/DELIVER=blue, ANALYZE/AUTH=purple,
// WARN=amber, THREAT/ALERT/ERROR=red, DECISION/POLICY=cyan, ACTION=orange.
// Our synthesized tags map 1:1 onto those 8 tiers rather than reusing v2's
// exact literal tag names, since our lines are built from real detail
// fields (see buildLogLines below) instead of v2's mocked strings.
type LogLevel = 'CONNECT' | 'INFO' | 'AUTH' | 'SCAN' | 'WARN' | 'THREAT' | 'ERROR' | 'DECISION' | 'ACTION';

const LEVEL_COLOR: Record<LogLevel, string> = {
  CONNECT: 'text-emerald-400',
  SCAN: 'text-emerald-400',
  INFO: 'text-blue-400',
  AUTH: 'text-purple-400',
  WARN: 'text-amber-400',
  THREAT: 'text-red-500',
  ERROR: 'text-red-400',
  DECISION: 'text-cyan-400',
  ACTION: 'text-orange-400',
};

interface LogLine {
  level: LogLevel;
  // Full rendered line INCLUDING the leading timestamp, e.g.
  // "2026-07-20 09:15:00 [CONNECT] client=203.0.113.45 geo=美国 ...".
  text: string;
}

function formatGeo(d: MailLogDetail): string {
  return [d.geo_region_name, d.geo_city].filter(Boolean).join(' ');
}

// SPF/DKIM/DMARC 校验值不为 "pass"（大小写不敏感）都视为失败/可疑，触发 WARN 级别。
function isAuthValue(v: string | undefined): boolean {
  return !!v && v.trim() !== '';
}
function authFailed(v: string | undefined): boolean {
  return isAuthValue(v) && v!.toLowerCase() !== 'pass';
}

// 从邮件的真实字段合成人类可读、按级别着色的 syslog 风格日志行 (v2 spec KEY
// DECISION: 后端没有真实的原始/syslog 字段，改由前端用真实 detail 字段合成，
// 而非沿用旧实现的 JSON.stringify(detail) 整体转储)。缺失的字段直接跳过对应
// 整行，不编造数据。
function buildLogLines(detail: MailLogDetail, lang: DisposalLang): LogLine[] {
  const lines: LogLine[] = [];
  const tsEarly = formatTimestamp(detail.received_at) || detail.received_at || '';
  const tsMid = formatTimestamp(detail.processed_at || detail.received_at) || detail.processed_at || tsEarly;
  const tsLate = formatTimestamp(detail.delivered_at || detail.processed_at || detail.received_at)
    || detail.delivered_at || tsMid;

  // [CONNECT]
  if (detail.client_ip) {
    const parts = [`client=${detail.client_ip}`];
    const geo = formatGeo(detail);
    if (geo) parts.push(`geo=${geo}`);
    if (detail.ptr_domain) parts.push(`ptr=${detail.ptr_domain}`);
    lines.push({ level: 'CONNECT', text: `${tsEarly} [CONNECT] ${parts.join(' ')}` });
  }

  // [AUTH]
  if (isAuthValue(detail.spf_valid) || isAuthValue(detail.dkim_valid) || isAuthValue(detail.dmarc_valid)) {
    const parts: string[] = [];
    if (isAuthValue(detail.spf_valid)) parts.push(`SPF=${detail.spf_valid}`);
    if (isAuthValue(detail.dkim_valid)) parts.push(`DKIM=${detail.dkim_valid}`);
    if (isAuthValue(detail.dmarc_valid)) parts.push(`DMARC=${detail.dmarc_valid}`);
    const failed = authFailed(detail.spf_valid) || authFailed(detail.dkim_valid) || authFailed(detail.dmarc_valid);
    lines.push({ level: failed ? 'WARN' : 'AUTH', text: `${tsEarly} [AUTH] ${parts.join(' ')}` });
  }

  // [MAILFROM]/[RCPT]
  if (detail.sender || (detail.recipients && detail.recipients.length > 0)) {
    const parts: string[] = [];
    if (detail.sender) parts.push(`sender=${detail.sender}`);
    if (detail.recipients && detail.recipients.length > 0) parts.push(`recipients=${detail.recipients.join(', ')}`);
    lines.push({ level: 'INFO', text: `${tsEarly} [RCPT] ${parts.join(' ')}` });
  }

  // [DATA] subject -- lets search-by-subject hit the raw log viewer. Omitted
  // when empty per the no-fabrication rule (same convention as every other
  // line in this function).
  if (detail.subject) {
    lines.push({ level: 'INFO', text: `${tsEarly} [DATA] subject="${detail.subject}"` });
  }

  // [SCAN]
  const hasScanData = !!detail.cac_result || detail.urls != null || detail.attachments != null;
  if (hasScanData) {
    const parts: string[] = [];
    if (detail.cac_result?.tag) parts.push(`cac_tag=${detail.cac_result.tag}`);
    if (detail.cac_result?.int_tag != null) parts.push(`int_tag=${detail.cac_result.int_tag}`);
    if (detail.urls != null) parts.push(`urls=${detail.urls.length}`);
    if (detail.attachments != null) parts.push(`attachments=${detail.attachments.length}`);
    const hasBadScan = (detail.scan_results ?? []).some(
      (s) => s.final_disposition && !['clean', 'passed', 'pass'].includes(s.final_disposition.toLowerCase()),
    );
    lines.push({ level: hasBadScan ? 'WARN' : 'SCAN', text: `${tsEarly} [SCAN] ${parts.join(' ')}` });
  }

  // [THREAT]
  const tone = detail.email_type ? mailTypeConfig[detail.email_type]?.tone : undefined;
  const threatLevel = deriveThreatLevel(detail.cac_result);
  const phishRisk = detail.phish_agent_check?.risk_level;
  const isThreat = tone === 'malicious' || threatLevel === 'high' || phishRisk === 'high' || phishRisk === 'critical';
  if (isThreat) {
    const parts: string[] = [];
    if (detail.cac_result?.tag) parts.push(`cac_tag=${detail.cac_result.tag}`);
    if (detail.cac_result?.description) parts.push(`desc=${detail.cac_result.description}`);
    if (phishRisk) parts.push(`ai_risk=${phishRisk}`);
    lines.push({ level: 'THREAT', text: `${tsMid} [THREAT] ${parts.join(' ') || 'multiple threat indicators identified'}` });
  }

  // [RULE]
  const basis = detail.disposal_basis;
  if (basis?.policy_key) {
    const moduleName = getModuleName(basis.policy_key, lang);
    const ruleLabel = [basis.rule_name, basis.rule_id].filter(Boolean).join(' ');
    const hit = formatHitDetail(basis, lang);
    const parts = [`policy=${moduleName}`];
    if (ruleLabel) parts.push(`rule=${ruleLabel}`);
    if (basis.action) parts.push(`action=${getActionLabel(basis.action, lang)}`);
    lines.push({ level: 'DECISION', text: `${tsMid} [RULE] ${parts.join(' ')}${hit ? ` — ${hit}` : ''}` });
  }

  // [ACTION]
  if (detail.action) {
    const destructive = ['reject', 'discard', 'bounce'].includes(detail.action);
    lines.push({
      level: destructive ? 'ERROR' : 'ACTION',
      text: `${tsMid} [ACTION] action=${getActionLabel(detail.action, lang)} status=${detail.status ?? '-'}`,
    });
  }

  // [DELIVERY] per recipient_disposition
  for (const rd of detail.recipient_dispositions ?? []) {
    const failed = /fail/i.test(rd.status ?? '');
    const parts = [`recipient=${rd.recipient}`, `status=${rd.status}`];
    if (rd.final_action) parts.push(`action=${rd.final_action}`);
    if (rd.dsn_status) parts.push(`dsn=${rd.dsn_status}`);
    if (rd.reason) parts.push(`reason=${rd.reason}`);
    lines.push({ level: failed ? 'ERROR' : 'INFO', text: `${tsLate} [DELIVERY] ${parts.join(' ')}` });
  }

  // Trailing [INFO] summary line, mirroring v2's "Processing completed" line.
  if (detail.processing_time_ms != null) {
    lines.push({ level: 'INFO', text: `${tsLate} [INFO] processing completed total_time=${detail.processing_time_ms}ms` });
  }

  return lines;
}

export function RawLogsSection({ detail }: RawLogsSectionProps) {
  const t = useTranslations('emailDisposal.detail.rawLogs');
  const rawLocale = useLocale();
  const disposalLang: DisposalLang = (['zh', 'en', 'th', 'ru'] as const).includes(rawLocale as DisposalLang)
    ? (rawLocale as DisposalLang)
    : 'zh';

  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [open, setOpen] = useState(true);
  // Fallback height before the container has been measured; kept in state
  // (rather than read from the ref during render, which react-hooks/refs
  // flags) and refreshed on mount/resize via the layout effect below.
  const [viewportHeight, setViewportHeight] = useState(40 * ROW_HEIGHT_PX);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setViewportHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allLogLines = useMemo(() => buildLogLines(detail, disposalLang), [detail, disposalLang]);
  const logLines = useMemo(() => allLogLines.slice(0, MAX_LOG_LINES), [allLogLines]);
  const totalCount = logLines.length;

  // Search filter -- always applied directly (no separate "match only"
  // toggle, matching v2's filteredLogs behavior: only matching lines render).
  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logLines;
    return logLines.filter((l) => l.text.toLowerCase().includes(q));
  }, [logLines, query]);

  // Gap 3.3: line numbers renumbered per VISIBLE FILTERED row (contiguous
  // 1..N of matches), not the original pre-filter index.
  const rendered = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return filteredLines.map((l, i) => ({ no: i + 1, level: l.level, html: escapeHtml(l.text) }));
    }
    const escapedQuery = escapeHtml(q);
    const re = new RegExp(`(${escapeRe(escapedQuery)})`, 'gi');
    return filteredLines.map((l, i) => ({
      no: i + 1,
      level: l.level,
      html: escapeHtml(l.text).replace(re, '<mark class="bg-yellow-300 text-gray-900 px-0.5 rounded">$1</mark>'),
    }));
  }, [filteredLines, query]);

  const virtualized = rendered.length > VIRTUALIZE_THRESHOLD;

  const { startIndex, endIndex, topPad, bottomPad } = useMemo(() => {
    if (!virtualized) {
      return { startIndex: 0, endIndex: rendered.length, topPad: 0, bottomPad: 0 };
    }
    const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + OVERSCAN_ROWS * 2;
    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS);
    const last = Math.min(rendered.length, first + visibleCount);
    return {
      startIndex: first,
      endIndex: last,
      topPad: first * ROW_HEIGHT_PX,
      bottomPad: (rendered.length - last) * ROW_HEIGHT_PX,
    };
  }, [virtualized, rendered.length, scrollTop, viewportHeight]);

  const visibleRows = virtualized ? rendered.slice(startIndex, endIndex) : rendered;

  // Gap 3.6: copies the FILTERED (search-scoped) lines; button toggles to a
  // Check icon + "已复制" and reverts after 2s. A toast in addition to the
  // in-button state is fine per the brief.
  function copyAll() {
    const text = filteredLines.map((l) => l.text).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      toast.success(t('copied'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Gap 3.7: filename `email-log-{detail.id}-{date}.log`, text/plain,
  // contents = ALL synthesized lines (unaffected by search filter).
  function download() {
    const text = logLines.map((l) => l.text).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `email-log-${detail.id}-${date}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid="disposal-raw-logs">
      <CollapsibleTrigger
        data-testid="disposal-raw-logs-trigger"
        render={
          <Button
            type="button"
            variant="outline"
            className="mb-3 h-auto w-full justify-start gap-2 bg-muted/30 px-3 py-2 text-left text-sm font-medium"
          />
        }
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', !open && '-rotate-90')} />
        {t('title')}
        {/* Gap 3.4: outline badge shows the TOTAL line count, unaffected by search. */}
        <Badge variant="outline" className="text-xs" data-testid="raw-logs-count-badge">
          {t('entriesBadge', { count: totalCount })}
        </Badge>
        {allLogLines.length > MAX_LOG_LINES && <span className="ml-auto text-xs text-amber-600">{t('truncated')}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-md border px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            data-testid="disposal-raw-logs-search"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <Button data-testid="disposal-raw-logs-download" variant="outline" size="sm" onClick={download}>
          <Download className="mr-1 h-3.5 w-3.5" />{t('downloadLog')}
        </Button>
      </div>

      <div className="rounded-lg overflow-hidden border">
        <div
          data-testid="raw-logs-viewer"
          ref={scrollRef}
          onScroll={virtualized ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
          // Gap 3.8: fixed dark "terminal" look in both app themes. Individual
          // log lines are static information, so the feedback spec deliberately
          // keeps them free of hover affordances.
          className="bg-slate-800 text-sm font-mono max-h-[400px] overflow-y-auto"
        >
          {rendered.length === 0 ? (
            <div className="p-4 text-center text-gray-400">{t('noMatch')}</div>
          ) : (
            <>
              {virtualized && topPad > 0 && <div style={{ height: topPad }} aria-hidden="true" />}
              {visibleRows.map((r) => (
                <div key={r.no} data-testid={`raw-log-line-${r.no}`} className="flex">
                  <span className="w-10 flex-shrink-0 text-right pr-3 py-1.5 text-slate-500 select-none border-r border-slate-600">
                    {r.no}
                  </span>
                  <pre
                    className={cn('flex-1 py-1.5 px-3 whitespace-pre-wrap break-all', LEVEL_COLOR[r.level])}
                    dangerouslySetInnerHTML={{ __html: r.html }}
                  />
                </div>
              ))}
              {virtualized && bottomPad > 0 && <div style={{ height: bottomPad }} aria-hidden="true" />}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button data-testid="disposal-raw-logs-copy" variant="ghost" size="sm" className="h-8 text-xs" onClick={copyAll}>
          {copied ? (
            <><Check className="mr-1 h-3.5 w-3.5 text-green-500" />{t('copied')}</>
          ) : (
            <><Copy className="mr-1 h-3.5 w-3.5" />{t('copyAll')}</>
          )}
        </Button>
        {/* Gap 3.5: found-count shown ONLY when the search box is non-empty. */}
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
