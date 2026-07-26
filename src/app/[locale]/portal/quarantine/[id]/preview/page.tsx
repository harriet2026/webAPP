'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EmailHtmlView } from '@/components/email/email-html-view';
import type { EmailPreviewResponse } from '@/types/email-preview';

type Status = 'loading' | 'ready' | 'expired' | 'purged' | 'error';

export default function PortalPreviewPage() {
  const t = useTranslations('portalPreview');
  const params = useParams();
  const sp = useSearchParams();
  const id = params.id as string;
  const token = sp?.get('token') ?? '';
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<EmailPreviewResponse | null>(null);

  useEffect(() => {
    fetch(`/api/portal/quarantine/${id}/preview?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.status === 200) {
          setData(await r.json());
          setStatus('ready');
        } else if (r.status === 401) {
          // Bad / expired / wrong-action (e.g. a release token) signature.
          setStatus('expired');
        } else if (r.status === 404) {
          // Signed link still valid, but retention purged the mail (default
          // retention 14d < default token life 30d) — say so explicitly.
          setStatus('purged');
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [id, token]);

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>{t('loading')}</span>
      </div>
    );
  }

  if (status !== 'ready' || !data) {
    const titleKey = status === 'expired' ? 'expiredTitle' : status === 'purged' ? 'purgedTitle' : 'errorTitle';
    const descKey = status === 'expired' ? 'expiredDesc' : status === 'purged' ? 'purgedDesc' : 'errorDesc';
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-red-600">{t(titleKey)}</h2>
        <p className="text-sm text-slate-500">{t(descKey)}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">{t('title')}</h1>
      <dl className="mb-4 space-y-1 text-sm">
        <div>
          <dt className="inline text-slate-500">{t('senderLabel')}: </dt>
          <dd className="inline">{data.from_name ? `${data.from_name} <${data.from}>` : data.from}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">{t('subjectLabel')}: </dt>
          <dd className="inline">{data.subject}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">{t('timeLabel')}: </dt>
          <dd className="inline">{data.headers?.['Date'] ?? ''}</dd>
        </div>
      </dl>
      <PortalPreviewBody html={data.html_body ?? ''} text={data.text_body ?? ''} />
    </div>
  );
}

/**
 * A quarantined mail may well be text/plain-only (plenty of spam and phishing
 * is), in which case html_body is empty and the whole body lives in text_body.
 * Rendering only the HTML part left those previews as a blank iframe — the page
 * "succeeded" and showed nothing.
 *
 * HTML is hostile content by definition, so it goes through EmailHtmlView, which
 * sandboxes it in an opaque-origin iframe — never dangerouslySetInnerHTML into
 * this page's DOM. The plain-text fallback needs no such treatment: React escapes
 * it as a text node, so it can never become markup.
 */
function PortalPreviewBody({ html, text }: { html: string; text: string }) {
  const t = useTranslations('portalPreview');
  if (html.trim()) {
    return <EmailHtmlView htmlBody={html} />;
  }
  if (text.trim()) {
    return (
      <pre
        data-testid="portal-preview-text-body"
        className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 text-sm"
      >
        {text}
      </pre>
    );
  }
  return <p className="text-sm text-slate-500">{t('emptyBody')}</p>;
}
