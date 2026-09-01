'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getPlatformSandboxPolicy, savePlatformSandboxPolicy } from '@/lib/api/attachment-security';
import type { PlatformSandboxPolicy } from '@/types/attachment-security';

interface SandboxPlatformPanelProps {
  config: PlatformSandboxPolicy;
  disabled?: boolean;
  onChange: (config: PlatformSandboxPolicy) => void;
}

export function SandboxPlatformPanel({ config, disabled, onChange }: SandboxPlatformPanelProps) {
  const t = useTranslations('platformSecurity');

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5" aria-labelledby="sandbox-platform-title">
      <div>
        <h2 id="sandbox-platform-title" className="text-base font-semibold">{t('sandbox.title')}</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="platform-sandbox-max-size">{t('sandbox.maxFileSize')}</Label>
          <div className="flex items-center gap-2">
            <Input id="platform-sandbox-max-size" type="number" min={1} value={config.max_file_size_mb} disabled={disabled} onChange={(e) => onChange({ ...config, max_file_size_mb: Number(e.target.value) || 0 })} />
            <span className="text-sm text-muted-foreground">MB</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform-sandbox-timeout">{t('sandbox.timeout')}</Label>
          <div className="flex items-center gap-2">
            <Input id="platform-sandbox-timeout" type="number" min={1} value={config.analysis_timeout_seconds} disabled={disabled} onChange={(e) => onChange({ ...config, analysis_timeout_seconds: Number(e.target.value) || 0 })} />
            <span className="text-sm text-muted-foreground">{t('sandbox.seconds')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
