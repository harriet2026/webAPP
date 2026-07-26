'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Image, Download, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { EmailPreviewAttachment } from '@/types/email-preview';

interface EmailAttachmentListProps {
  attachments: EmailPreviewAttachment[];
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return <Image className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function isPreviewable(contentType: string): boolean {
  return (
    contentType === 'application/pdf' ||
    contentType.startsWith('image/') ||
    contentType.startsWith('text/')
  );
}

export function EmailAttachmentList({ attachments }: EmailAttachmentListProps) {
  const t = useTranslations('emailPreview');
  const [previewAttachment, setPreviewAttachment] = useState<EmailPreviewAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  if (attachments.length === 0) return null;

  const handlePreview = (att: EmailPreviewAttachment) => {
    setPreviewAttachment(att);
    if (att.content_type.startsWith('text/') && att.content_length > 0 && att.content_length < 10240) {
      setPreviewLoading(true);
      setPreviewUrl(null);
    } else if (isPreviewable(att.content_type)) {
      setPreviewLoading(true);
      setPreviewUrl(null);
    }
  };

  const closePreview = () => {
    setPreviewAttachment(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewLoading(false);
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">
        {t('attachments')} ({attachments.length})
      </h4>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
          >
            {getFileIcon(att.content_type)}
            <div className="min-w-0">
              <div className="max-w-[200px] truncate text-sm font-medium">{att.filename || 'unnamed'}</div>
              <div className="text-xs text-muted-foreground">
                {formatFileSize(att.size)} &middot; {att.content_type}
              </div>
            </div>
            {isPreviewable(att.content_type) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handlePreview(att)}
                title={t('previewFile')}
              >
                <FileText className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{previewAttachment?.filename}</span>
              <Button variant="ghost" size="icon" onClick={closePreview}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-[300px] overflow-auto">
            {previewLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            )}
            {previewAttachment && previewAttachment.content_type === 'application/pdf' && (
              <embed
                src={previewUrl || ''}
                type="application/pdf"
                className="h-[500px] w-full"
              />
            )}
            {previewAttachment && previewAttachment.content_type.startsWith('image/') && previewUrl && (
              <img
                src={previewUrl}
                alt={previewAttachment.filename}
                className="max-h-[500px] max-w-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
