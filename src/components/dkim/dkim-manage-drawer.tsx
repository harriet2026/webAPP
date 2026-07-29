'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  KeyRound,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DkimStatusBadge } from '@/components/dkim/dkim-status-badge';
import {
  listDkimKeys,
  generateDkimKey,
  importDkimKey,
  verifyDkimDns,
  setDkimKeyStatus,
  deleteDkimKey,
  type DkimKey,
  type DkimAlgorithm,
  type GenerateDkimKeyRequest,
} from '@/lib/api/dkim';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

const SELECTOR_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const DKIM_SETUP_DOC = 'https://github.com/your-org/osgateway/blob/master/doc/dkim-setup.md';

type AlgorithmChoice = 'rsa-2048' | 'rsa-3072' | 'rsa-4096' | 'ed25519';

const ALGO_OPTIONS: { value: AlgorithmChoice; labelKey: string }[] = [
  { value: 'rsa-2048', labelKey: 'algo.rsa2048' },
  { value: 'rsa-3072', labelKey: 'algo.rsa3072' },
  { value: 'rsa-4096', labelKey: 'algo.rsa4096' },
  { value: 'ed25519', labelKey: 'algo.ed25519' },
];

function algoChoiceToRequest(choice: AlgorithmChoice): { algorithm: DkimAlgorithm; key_size?: 2048 | 3072 | 4096 } {
  switch (choice) {
    case 'rsa-2048':
      return { algorithm: 'rsa-sha256', key_size: 2048 };
    case 'rsa-3072':
      return { algorithm: 'rsa-sha256', key_size: 3072 };
    case 'rsa-4096':
      return { algorithm: 'rsa-sha256', key_size: 4096 };
    case 'ed25519':
      return { algorithm: 'ed25519-sha256' };
  }
}

interface DkimManageDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  domain: string;
}

