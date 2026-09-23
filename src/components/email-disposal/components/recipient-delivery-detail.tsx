'use client';

import { useTranslations } from 'next-intl';
import type { MailChildEvent, RecipientDisposition } from '@/types/email-disposal-detail';

const DELIVERY_RESULTS = new Set([
  'sent', 'success', 'delivered', 'deferred', 'bounced', 'expired', 'failed', 'delivery_failed',
]);

function normalizedAddress(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function eventRecipients(event: MailChildEvent): string[] {
  if (event.recipient?.trim()) return [normalizedAddress(event.recipient)];
  return (event.recipients ?? '')
    .split(',')
    .map(normalizedAddress)
    .filter(Boolean);
}

function isDeliveryAttempt(event: MailChildEvent): boolean {
  const source = event.event_source.toLowerCase();
  return (source.startsWith('postfix') || source === 'forwardworker')
    && DELIVERY_RESULTS.has(event.event_result.toLowerCase());
}

function latestDeliveryEvent(
  recipient: string,
  events: MailChildEvent[] | undefined,
): MailChildEvent | undefined {
  const target = normalizedAddress(recipient);
  return events
    ?.filter((event) => isDeliveryAttempt(event) && eventRecipients(event).includes(target))
    .reduce<MailChildEvent | undefined>((latest, event) => {
      if (!latest) return event;
      const latestTime = Date.parse(latest.event_time);
      const eventTime = Date.parse(event.event_time);
      if (Number.isNaN(latestTime) || Number.isNaN(eventTime)) {
        return event.id > latest.id ? event : latest;
      }
      if (eventTime === latestTime) return event.id > latest.id ? event : latest;
      return eventTime > latestTime ? event : latest;
    }, undefined);
}

function isFailed(disposition: RecipientDisposition, event: MailChildEvent): boolean {
  const status = `${disposition.status} ${event.event_result}`.toLowerCase();
  return status.includes('fail') || status.includes('bounce') || status.includes('expired');
}

interface RecipientDeliveryDetailProps {
  disposition: RecipientDisposition;
  events?: MailChildEvent[];
}

/**
 * Shows the latest real SMTP/forward-worker attempt for one recipient. The
 * explicit empty state is intentional: a terminal projection can outlive its
 * retained child event, and hiding that distinction makes "failed" look like
 * a UI rendering fault instead of unavailable evidence.
 */
export function RecipientDeliveryDetail({ disposition, events }: RecipientDeliveryDetailProps) {
  const t = useTranslations('emailDisposal.detail.delivery');
  const event = latestDeliveryEvent(disposition.recipient, events);

  if (!event) {
    return (
      <div
        className="break-words text-[11px] text-muted-foreground"
        data-testid={`email-disposal-delivery-detail-${disposition.recipient}`}
      >
        {t('noDetail')}
      </div>
    );
  }

  const error = event.dsn || event.smtp_status_code || disposition.dsn_status || disposition.reason || '—';
  return (
    <div
      className="break-words text-[11px] text-muted-foreground"
      data-testid={`email-disposal-delivery-detail-${disposition.recipient}`}
    >
      {t('time')}: {event.event_time || '—'}
      {isFailed(disposition, event) && ` · ${t('errorMessage')}: ${error}`}
    </div>
  );
}
