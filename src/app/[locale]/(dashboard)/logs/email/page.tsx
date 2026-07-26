'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Bot, Download, Sparkles, X } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { ServerPagination } from '@/components/shared/server-pagination';
import { SearchFilters, SearchForm } from '@/components/logs/search-filters';
import type { AdvancedFilter } from '@/types/log';
import { ColumnSelector, ColumnConfig } from '@/components/logs/column-selector';
import { EmailDetailModal } from '@/components/logs/email-detail-modal';
import { EmailAIInterpretDrawer } from '@/components/logs/email-ai-interpret-drawer';
import { getEmailLogs, exportEmailLogs } from '@/lib/api/logs';
import { DeliveryRecipientSummary, EmailLog, EmailLogSearchParams } from '@/types/log';
import { formatDate } from '@/lib/utils';
import { useTenant } from '@/hooks/use-tenant';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { useApiRequest } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { actionToVariant, actionExtraClass, actionLabel, summarizeFinalActions } from '@/lib/email-log-action';
import { getColumnLabel } from '@/lib/email-log-columns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { PageFilters } from '@/components/shared/page-filters';

const TRUNCATE_LEN = 40;
const SUBJECT_TRUNCATE_LEN = 80;
const SENDER_TRUNCATE_LEN = 50;

function TruncatedText({ text, maxLen = TRUNCATE_LEN }: { text: string; maxLen?: number }) {
  if (text.length <= maxLen) return <>{text}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={
        <span className="cursor-default" />
      }>
        {text.slice(0, maxLen) + '...'}
      </TooltipTrigger>
      <TooltipContent className="max-w-md whitespace-pre-wrap break-all text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

const CHIP_ACTIONS = ['accept', 'reject', 'quarantine', 'sideline', 'audit', 'mixed'] as const;

function ActionChipBar({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const t = useTranslations();
  const chipClass = (active: boolean, action: string) => {
    const extra = actionExtraClass(action);
    if (active) {
      return cn(
        'border-2 ring-1 ring-offset-1 ring-primary/30',
        extra || 'bg-primary text-primary-foreground border-primary',
      );
    }
    return cn(
      'border bg-background hover:bg-accent',
      extra && 'border-amber-500/50',
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t('logs.actionChip.label')}:</span>
      <button
        type="button"
        onClick={() => onChange('')}
        className={cn(
          'rounded-full px-3 py-1 text-xs transition-colors',
          value === '' ? 'border-2 border-primary bg-primary/10' : 'border bg-background hover:bg-accent',
        )}
      >
        {t('logs.actionChip.all')}
      </button>
      {CHIP_ACTIONS.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(value === a ? '' : a)}
          className={cn('rounded-full px-3 py-1 text-xs transition-colors', chipClass(value === a, a))}
        >
          {actionLabel(a, t)}
        </button>
      ))}
    </div>
  );
}

function parseDeliveryRecipientsSummary(value: EmailLog['delivery_recipients_summary']): DeliveryRecipientSummary[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '' || value.trim() === '{}') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return Object.values(parsed) as DeliveryRecipientSummary[];
    return [];
  } catch {
    return [];
  }
}