export function DkimManageDrawer({ open, onOpenChange, tenantId, domain }: DkimManageDrawerProps) {
  const t = useTranslations('dkim');
  const queryClient = useQueryClient();

  const [genOpen, setGenOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // generate form
  const [genSelector, setGenSelector] = useState('');
  const [genAlgo, setGenAlgo] = useState<AlgorithmChoice>('rsa-2048');
  const [genNote, setGenNote] = useState('');

  // import form
  const [impSelector, setImpSelector] = useState('');
  const [impPem, setImpPem] = useState('');
  const [impNote, setImpNote] = useState('');

  // activate confirm
  const [activateTarget, setActivateTarget] = useState<DkimKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DkimKey | null>(null);

  const queryKey = ['dkim-keys', tenantId, domain];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listDkimKeys({ tenant_id: tenantId, domain, page: 1, page_size: 100 }),
    enabled: open && !!tenantId && !!domain,
  });

  const keys = data?.items ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const generateMutation = useMutation({
    mutationFn: (req: GenerateDkimKeyRequest) => generateDkimKey(req),
    onSuccess: () => {
      toast.success(t('generateSuccess'));
      setGenOpen(false);
      setGenSelector('');
      setGenNote('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importMutation = useMutation({
    mutationFn: () =>
      importDkimKey({ tenant_id: tenantId, domain, selector: impSelector, private_key_pem: impPem, note: impNote || undefined }),
    onSuccess: () => {
      toast.success(t('importSuccess'));
      setImportOpen(false);
      setImpSelector('');
      setImpPem('');
      setImpNote('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) => verifyDkimDns(id),
    onSuccess: (res) => {
      toast.success(t(`dnsStatus.${res.dns_status}`));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => setDkimKeyStatus(id, true),
    onSuccess: () => {
      toast.success(t('activateSuccess'));
      setActivateTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDkimKey(id),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      setDeleteTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleGenerate = () => {
    if (!SELECTOR_RE.test(genSelector)) {
      toast.error(t('selectorInvalid'));
      return;
    }
    const algo = algoChoiceToRequest(genAlgo);
    generateMutation.mutate({ tenant_id: tenantId, domain, selector: genSelector, note: genNote || undefined, ...algo });
  };

  const handleImport = () => {
    if (!SELECTOR_RE.test(impSelector)) {
      toast.error(t('selectorInvalid'));
      return;
    }
    if (!impPem.trim()) {
      toast.error(t('pemRequired'));
      return;
    }
    importMutation.mutate();
  };

  const copyDnsRecord = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {t('manageTitle', { domain })}
            </SheetTitle>
            <SheetDescription className="flex items-center gap-1">
              {t('manageDescription')}
              <a
                href={DKIM_SETUP_DOC}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                {t('setupGuide')}
                <ExternalLink className="h-3 w-3" />
              </a>
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1 px-4">
            <div className="space-y-4 pb-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setGenOpen((v) => !v)}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t('generateNew')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImportOpen((v) => !v)}>
                  <Upload className="mr-1 h-4 w-4" />
                  {t('importKey')}
                </Button>
              </div>

              {genOpen && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <h4 className="text-sm font-semibold">{t('generateNew')}</h4>
                  <div className="space-y-1.5">
                    <Label>{t('selector')} *</Label>
                    <Input
                      value={genSelector}
                      onChange={(e) => setGenSelector(e.target.value)}
                      placeholder="s2026"
                    />
                    <p className="text-xs text-muted-foreground">{t('selectorHint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('algorithm')}</Label>
                    <Select value={genAlgo} onValueChange={(v) => setGenAlgo(v as AlgorithmChoice)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALGO_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {t(o.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('note')}</Label>
                    <Input value={genNote} onChange={(e) => setGenNote(e.target.value)} />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleGenerate} disabled={generateMutation.isPending}>
                      {generateMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      {t('generateNew')}
                    </Button>
                  </div>
                </div>
              )}

              {importOpen && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <h4 className="text-sm font-semibold">{t('importKey')}</h4>
                  <div className="space-y-1.5">
                    <Label>{t('selector')} *</Label>
                    <Input
                      value={impSelector}
                      onChange={(e) => setImpSelector(e.target.value)}
                      placeholder="default"
                    />
                    <p className="text-xs text-muted-foreground">{t('selectorHint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('privateKeyPem')} *</Label>
                    <Textarea
                      value={impPem}
                      onChange={(e) => setImpPem(e.target.value)}
                      rows={6}
                      className="font-mono text-xs"
                      placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('note')}</Label>
                    <Input value={impNote} onChange={(e) => setImpNote(e.target.value)} />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleImport} disabled={importMutation.isPending}>
                      {importMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      {t('importKey')}
                    </Button>
                  </div>
                </div>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : keys.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('noKeys')}</p>
              ) : (
                <div className="space-y-3">
                  {keys.map((k) => (
                    <DkimKeyCard
                      key={k.id}
                      dkimKey={k}
                      onVerify={() => verifyMutation.mutate(k.id)}
                      verifying={verifyMutation.isPending && verifyMutation.variables === k.id}
                      onActivate={() => setActivateTarget(k)}
                      onDelete={() => setDeleteTarget(k)}
                      onCopyDns={copyDnsRecord}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!activateTarget}
        onOpenChange={(o) => !o && setActivateTarget(null)}
        title={t('activateConfirmTitle')}
        description={t('activateConfirmDesc', { selector: activateTarget?.selector ?? '' })}
        onConfirm={() => activateTarget && activateMutation.mutate(activateTarget.id)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDesc', { selector: deleteTarget?.selector ?? '' })}
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}

interface DkimKeyCardProps {
  dkimKey: DkimKey;
  onVerify: () => void;
  verifying: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onCopyDns: (text: string) => void;
}

function DkimKeyCard({ dkimKey, onVerify, verifying, onActivate, onDelete, onCopyDns }: DkimKeyCardProps) {
  const t = useTranslations('dkim');
  const algoLabel = dkimKey.algorithm === 'ed25519-sha256' ? 'Ed25519' : `RSA-${dkimKey.key_size ?? '?'}`;
  // The active key cannot be deleted: the admin must switch to another selector first.
  const deleteDisabled = dkimKey.is_active;

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{dkimKey.selector}</span>
        {dkimKey.is_active && (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {t('active')}
          </Badge>
        )}
        <Badge variant="outline">{algoLabel}</Badge>
        <DkimStatusBadge status={dkimKey.dns_status} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {t('created')}: {formatDate(dkimKey.created_at)}
        </span>
        {dkimKey.dns_checked_at && (
          <span>
            {t('dnsCheckedAt')}: {formatDate(dkimKey.dns_checked_at)}
          </span>
        )}
      </div>

      {dkimKey.note && <p className="text-sm text-muted-foreground">{dkimKey.note}</p>}
      {dkimKey.dns_error && <p className="text-sm text-destructive break-all">{dkimKey.dns_error}</p>}

      <div className="space-y-1.5 rounded-lg border border-border/50 bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t('pendingDnsRecord')}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => onCopyDns(`${dkimKey.dns_record_name}\tTXT\t${dkimKey.dns_record}`)}
          >
            <Copy className="mr-1 h-3 w-3" />
            {t('copy')}
          </Button>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">{t('dnsRecordName')}: </span>
          <span className="font-mono break-all">{dkimKey.dns_record_name}</span>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">{t('dnsRecordValue')}: </span>
          <span className="font-mono break-all">{dkimKey.dns_record}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onVerify} disabled={verifying}>
          {verifying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          {t('reverify')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onActivate}
          disabled={dkimKey.is_active || dkimKey.dns_status !== 'verified'}
        >
          {t('setActive')}
        </Button>
        {deleteDisabled ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex" />
              }
            >
              <Button variant="outline" size="sm" className="text-destructive" disabled>
                <Trash2 className="mr-1 h-3 w-3" />
                {t('delete')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('switchBeforeDelete')}</TooltipContent>
          </Tooltip>
        ) : (
          <Button variant="outline" size="sm" className="text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1 h-3 w-3" />
            {t('delete')}
          </Button>
        )}
      </div>
    </div>
  );
}
