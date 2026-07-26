'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useApiRequest } from '@/lib/api/client';

interface VersionInfo {
  rev: string;
  built: string;
  modified: boolean;
  build_tag: string;
}

// VersionFooter shows the running build's identity at the bottom of the sidebar
// so operators/admins can conveniently confirm which version is running
// (GT-11459 / PHISH-21). Full detail (commit / build time / tag) is in the
// hover title; the line itself stays compact.
export function VersionFooter() {
  const { apiRequest } = useApiRequest();
  const t = useTranslations();
  const { data } = useQuery<VersionInfo>({
    queryKey: ['app-version'],
    queryFn: () => apiRequest<VersionInfo>('/version'),
    staleTime: Infinity,
    retry: 1,
  });

  // Guard on `rev` being a string, not merely on `data` existing: a truthy
  // response of an unexpected shape (proxy error page, API version skew, a
  // generic {items:[]} envelope) would otherwise slip past a bare `!data`
  // check and crash `data.rev.slice(...)` — and since this footer lives in the
  // global sidebar, that white-screens the entire app. Render nothing instead.
  if (!data || typeof data.rev !== 'string') return null;
  const rev = data.rev === 'unknown' ? data.rev : data.rev.slice(0, 7);
  return (
    <div
      className="border-t border-white/8 px-5 py-3 text-[11px] text-sidebar-foreground/50"
      data-testid="app-version-footer"
      title={`rev=${data.rev}${data.modified ? '+dirty' : ''} built=${data.built} build_tag=${data.build_tag}`}
    >
      {t('common.version')} {rev}
      {data.modified ? '+dirty' : ''}
    </div>
  );
}