const columnConfigs: ColumnConfig[] = [
  { key: 'timestamp', label: 'timestamp', defaultVisible: true, group: 'Timestamps' },
  { key: 'id', label: 'id', defaultVisible: false, group: 'Basic' },
  { key: 'message_id', label: 'message_id', defaultVisible: false, group: 'Basic' },
  { key: 'message_uuid', label: 'message_uuid', defaultVisible: false, group: 'Basic' },
  { key: 'client_ip', label: 'client_ip', defaultVisible: true, group: 'Basic' },
  { key: 'geo_region', label: 'geo_region', defaultVisible: false, group: 'GeoIP' },
  { key: 'geo_region_name', label: 'geo_region_name', defaultVisible: false, group: 'GeoIP' },
  { key: 'geo_continent', label: 'geo_continent', defaultVisible: false, group: 'GeoIP' },
  { key: 'geo_city', label: 'geo_city', defaultVisible: false, group: 'GeoIP' },
  { key: 'geo_asn', label: 'geo_asn', defaultVisible: false, group: 'GeoIP' },
  { key: 'geo_isp', label: 'geo_isp', defaultVisible: false, group: 'GeoIP' },
  { key: 'sender', label: 'sender', defaultVisible: true, group: 'Basic' },
  { key: 'sender_name', label: 'sender_name', defaultVisible: false, group: 'Basic' },
  { key: 'sender_domain', label: 'sender_domain', defaultVisible: false, group: 'Basic' },
  { key: 'recipients', label: 'recipients', defaultVisible: true, group: 'Basic' },
  { key: 'to_cc_details', label: 'to_cc_details', defaultVisible: false, group: 'Basic' },
  { key: 'bcc', label: 'bcc', defaultVisible: false, group: 'Basic' },
  { key: 'subject', label: 'subject', defaultVisible: true, group: 'Basic' },

  { key: 'smtp_user', label: 'smtp_user', defaultVisible: false, group: 'Auth' },
  { key: 'authenticated', label: 'authenticated', defaultVisible: false, group: 'Auth' },
  { key: 'auth_type', label: 'auth_type', defaultVisible: false, group: 'Auth' },

  { key: 'spf_valid', label: 'spf_valid', defaultVisible: false, group: 'SPF' },
  { key: 'spf_record', label: 'spf_record', defaultVisible: false, group: 'SPF' },
  { key: 'spf_reason', label: 'spf_reason', defaultVisible: false, group: 'SPF' },
  { key: 'spf_ip_range', label: 'spf_ip_range', defaultVisible: false, group: 'SPF' },

  { key: 'dkim_valid', label: 'dkim_valid', defaultVisible: false, group: 'DKIM' },
  { key: 'dkim_domain', label: 'dkim_domain', defaultVisible: false, group: 'DKIM' },
  { key: 'dkim_selector', label: 'dkim_selector', defaultVisible: false, group: 'DKIM' },
  { key: 'dkim_reason', label: 'dkim_reason', defaultVisible: false, group: 'DKIM' },
  { key: 'dkim_outbound_signed', label: 'dkim_outbound_signed', defaultVisible: true, group: 'DKIM' },

  { key: 'dmarc_valid', label: 'dmarc_valid', defaultVisible: false, group: 'DMARC' },
  { key: 'dmarc_domain', label: 'dmarc_domain', defaultVisible: false, group: 'DMARC' },
  { key: 'dmarc_policy', label: 'dmarc_policy', defaultVisible: false, group: 'DMARC' },
  { key: 'dmarc_spf_aligned', label: 'dmarc_spf_aligned', defaultVisible: false, group: 'DMARC' },
  { key: 'dmarc_dkim_aligned', label: 'dmarc_dkim_aligned', defaultVisible: false, group: 'DMARC' },
  { key: 'dmarc_record', label: 'dmarc_record', defaultVisible: false, group: 'DMARC' },
  { key: 'dmarc_reason', label: 'dmarc_reason', defaultVisible: false, group: 'DMARC' },
  { key: 'dmarc_from_domain', label: 'dmarc_from_domain', defaultVisible: false, group: 'DMARC' },

  { key: 'cac_result', label: 'cac_result', defaultVisible: false, group: 'CAC' },
  { key: 'ptr_valid', label: 'ptr_valid', defaultVisible: false, group: 'PTR' },
  { key: 'ptr_domain', label: 'ptr_domain', defaultVisible: false, group: 'PTR' },
  { key: 'cac_rules', label: 'cac_rules', defaultVisible: false, group: 'CAC' },
  { key: 'rcpttags', label: 'rcpttags', defaultVisible: true, group: 'Tags' },

  { key: 'matched_tag_rules', label: 'matched_tag_rules', defaultVisible: false, group: 'Rules' },
  { key: 'matched_action_rules', label: 'matched_action_rules', defaultVisible: false, group: 'Rules' },
  { key: 'matched_route_rules', label: 'matched_route_rules', defaultVisible: false, group: 'Rules' },
  { key: 'final_action_rule', label: 'final_action_rule', defaultVisible: true, group: 'Rules' },

  { key: 'content', label: 'content', defaultVisible: false, group: 'Content' },
  { key: 'html_content', label: 'html_content', defaultVisible: false, group: 'Content' },
  { key: 'attachments', label: 'attachments', defaultVisible: false, group: 'Content' },
  { key: 'urls', label: 'urls', defaultVisible: false, group: 'Content' },

  { key: 'action', label: 'action', defaultVisible: true, group: 'Result' },
  { key: 'status', label: 'status', defaultVisible: false, group: 'Result' },
  { key: 'reason', label: 'reason', defaultVisible: true, group: 'Result' },

  { key: 'queue_id', label: 'queue_id', defaultVisible: false, group: 'Delivery' },
  { key: 'delivery_status_summary', label: 'delivery_status_summary', defaultVisible: true, group: 'Delivery' },
  { key: 'workflow_outcome_summary', label: 'workflow_outcome_summary', defaultVisible: false, group: 'Delivery' },
  { key: 'delivery_attempts', label: 'delivery_attempts', defaultVisible: false, group: 'Delivery' },
  { key: 'last_delivery_event_at', label: 'last_delivery_event_at', defaultVisible: false, group: 'Delivery' },
  { key: 'delivery_error_summary', label: 'delivery_error_summary', defaultVisible: false, group: 'Delivery' },
  { key: 'delivery_recipients_summary', label: 'delivery_recipients_summary', defaultVisible: false, group: 'Delivery' },

  { key: 'tenant_id', label: 'tenant_id', defaultVisible: false, group: 'Tenant' },
  { key: 'tenant_name', label: 'tenant_name', defaultVisible: false, group: 'Tenant' },

  { key: 'processing_time_ms', label: 'processing_time_ms', defaultVisible: false, group: 'Meta' },
  { key: 'parse_error', label: 'parse_error', defaultVisible: false, group: 'Meta' },
  { key: 'storage_path', label: 'storage_path', defaultVisible: false, group: 'Meta' },
  { key: 'storage_size', label: 'storage_size', defaultVisible: false, group: 'Meta' },
  { key: 'priority', label: 'priority', defaultVisible: false, group: 'Meta' },
  { key: 'retries', label: 'retries', defaultVisible: false, group: 'Meta' },
  { key: 'session_id', label: 'session_id', defaultVisible: false, group: 'Meta' },

  { key: 'received_at', label: 'received_at', defaultVisible: true, group: 'Timestamps' },
  { key: 'processed_at', label: 'processed_at', defaultVisible: false, group: 'Timestamps' },
  { key: 'delivered_at', label: 'delivered_at', defaultVisible: false, group: 'Timestamps' },
  { key: 'bounced_at', label: 'bounced_at', defaultVisible: false, group: 'Timestamps' },
  { key: 'created_at', label: 'created_at', defaultVisible: false, group: 'Timestamps' },
  { key: 'updated_at', label: 'updated_at', defaultVisible: false, group: 'Timestamps' },
];

