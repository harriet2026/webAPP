'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Download, KeyRound, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DkimPrivateKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  privateKeyPem: string;
  domain: string;
  selector: string;
}

function formatDateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function DkimPrivateKeyModal({
  open,
  onOpenChange,
  privateKeyPem,
  domain,
  selector,
}: DkimPrivateKeyModalProps) {
  const t = useTranslations('dkim');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(privateKeyPem);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const handleDownload = () => {
    const filename = `dkim_${domain}_${selector}_${formatDateStamp()}.pem`;
    const blob = new Blob([privateKeyPem], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[28px] border-border/70 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-500" />
            {t('privateKeyOnceTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/40 bg-amber-50/60 p-3 text-sm text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
            {t('privateKeyOnceWarning')}
          </div>
          <pre className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-muted p-4 font-mono text-xs whitespace-pre-wrap break-all">
            {privateKeyPem}
          </pre>
        </div>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {t('copy')}
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            {t('downloadPem')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('savedClose')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
