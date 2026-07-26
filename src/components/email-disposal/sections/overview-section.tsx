'use client';

import { useApiRequest } from '@/lib/api/client';
import type { MailLogDetail, MailChildEvent } from '@/types/email-disposal-detail';
import { ThreatSummaryCard } from './overview/threat-summary-card';
import { SendReceiveContextCard } from './overview/send-receive-context-card';
import { InvestigationWorkbench } from './overview/investigation-workbench';

interface OverviewSectionProps {
  detail: MailLogDetail;
  onRefetch: () => void;
  // 「AI 判定依据」分区依赖 log-interpret 服务开关（capabilities.ai && features.aiInterpret）。
  aiInterpretEnabled?: boolean;
  // Per-recipient delivery events (mail_child_events), fetched by detail-modal.tsx's
  // eventsQ and threaded down to RecipientStatus for the delivered-status detail line
  // that restores tabs/delivery-tab.tsx's content (DD-11 part 2).
  events?: MailChildEvent[];
  // Platform-wide (system_admin, all-tenant) drill-down is view-only (spec
  // §4.2/§6.1's readOnly drill-down). Computed ONCE by EmailDisposalCenterPage
  // via resolveSecurityScope's normalized effectiveViewer and threaded down
  // through DetailModal, rather than re-derived here from the raw
  // useProductForm().viewer -- re-deriving it here missed the normalization
  // that folds "viewer=tenant, system_admin, no selected tenant" into
  // platform-wide scope, which would leave dispose actions enabled in the
  // detail drawer while the list page correctly showed platform-wide/readonly
  // (review finding: readOnly desync between list and detail).
  readOnly?: boolean;
  // Scrolls the drawer to the "安全分析" section so the compact disposal-basis
  // summary here can jump to the full basis box (mirrors the demo's overview →
  // security-analysis "查看依据详情" link). Provided by detail-modal.tsx.
  onViewBasis?: () => void;
}

export function OverviewSection({ detail, onRefetch, aiInterpretEnabled = true, events, readOnly = false, onViewBasis }: OverviewSectionProps) {
  const { apiRequest } = useApiRequest();

  // A6's multi-recipient hint / A5's single-recipient dispose-button gating
  // (SenderActions, threaded through ThreatSummaryCard) key off exactly one
  // recipient on the envelope -- mirrors the demo's `recipientEmails.length`.
  const isSingleRecipient = (detail.recipients?.length ?? 0) === 1;

  return (
    <div className="space-y-4">
      <ThreatSummaryCard
        detail={detail}
        apiRequest={apiRequest}
        isSingleRecipient={isSingleRecipient}
        readOnly={readOnly}
        onDisposed={onRefetch}
        onViewBasis={onViewBasis}
      />

      <SendReceiveContextCard
        detail={detail}
        apiRequest={apiRequest}
        onDisposed={onRefetch}
        readOnly={readOnly}
        events={events}
      />

      {/* 研判工作台（C1-C7）：左=邮件原文三视图，右=内容实体检测（Task 9 的
          EntityDetection）。取代此前简单的「查看原文/下载原文 + <pre>」块。 */}
      <InvestigationWorkbench
        detail={detail}
        requestFn={apiRequest}
        readOnly={readOnly}
        onDisposed={onRefetch}
      />
    </div>
  );
}