function searchFormToParams(form: SearchForm & { advanced_filters?: string }): EmailLogSearchParams {
  return {
    ...form,
  };
}

export default function EmailLogsPage() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { effectiveTenantId, isSystemAdmin } = useTenant();
  const { features } = useAuth();
  const { capabilities } = useProductForm();
  const aiOk = (capabilities?.ai ?? false) && features.aiInterpret;
  const { apiRequest } = useApiRequest();
  const mailLogIdParam = searchParams.get('mail_log_id') || '';
  const querySelectedEmailId = Number.isInteger(Number(mailLogIdParam)) && Number(mailLogIdParam) > 0 ? Number(mailLogIdParam) : null;
  const [searchForm, setSearchForm] = useState<SearchForm & { advanced_filters?: string; recipient_domain?: string }>({});
  const [actionChip, setActionChip] = useState<string>('');
  const [dkimSignedFilter, setDkimSignedFilter] = useState<string>('');
  const [similarFilter, setSimilarFilter] = useState<string>('');
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [aiInterpretEmailId, setAiInterpretEmailId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [initialAdvancedFilter, setInitialAdvancedFilter] = useState<AdvancedFilter | undefined>(undefined);

  const attachmentMd5Applied = useRef(false);
  useEffect(() => {
    if (attachmentMd5Applied.current) return;
    const md5 = searchParams.get('attachment_md5');
    if (!md5) return;
    attachmentMd5Applied.current = true;
    const af: AdvancedFilter = {
      operator: 'AND',
      groups: [{
        operator: 'AND',
        not: false,
        conditions: [{ field: 'attachment_md5', op: 'eq', value: md5 }],
      }],
    };
    setInitialAdvancedFilter(af);
    setSearchForm((prev) => ({ ...prev, advanced_filters: JSON.stringify(af) }));
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('attachment_md5');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [searchParams, pathname, router]);

  // Consume the ?recipient_domain= deep-link param (mailflow bounce "view logs",
  // spec §6.2). Filters the log list to a recipient domain via the index-backed
  // mail_recipients.recipient_domain column, then strips the param from the URL.
  const recipientDomainApplied = useRef(false);
  useEffect(() => {
    if (recipientDomainApplied.current) return;
    const domain = searchParams.get('recipient_domain');
    if (!domain) return;
    recipientDomainApplied.current = true;
    setSearchForm((prev) => ({ ...prev, recipient_domain: domain }));
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('recipient_domain');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [searchParams, pathname, router]);

  // Consume the ?similar=matched deep-link param (相似检测 DirectionCard "查看观察日志"
  // 入口，spec similar-detection html_spec 对齐 Task 14). direction 仅展示性预填，
  // 列表 API 不消费，这里忽略。其余取值静默忽略（与后端 GetMailLogs 行为一致）。
  const similarApplied = useRef(false);
  useEffect(() => {
    if (similarApplied.current) return;
    const similar = searchParams.get('similar');
    if (similar !== 'matched') return;
    similarApplied.current = true;
    setSimilarFilter('matched');
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('similar');
    nextParams.delete('direction');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [searchParams, pathname, router]);

  const effectiveSelectedEmailId = querySelectedEmailId ?? selectedEmailId;
  const effectiveDetailOpen = querySelectedEmailId !== null || detailOpen;

  const handleDetailOpenChange = useCallback((open: boolean) => {
    setDetailOpen(open);
    if (open) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('mail_log_id');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  const params = useMemo((): EmailLogSearchParams => {
    const base = searchFormToParams(searchForm);
    // Chip filter overrides the form's action select when active.
    const action = actionChip || base.action || '';
    return {
      ...base,
      action,
      dkim_outbound_signed: dkimSignedFilter || undefined,
      similar: similarFilter || undefined,
      page,
      page_size: 20,
    };
  }, [searchForm, actionChip, dkimSignedFilter, similarFilter, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['email-logs', params, effectiveTenantId],
    queryFn: () => getEmailLogs(params, apiRequest),
  });

  const handleSearch = useCallback((form: SearchForm & { advanced_filters?: string }) => {
    setSearchForm(form);
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setSearchForm({});
    setActionChip('');
    setDkimSignedFilter('');
    setSimilarFilter('');
    setPage(1);
  }, []);

  const handleClearSimilarFilter = useCallback(() => {
    setSimilarFilter('');
    setPage(1);
  }, []);

  const handleDkimSignedChange = useCallback((next: string | null) => {
    setDkimSignedFilter(!next || next === 'all' ? '' : next);
    setPage(1);
  }, []);

  const handleChipChange = useCallback((next: string) => {
    setActionChip(next);
    setPage(1);
  }, []);

  const handleColumnsChange = useCallback((keys: string[]) => {
    setVisibleColumns(keys);
  }, []);

  const textCell = (key: keyof EmailLog, maxLen?: number) => ({
    accessorKey: key,
    header: key,
    cell: ({ row }: { row: { original: EmailLog } }) => {
      const v = row.original[key];
      if (v === undefined || v === null || v === '') return '-';
      const s = String(v);
      return <TruncatedText text={s} maxLen={maxLen} />;
    },
  });

  const columns: ColumnDef<EmailLog>[] = useMemo(() => {
    const allColumns: Record<string, ColumnDef<EmailLog>> = {
      id: { accessorKey: 'id', header: 'id' },
      message_id: textCell('message_id'),
      message_uuid: textCell('message_uuid'),
      client_ip: textCell('client_ip'),
      geo_region: {
        accessorKey: 'geo_region',
        header: 'geo_region',
        cell: ({ row }) => {
          const v = row.original.geo_region;
          if (!v) return '-';
          return <Badge variant="outline">{v}</Badge>;
        },
      },
      geo_region_name: textCell('geo_region_name'),
      geo_continent: {
        accessorKey: 'geo_continent',
        header: 'geo_continent',
        cell: ({ row }) => {
          const v = row.original.geo_continent;
          if (!v) return '-';
          return <Badge variant="outline">{v}</Badge>;
        },
      },
      geo_city: textCell('geo_city'),
      geo_asn: {
        accessorKey: 'geo_asn',
        header: 'geo_asn',
        cell: ({ row }) => {
          const v = row.original.geo_asn;
          if (!v) return '-';
          return String(v);
        },
      },
      geo_isp: textCell('geo_isp'),
      sender: {
        accessorKey: 'sender',
        header: 'sender',
        cell: ({ row }) => {
          const sender = row.original.sender || '-';
          const handleClick = () => {
            setSelectedEmailId(row.original.id);
            setDetailOpen(true);
          };
          const truncated = sender.length > SENDER_TRUNCATE_LEN
            ? sender.slice(0, SENDER_TRUNCATE_LEN) + '...'
            : sender;
          const senderText = sender.length > SENDER_TRUNCATE_LEN ? (
            <Tooltip>
              <TooltipTrigger render={
                <span className="cursor-pointer hover:text-primary underline" onClick={handleClick} />
              }>
                {truncated}
              </TooltipTrigger>
              <TooltipContent className="max-w-md whitespace-pre-wrap break-all text-xs">
                {sender}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="cursor-pointer hover:text-primary underline" onClick={handleClick}>
              {sender}
            </span>
          );
          return (
            <div className="flex items-center gap-1">
              {senderText}
              <button
                className="p-0.5 rounded hover:bg-muted text-violet-500 hover:text-violet-400 transition-colors"
                onClick={() => router.push(`/investigations?mail_log_id=${row.original.id}`)}
                title={t('investigations.launchForMailLog')}
              >
                <Bot className="h-3.5 w-3.5" />
              </button>
              {aiOk && (
                <button
                  className="p-0.5 rounded hover:bg-muted text-amber-500 hover:text-amber-400 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setAiInterpretEmailId(row.original.id); }}
                  title={t('logs.email.aiInterpret.launchForMailLog')}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        },
      },
      sender_name: textCell('sender_name'),
      sender_domain: textCell('sender_domain'),
      recipients: {
        accessorKey: 'recipients',
        header: 'recipients',
        cell: ({ row }) => {
          const r = row.original.recipients;
          if (!r?.length) return '-';
          const farMap = row.original.final_action_rule;
          // Find the per-rcpt action regardless of whether the backend stores
          // the recipient as "user@host" or some normalized form. Match by
          // exact key first, fall back to case-insensitive lookup.
          const lookup = (rcpt: string): string | undefined => {
            if (!farMap) return undefined;
            if (farMap[rcpt]) return farMap[rcpt].action;
            const lower = rcpt.toLowerCase();
            for (const k of Object.keys(farMap)) {
              if (k.toLowerCase() === lower) return farMap[k].action;
            }
            return undefined;
          };
          return (
            <div className="flex flex-wrap items-center gap-1">
              {r.map((rcpt) => {
                const act = lookup(rcpt);
                const variant = act ? actionToVariant(act) : 'outline';
                const extra = act ? actionExtraClass(act) : '';
                const titleText = act ? `${rcpt} → ${actionLabel(act, t)}` : rcpt;
                return (
                  <Badge
                    key={rcpt}
                    variant={variant}
                    className={cn('font-mono text-[11px] max-w-[16rem] truncate', extra)}
                    title={titleText}
                  >
                    {rcpt}
                  </Badge>
                );
              })}
            </div>
          );
        },
      },
      to_cc_details: {
        accessorKey: 'to_cc_details',
        header: 'to_cc_details',
        cell: ({ row }) => {
          const v = row.original.to_cc_details;
          if (!v) return '-';
          return `${v.length}`;
        },
      },
      bcc: {
        accessorKey: 'bcc',
        header: 'bcc',
        cell: ({ row }) => {
          const v = row.original.bcc;
          if (!v?.length) return '-';
          const s = v.join(', ');
          return <TruncatedText text={s} />;
        },
      },
      subject: textCell('subject', SUBJECT_TRUNCATE_LEN),

      smtp_user: textCell('smtp_user'),
      authenticated: {
        accessorKey: 'authenticated',
        header: 'authenticated',
        cell: ({ row }) => (
          <Badge variant={row.original.authenticated ? 'default' : 'secondary'}>
            {row.original.authenticated ? '✓' : '✗'}
          </Badge>
        ),
      },
      auth_type: textCell('auth_type'),

      spf_valid: {
        accessorKey: 'spf_valid',
        header: 'spf_valid',
        cell: ({ row }) => {
          const v = row.original.spf_valid;
          if (!v) return '-';
          return <Badge variant={v === 'pass' ? 'default' : 'destructive'}>{v}</Badge>;
        },
      },
      spf_record: textCell('spf_record'),
      spf_reason: textCell('spf_reason'),
      spf_ip_range: textCell('spf_ip_range'),

      dkim_valid: {
        accessorKey: 'dkim_valid',
        header: 'dkim_valid',
        cell: ({ row }) => {
          const v = row.original.dkim_valid;
          if (!v) return '-';
          return <Badge variant={v === 'pass' ? 'default' : 'destructive'}>{v}</Badge>;
        },
      },
      dkim_domain: textCell('dkim_domain'),
      dkim_selector: textCell('dkim_selector'),
      dkim_reason: textCell('dkim_reason'),
      dkim_outbound_signed: {
        accessorKey: 'dkim_outbound_signed',
        header: 'dkim_outbound_signed',
        cell: ({ row }) => {
          const signed = row.original.dkim_outbound_signed;
          if (signed === undefined || signed === null) return '-';
          if (signed) {
            return (
              <Tooltip>
                <TooltipTrigger render={<span className="cursor-default text-green-600" />}>✅</TooltipTrigger>
                <TooltipContent className="text-xs">
                  selector={row.original.dkim_outbound_selector || '-'}
                </TooltipContent>
              </Tooltip>
            );
          }
          return (
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-default text-red-500" />}>⛔</TooltipTrigger>
              <TooltipContent className="text-xs">
                skip: {row.original.dkim_outbound_skip_reason || '-'}
              </TooltipContent>
            </Tooltip>
          );
        },
      },

      dmarc_valid: {
        accessorKey: 'dmarc_valid',
        header: 'dmarc_valid',
        cell: ({ row }) => {
          const v = row.original.dmarc_valid;
          if (!v) return '-';
          return <Badge variant={v === 'pass' ? 'default' : 'destructive'}>{v}</Badge>;
        },
      },
      dmarc_domain: textCell('dmarc_domain'),
      dmarc_policy: textCell('dmarc_policy'),
      dmarc_spf_aligned: {
        accessorKey: 'dmarc_spf_aligned',
        header: 'dmarc_spf_aligned',
        cell: ({ row }) => {
          const v = row.original.dmarc_spf_aligned;
          if (v === undefined || v === null) return '-';
          return <Badge variant={v ? 'default' : 'secondary'}>{v ? '✓' : '✗'}</Badge>;
        },
      },
      dmarc_dkim_aligned: {
        accessorKey: 'dmarc_dkim_aligned',
        header: 'dmarc_dkim_aligned',
        cell: ({ row }) => {
          const v = row.original.dmarc_dkim_aligned;
          if (v === undefined || v === null) return '-';
          return <Badge variant={v ? 'default' : 'secondary'}>{v ? '✓' : '✗'}</Badge>;
        },
      },
      dmarc_record: textCell('dmarc_record'),
      dmarc_reason: textCell('dmarc_reason'),
      dmarc_from_domain: textCell('dmarc_from_domain'),

      cac_result: {
        accessorKey: 'cac_result',
        header: 'cac_result',
        cell: ({ row }) => {
          const v = row.original.cac_result;
          if (!v) return '-';
          const s = JSON.stringify(v);
          return <TruncatedText text={s} />;
        },
      },

      ptr_valid: {
        accessorKey: 'ptr_valid',
        header: 'ptr_valid',
        cell: ({ row }) => {
          const v = row.original.ptr_valid;
          if (v === undefined || v === null) return '-';
          return <Badge variant={v ? 'default' : 'destructive'}>{v ? '✓' : '✗'}</Badge>;
        },
      },
      ptr_domain: textCell('ptr_domain'),
      cac_rules: {
        accessorKey: 'cac_rules',
        header: 'cac_rules',
        cell: ({ row }) => {
          const v = row.original.cac_rules;
          if (!v) return '-';
          return <TruncatedText text={v} />;
        },
      },
      rcpttags: {
        accessorKey: 'rcpttags',
        header: 'rcpttags',
        cell: ({ row }) => {
          const v = row.original.rcpttags;
          if (!v || Object.keys(v).length === 0) return '-';
          const entries = Object.entries(v).map(([rcpt, tags]) => `${rcpt}: [${tags.join(', ')}]`);
          return <TruncatedText text={entries.join('; ')} />;
        },
      },

      matched_tag_rules: {
        accessorKey: 'matched_tag_rules',
        header: 'matched_tag_rules',
        cell: ({ row }) => {
          const v = row.original.matched_tag_rules;
          if (!v || Object.keys(v).length === 0) return '-';
          const parts: string[] = [];
          for (const [stage, rcpts] of Object.entries(v)) {
            for (const [rcpt, ids] of Object.entries(rcpts)) {
              const label = rcpt ? `${stage}/${rcpt}` : stage;
              parts.push(`${label}: [${ids.join(', ')}]`);
            }
          }
          return <TruncatedText text={parts.join('; ')} />;
        },
      },
      matched_action_rules: {
        accessorKey: 'matched_action_rules',
        header: 'matched_action_rules',
        cell: ({ row }) => {
          const v = row.original.matched_action_rules;
          if (!v || Object.keys(v).length === 0) return '-';
          const parts: string[] = [];
          for (const [stage, rcpts] of Object.entries(v)) {
            for (const [rcpt, ids] of Object.entries(rcpts)) {
              const label = rcpt ? `${stage}/${rcpt}` : stage;
              parts.push(`${label}: [${ids.join(', ')}]`);
            }
          }
          return <TruncatedText text={parts.join('; ')} />;
        },
      },
      matched_route_rules: {
        accessorKey: 'matched_route_rules',
        header: 'matched_route_rules',
        cell: ({ row }) => {
          const v = row.original.matched_route_rules;
          if (!v || Object.keys(v).length === 0) return '-';
          const parts: string[] = [];
          for (const [stage, rcpts] of Object.entries(v)) {
            for (const [rcpt, ids] of Object.entries(rcpts)) {
              const label = rcpt ? `${stage}/${rcpt}` : stage;
              parts.push(`${label}: [${ids.join(', ')}]`);
            }
          }
          return <TruncatedText text={parts.join('; ')} />;
        },
      },
      final_action_rule: {
        accessorKey: 'final_action_rule',
        header: 'final_action_rule',
        cell: ({ row }) => {
          const v = row.original.final_action_rule;
          if (!v || Object.keys(v).length === 0) return '-';
          const entries = Object.entries(v);
          const trigger = (
            <div className="flex flex-wrap items-center gap-1">
              {entries.map(([rcpt, d]) => {
                const variant = actionToVariant(d.action);
                const extra = actionExtraClass(d.action);
                return (
                  <span key={rcpt} className="inline-flex items-center gap-0.5 text-xs">
                    {rcpt && <span className="font-mono text-muted-foreground">{rcpt}:</span>}
                    <Badge variant={variant} className={cn(extra)}>{actionLabel(d.action, t)}</Badge>
                  </span>
                );
              })}
            </div>
          );
          const detailText = entries
            .map(([rcpt, d]) => `${rcpt || 'global'}: #${d.rule_id} ${actionLabel(d.action, t)}${d.metadata ? ` (${d.metadata})` : ''}`)
            .join('\n');
          return (
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-default" />}>{trigger}</TooltipTrigger>
              <TooltipContent className="max-w-md whitespace-pre-wrap break-all text-xs">{detailText}</TooltipContent>
            </Tooltip>
          );
        },
      },

      content: textCell('content'),
      html_content: {
        accessorKey: 'html_content',
        header: 'html_content',
        cell: ({ row }) => {
          const v = row.original.html_content;
          if (!v) return '-';
          return <TruncatedText text={v} />;
        },
      },
      attachments: {
        accessorKey: 'attachments',
        header: 'attachments',
        cell: ({ row }) => row.original.attachments?.length ?? 0,
      },
      urls: {
        accessorKey: 'urls',
        header: 'urls',
        cell: ({ row }) => row.original.urls?.length ?? 0,
      },

      action: {
        accessorKey: 'action',
        header: 'action',
        cell: ({ row }) => {
          const a = row.original.action || '';
          const variant = actionToVariant(a);
          const extra = actionExtraClass(a);
          const badge = (
            <Badge variant={variant} className={cn(extra)}>
              {actionLabel(a, t)}
            </Badge>
          );
          if (a.toLowerCase() !== 'mixed') return badge;
          const summary = summarizeFinalActions(row.original.final_action_rule);
          return (
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-default" />}>{badge}</TooltipTrigger>
              <TooltipContent className="max-w-md whitespace-pre-wrap break-all text-xs">
                {summary.length > 0
                  ? summary.map((s) => `${actionLabel(s.action, t)} × ${s.count}`).join(' · ')
                  : t('logs.actionMixedSummary')}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      status: textCell('status'),
      reason: textCell('reason'),

      queue_id: {
        accessorKey: 'queue_id',
        header: 'queue_id',
        cell: ({ row }) => {
          const v = row.original.queue_id;
          if (!v) return '-';
          return <span className="font-mono text-xs">{v}</span>;
        },
      },
      delivery_status_summary: {
        accessorKey: 'delivery_status_summary',
        header: 'delivery_status_summary',
        cell: ({ row }) => {
          const v = row.original.delivery_status_summary;
          if (!v || v === 'unknown') {
            if (row.original.action === 'quarantine') return <Badge variant="outline">{t('logs.deliveryStatusQuarantined')}</Badge>;
            if (row.original.action === 'sideline') return <Badge variant="secondary">{t('logs.deliveryStatusProcessing')}</Badge>;
            return <Badge variant="outline">unknown</Badge>;
          }
          const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
            delivered: 'default',
            in_delivery: 'secondary',
            failed: 'destructive',
            cancelled: 'outline',
            partial_delivered: 'secondary',
          };
          return <Badge variant={variantMap[v] || 'outline'}>{v}</Badge>;
        },
      },
      workflow_outcome_summary: {
        accessorKey: 'workflow_outcome_summary',
        header: 'workflow_outcome_summary',
        cell: ({ row }) => {
          const v = row.original.workflow_outcome_summary;
          if (!v || v === 'none') return '-';
          const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
            approved: 'default',
            rejected: 'destructive',
            released: 'default',
            expired: 'secondary',
            bounced: 'destructive',
          };
          return <Badge variant={variantMap[v] || 'outline'}>{v}</Badge>;
        },
      },
      delivery_attempts: {
        accessorKey: 'delivery_attempts',
        header: 'delivery_attempts',
        cell: ({ row }) => row.original.delivery_attempts ?? 0,
      },
      last_delivery_event_at: {
        accessorKey: 'last_delivery_event_at',
        header: 'last_delivery_event_at',
        cell: ({ row }) => row.original.last_delivery_event_at ? formatDate(row.original.last_delivery_event_at) : '-',
      },
      delivery_error_summary: {
        accessorKey: 'delivery_error_summary',
        header: 'delivery_error_summary',
        cell: ({ row }) => {
          const v = row.original.delivery_error_summary;
          if (!v) return '-';
          return <TruncatedText text={v} />;
        },
      },
      delivery_recipients_summary: {
        accessorKey: 'delivery_recipients_summary',
        header: 'delivery_recipients_summary',
        cell: ({ row }) => {
          const v = parseDeliveryRecipientsSummary(row.original.delivery_recipients_summary);
          if (v.length === 0) return '-';
          return <TruncatedText text={v.map(r => `${r.recipient}: ${r.status}(${r.attempts ?? r.count ?? 0})`).join('; ')} />;
        },
      },

      tenant_id: {
        accessorKey: 'tenant_id',
        header: 'tenant_id',
        cell: ({ row }) => row.original.tenant_id ?? '-',
      },
      tenant_name: textCell('tenant_name'),

      processing_time_ms: {
        accessorKey: 'processing_time_ms',
        header: 'processing_time_ms',
        cell: ({ row }) => row.original.processing_time_ms != null ? `${row.original.processing_time_ms}ms` : '-',
      },
      parse_error: textCell('parse_error'),
      storage_path: textCell('storage_path'),
      storage_size: {
        accessorKey: 'storage_size',
        header: 'storage_size',
        cell: ({ row }) =>
          row.original.storage_size
            ? `${(row.original.storage_size / 1024).toFixed(1)} KB`
            : '-',
      },
      priority: { accessorKey: 'priority', header: 'priority' },
      retries: { accessorKey: 'retries', header: 'retries' },
      session_id: textCell('session_id'),

      received_at: {
        accessorKey: 'received_at',
        header: 'received_at',
        cell: ({ row }) => formatDate(row.original.received_at || row.original.created_at),
      },
      processed_at: {
        accessorKey: 'processed_at',
        header: 'processed_at',
        cell: ({ row }) => row.original.processed_at ? formatDate(row.original.processed_at) : '-',
      },
      delivered_at: {
        accessorKey: 'delivered_at',
        header: 'delivered_at',
        cell: ({ row }) => row.original.delivered_at ? formatDate(row.original.delivered_at) : '-',
      },
      bounced_at: {
        accessorKey: 'bounced_at',
        header: 'bounced_at',
        cell: ({ row }) => row.original.bounced_at ? formatDate(row.original.bounced_at) : '-',
      },
      created_at: {
        accessorKey: 'created_at',
        header: 'created_at',
        cell: ({ row }) => formatDate(row.original.created_at),
      },
      updated_at: {
        accessorKey: 'updated_at',
        header: 'updated_at',
        cell: ({ row }) => {
          const v = row.original.updated_at;
          return v ? formatDate(v) : '-';
        },
      },
      timestamp: {
        accessorKey: 'timestamp',
        header: 'timestamp',
        cell: ({ row }) => {
          const v = row.original.timestamp;
          return v ? formatDate(v) : '-';
        },
      },
    };

    // Localize every column header: render the translated label and expose
    // the raw field key as a native browser tooltip for power users who need
    // it for advanced filters / API calls.
    for (const k of Object.keys(allColumns)) {
      const col = allColumns[k];
      if (typeof col.header === 'string') {
        const rawKey = col.header;
        col.header = () => (
          <span title={rawKey}>{getColumnLabel(rawKey, t)}</span>
        );
      }
    }

    return columnConfigs
      .filter((c) => visibleColumns.includes(c.key))
      .map((c) => allColumns[c.key])
      .filter(Boolean);
  }, [router, t, visibleColumns]);

  async function handleExport() {
    try {
      // GT-11771 P2: forward X-Tenant-ID so a system_admin with a selected
      // tenant exports only that tenant's logs. effectiveTenantId is from
      // useTenant() (line 214) and mirrors the scope used by getEmailLogs.
      const headers: Record<string, string> = {};
      if (effectiveTenantId !== null && effectiveTenantId !== undefined) {
        headers['X-Tenant-ID'] = String(effectiveTenantId);
      }
      const blob = await exportEmailLogs(params, headers);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `email-logs-${new Date().toISOString()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('common.exportSuccess'));
    } catch {
      toast.error(t('common.exportFailed'));
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('logs.email.eyebrow')}
        title={t('logs.emailLogs')}
        description={t('logs.email.subtitle')}
        actions={<div className="flex flex-wrap gap-2">
          <ColumnSelector
            storageKey="email-logs-columns"
            columns={columnConfigs}
            onColumnsChange={handleColumnsChange}
            getLabel={(c) => getColumnLabel(c.key, t)}
            buttonLabel={t('common.selectColumns')}
            groupLabels={{
              Basic: t('logs.columnGroups.basic'),
              Auth: t('logs.columnGroups.auth'),
              GeoIP: t('logs.columnGroups.geoip'),
              SPF: t('logs.columnGroups.spf'),
              DKIM: t('logs.columnGroups.dkim'),
              DMARC: t('logs.columnGroups.dmarc'),
              CAC: t('logs.columnGroups.cac'),
              PTR: t('logs.columnGroups.ptr'),
              Rules: t('logs.columnGroups.rules'),
              Content: t('logs.columnGroups.content'),
              Result: t('logs.columnGroups.result'),
              Delivery: t('logs.columnGroups.delivery'),
              Tenant: t('logs.columnGroups.tenant'),
              Meta: t('logs.columnGroups.meta'),
              Timestamps: t('logs.columnGroups.timestamps'),
            }}
          />
          <Button onClick={handleExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {t('common.export')}
          </Button>
          <Button onClick={() => router.push('/investigations')} variant="outline">
            <Bot className="h-4 w-4 mr-2" />
            {t('investigations.title')}
          </Button>
        </div>}
      />

      <PageFilters>
        <SearchFilters
          onSearch={handleSearch}
          onReset={handleReset}
          initialAdvancedFilters={initialAdvancedFilter}
        />
      </PageFilters>

      <PageSurface className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ActionChipBar value={actionChip} onChange={handleChipChange} />
          <div className="flex flex-wrap items-center gap-3">
            {similarFilter === 'matched' && (
              <Badge variant="secondary" className="gap-1 pr-1" data-testid="similar-filter-chip">
                {t('logs.similarFilter.active')}
                <button
                  type="button"
                  onClick={handleClearSimilarFilter}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  aria-label={t('logs.similarFilter.clear')}
                  data-testid="similar-filter-clear"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('logs.dkimSignedFilter.label')}:</span>
              <Select value={dkimSignedFilter || 'all'} onValueChange={handleDkimSignedChange}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('logs.dkimSignedFilter.all')}</SelectItem>
                  <SelectItem value="true">{t('logs.dkimSignedFilter.signed')}</SelectItem>
                  <SelectItem value="false">{t('logs.dkimSignedFilter.notSigned')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </PageSurface>

      {isLoading ? (
        <PageSurface>
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">{t('common.loading')}</div>
          </div>
        </PageSurface>
      ) : (
        <PageSurface className="space-y-4">
          <DataTable columns={columns} data={data?.items ?? []} hidePagination />
          <ServerPagination
            page={page}
            pageSize={20}
            total={data?.total ?? 0}
            onPageChange={setPage}
          />
        </PageSurface>
      )}

      <EmailDetailModal
        open={effectiveDetailOpen}
        onOpenChange={handleDetailOpenChange}
        emailId={effectiveSelectedEmailId}
      />

      {aiOk && (
        <EmailAIInterpretDrawer
          open={aiInterpretEmailId !== null}
          onOpenChange={(open) => { if (!open) setAiInterpretEmailId(null); }}
          emailId={aiInterpretEmailId}
        />
      )}
    </PageShell>
  );
}
