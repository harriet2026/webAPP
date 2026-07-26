'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import type { EmailPreviewResponse } from '@/types/email-preview';
import { EmailHtmlView } from './email-html-view';
import { EmailAttachmentList } from './email-attachment-list';

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: EmailPreviewResponse | null;
  isLoading: boolean;
  onDownload: () => void;
  extraBadges?: React.ReactNode;
}

function formatRecipients(recipients: { addr: string; name?: string }[]): string {
  return recipients
    .map((r) => r.name ? `${r.name} <${r.addr}>` : r.addr)
    .join(', ');
}

export function EmailPreviewDialog({
  open,
  onOpenChange,
  preview,
  isLoading,
  onDownload,
  extraBadges,
}: EmailPreviewDialogProps) {
  const t = useTranslations('emailPreview');
  const [headersOpen, setHeadersOpen] = useState(false);

  const handleDownload = useCallback(() => {
    onDownload();
  }, [onDownload]);

  if (!open) return null;

  const hasHtml = !!preview?.html_body;
  const hasText = !!preview?.text_body;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              {t('title')}
            </DialogTitle>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-1 h-3 w-3" />
              {t('downloadEml')}
            </Button>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : preview ? (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-1 text-sm">
              <div>
                <span className="font-medium">{t('subject')}:</span>{' '}
                {preview.subject || '-'}
              </div>
              <div>
                <span className="font-medium">{t('from')}:</span>{' '}
                {preview.from_name
                  ? `${preview.from_name} <${preview.from}>`
                  : preview.from}
              </div>
              {preview.to && preview.to.length > 0 && (
                <div>
                  <span className="font-medium">{t('to')}:</span>{' '}
                  {formatRecipients(preview.to)}
                </div>
              )}
              {preview.cc && preview.cc.length > 0 && (
                <div>
                  <span className="font-medium">Cc:</span>{' '}
                  {formatRecipients(preview.cc)}
                </div>
              )}
            </div>

            {extraBadges && <div className="flex flex-wrap gap-1">{extraBadges}</div>}

            {preview.parse_error && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
                {t('parseError')}: {preview.parse_error}
              </div>
            )}

            <div className="border-t pt-4">
              {hasHtml ? (
                <EmailHtmlView htmlBody={preview.html_body} />
              ) : hasText ? (
                <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded border bg-muted p-4 text-sm">
                  {preview.text_body}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">{t('noContent')}</p>
              )}
            </div>

            {preview.attachments && preview.attachments.length > 0 && (
              <div className="border-t pt-4">
                <EmailAttachmentList attachments={preview.attachments} />
              </div>
            )}

            <div className="border-t pt-4">
              <Collapsible open={headersOpen} onOpenChange={setHeadersOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                  <ChevronRight className={`h-4 w-4 transition-transform ${headersOpen ? 'rotate-90' : ''}`} />
                  {t('rawHeaders')}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 max-h-[300px] overflow-auto rounded border bg-muted p-3">
                    <table className="w-full text-xs">
                      <tbody>
                        {Object.entries(preview.headers)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([key, value]) => (
                            <tr key={key} className="border-b last:border-0">
                              <td className="w-40 whitespace-nowrap pr-4 font-medium">
                                {key}
                              </td>
                              <td className="break-all font-mono">{value}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
