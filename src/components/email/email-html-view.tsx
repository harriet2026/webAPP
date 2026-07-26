'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ImageIcon } from 'lucide-react';
import { EmailLinkWarning } from './email-link-warning';

interface EmailHtmlViewProps {
  htmlBody: string;
}

const BLOCKED_IMG_SELECTOR = 'img[data-blocked="true"]';
const LINK_CLICK_MESSAGE = 'osg-link-click';

/**
 * Trusted bridge script injected INTO the srcDoc.
 *
 * The iframe runs under an opaque-origin sandbox (`allow-scripts` WITHOUT
 * `allow-same-origin`), so the parent can never reach `iframe.contentDocument`.
 * Instead of post-load DOM access (which is null under an opaque origin), this
 * script intercepts anchor clicks inside the iframe, blocks the default
 * navigation, and forwards the href to the parent via postMessage so the React
 * component can show the EmailLinkWarning dialog. DOMPurify has already stripped
 * every author script, so this fixed trusted script is the only code that runs.
 */
const BRIDGE_SCRIPT = `<script>(function(){
  document.addEventListener('click', function(e){
    var el = e.target;
    var anchor = el && el.closest ? el.closest('a') : null;
    if (!anchor) return;
    // Block ALL in-iframe navigation (opaque origin + no allow-same-origin).
    e.preventDefault();
    e.stopPropagation();
    var href = anchor.getAttribute('href');
    if (!href) return;
    if (href.charAt(0) === '#') return;
    if (href.indexOf('mailto:') === 0) return;
    try {
      window.parent.postMessage({ type: ${JSON.stringify(LINK_CLICK_MESSAGE)}, href: href }, '*');
    } catch (err) {}
  }, true);
})();<\/script>`;

/**
 * Re-render the sanitized HTML STRING with the previously-blocked images
 * restored. The backend (`internal/sanitizer/html.go`) already swapped remote
 * `<img src>` for a placeholder + `data-src`/`data-blocked` markers; here we
 * put the real src back. This drives the show/hide-images gate off React state
 * re-rendering the srcDoc string, NOT post-load DOM mutation (impossible under
 * the opaque-origin sandbox).
 */
function restoreBlockedImages(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(BLOCKED_IMG_SELECTOR).forEach((node) => {
    const img = node as HTMLImageElement;
    const dataSrc = img.getAttribute('data-src');
    if (dataSrc) {
      img.setAttribute('src', dataSrc);
      img.removeAttribute('data-blocked');
      img.removeAttribute('data-src');
    }
  });
  return doc.body.innerHTML;
}

export function EmailHtmlView({ htmlBody }: EmailHtmlViewProps) {
  const t = useTranslations('emailPreview');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showImages, setShowImages] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const sanitizedHtml = useMemo(
    () =>
      DOMPurify.sanitize(htmlBody, {
        ADD_TAGS: ['style'],
        ADD_ATTR: ['data-src', 'data-blocked', 'target', 'rel'],
      }),
    [htmlBody],
  );

  const hasBlockedImages = useMemo(
    () => sanitizedHtml.includes('data-blocked="true"'),
    [sanitizedHtml],
  );

  // The srcDoc string is the single source of truth: it re-renders whenever
  // "show images" is toggled, so the images gate works without DOM mutation.
  const srcDoc = useMemo(() => {
    const bodyHtml = showImages ? restoreBlockedImages(sanitizedHtml) : sanitizedHtml;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${bodyHtml}${BRIDGE_SCRIPT}</body></html>`;
  }, [sanitizedHtml, showImages]);

  const handleShowImages = useCallback(() => {
    setShowImages(true);
  }, []);

  // Cross-origin bridge: the injected script postMessages link clicks up to us.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const iframe = iframeRef.current;
      // Only trust messages coming from THIS iframe's window.
      if (!iframe || event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (
        data &&
        typeof data === 'object' &&
        data.type === LINK_CLICK_MESSAGE &&
        typeof data.href === 'string'
      ) {
        setLinkUrl(data.href);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleLinkContinue = useCallback(() => {
    if (linkUrl) {
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
    }
    setLinkUrl(null);
  }, [linkUrl]);

  return (
    <div className="space-y-2">
      {hasBlockedImages && !showImages && (
        <div className="flex items-center justify-between rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 dark:border-yellow-900 dark:bg-yellow-950">
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            {t('imagesBlocked')}
          </span>
          <Button variant="outline" size="sm" onClick={handleShowImages}>
            <ImageIcon className="mr-1 h-3 w-3" />
            {t('showImages')}
          </Button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        // allow-scripts (for the trusted bridge only) but NOT allow-same-origin
        // and NOT allow-popups: the iframe cannot reach parent cookies/storage,
        // and cannot open windows on its own — every link goes through the
        // EmailLinkWarning flow below.
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        className="h-[500px] w-full rounded border"
        title="Email content"
      />
      <EmailLinkWarning
        url={linkUrl}
        onContinue={handleLinkContinue}
        onCancel={() => setLinkUrl(null)}
      />
    </div>
  );
}
