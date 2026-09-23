'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ApiError, useApiRequest, type ApiRequestFn } from '@/lib/api/client';
import { getScreenshot } from '@/lib/api/phishing-detection';
import type { ScreenshotObservation } from '@/types/phishing-detection';

const omissionReasons = new Set([
  'screenshot_missing', 'screenshot_invalid_base64', 'screenshot_invalid_image',
  'screenshot_too_large', 'screenshot_metadata_too_large', 'storage_capability_unavailable',
  'no_storage_node', 'screenshot_save_failed', 'screenshot_conflict', 'http_fallback',
  'crawl4ai_response_too_large',
]);

export function ScreenshotCapture({ capture, index = 1 }: { capture: ScreenshotObservation; index?: number }) {
  const t = useTranslations('phishingDetection.screenshot');
  const format = useFormatter();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const date = new Date(capture.captured_at);
  const reason = capture.screenshot_omitted;
  const key = capture.screenshot_ref?.key;

  return (
    <figure className="mt-3 space-y-2 rounded-lg border border-border bg-background p-3" data-testid="phishing-screenshot">
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t('capture', { index })}</span>
        {!Number.isNaN(date.getTime()) ? <time dateTime={capture.captured_at}>{format.dateTime(date, { dateStyle: 'short', timeStyle: 'medium' })}</time> : null}
      </figcaption>
      {capture.final_url && capture.final_url !== capture.url ? <p className="break-all text-xs text-muted-foreground">{t('finalUrl')}: {capture.final_url}</p> : null}
      {key ? <ScreenshotImage key={`${effectiveTenantId}:${key}`} objectKey={key} request={apiRequest} /> :
        <p className="text-xs text-muted-foreground">{t(omissionReasons.has(reason ?? '') ? `reasons.${reason}` : 'notSaved')}</p>}
    </figure>
  );
}

function ScreenshotImage({ objectKey, request }: { objectKey: string; request: ApiRequestFn }) {
  const t = useTranslations('phishingDetection.screenshot');
  const [image, setImage] = useState<{ url?: string; status: 'loading' | 'ready' | 'unavailable' | 'offline' }>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    getScreenshot(objectKey, request, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setImage({ url: objectUrl, status: 'loading' });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setImage({ status: error instanceof ApiError && (error.status === 0 || error.status === 502 || error.status === 503) ? 'offline' : 'unavailable' });
      }
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectKey, request]);

  return (
    <div className="space-y-2">
      {image.status !== 'ready' ? <p role="status" className="text-xs text-muted-foreground">{t(image.status)}</p> : null}
      {image.url && image.status !== 'unavailable' ? (
        <a href={image.url} target="_blank" rel="noopener noreferrer" aria-label={t('open')}>
          {/* Browser-owned blob URLs are already authenticated and must bypass image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={t('alt')} className="max-h-72 max-w-full rounded-md object-contain object-left" onLoad={() => setImage((current) => ({ ...current, status: 'ready' }))} onError={() => setImage({ status: 'unavailable' })} />
        </a>
      ) : null}
    </div>
  );
}
