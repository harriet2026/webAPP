'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getPlatformSandboxPolicy, savePlatformSandboxPolicy } from '@/lib/api/attachment-security';
import type { PlatformSandboxPolicy } from '@/types/attachment-security';

export function SandboxPlatformPanel() {
  const t = useTranslations('platformSecurity');
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['platform-sandbox-policy'],
    queryFn: () => getPlatformSandboxPolicy(),
  });
  const [config, setConfig] = useState<PlatformSandboxPolicy>({
    max_file_size_mb: 20,
    analysis_timeout_seconds: 120,
  });

  useEffect(() => {
    if (data) {
      setConfig(data);
    }
  }, [data]);

  async function save() {
    await savePlatformSandboxPolicy(config);
    await queryClient.invalidateQueries({ queryKey: ['platform-sandbox-policy'] });
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5" aria-labelledby="sandbox-platform-title">
      <div>
        <h2 id="sandbox-platform-title" className="text-base font-semibold">{t('sandbox.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('sandbox.description')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="platform-sandbox-max-size">{t('sandbox.maxFileSize')}</Label>
          <div className="flex items-center gap-2">
            <Input id="platform-sandbox-max-size" type="number" min={1} value={config.max_file_size_mb} disabled={isLoading} onChange={(e) => setConfig({ ...config, max_file_size_mb: Number(e.target.value) || 0 })} />
            <span className="text-sm text-muted-foreground">MB</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform-sandbox-timeout">{t('sandbox.timeout')}</Label>
          <div className="flex items-center gap-2">
            <Input id="platform-sandbox-timeout" type="number" min={1} value={config.analysis_timeout_seconds} disabled={isLoading} onChange={(e) => setConfig({ ...config, analysis_timeout_seconds: Number(e.target.value) || 0 })} />
            <span className="text-sm text-muted-foreground">{t('sandbox.seconds')}</span>
          </div>
        </div>
      </div>
      <div className="flex justify-end"><Button type="button" onClick={save} disabled={isLoading}>{t('sandbox.save')}</Button></div>
    </section>
  );
}
