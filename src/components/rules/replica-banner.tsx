'use client';

// Task 9b: replica-mode banner for the rule pages (spec
// design/implement/spec/2026-07-16-rule-sync-multi-site.md, Task 9 §2).
//
// Renders ONLY when GET /api/v1/rule-sync/status reports role === 'replica'.
// This is the feature's core default-off invariant: a standalone node (the
// default, and every node before this feature existed) must render nothing
// here — `return null` before any DOM, not a hidden/collapsed element, so a
// standalone node's rule pages are byte-for-byte identical to before this
// component existed. The `rules/layout.tsx` that mounts this relies on that:
// it renders `<ReplicaBanner />` as a bare sibling with no wrapping spacer,
// so a null return contributes zero DOM and zero layout shift.
//
// isSystemAdmin gates the query itself (not just the render): the status
// endpoint is system_admin-only (registerRuleSyncStatusRoutes), so a
// tenant_admin's request would just 403 — skipping the fetch entirely avoids
// a guaranteed-failing network call on every rule-page visit for the (common)
// tenant_admin case, mirroring the same `enabled: isSystemAdmin` pattern used
// by organization-tenant-selector.tsx.
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlertTriangle, GitBranch } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useApiRequest } from '@/lib/api/client';
import { getRuleSyncStatus } from '@/lib/api/rule-sync';

export function ReplicaBanner() {
  const t = useTranslations('ruleSync.banner');
  const { isSystemAdmin } = useAuth();
  const { apiRequest } = useApiRequest();

  const { data } = useQuery({
    queryKey: ['rule-sync-status'],
    queryFn: () => getRuleSyncStatus(apiRequest),
    enabled: isSystemAdmin,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!data || data.role !== 'replica') {
    return null;
  }

  const lastSync = data.last_success_at ? new Date(data.last_success_at).toLocaleString() : t('neverSynced');
  const primaryAddr = data.primary_addr || t('unknown');
  // Spec §4.4's "同步滞后超阈值变红". The verdict is the server's (see
  // RuleSyncStatus.stale): this component only picks a palette from it, so the
  // threshold stays a single server-side value and the colour never depends on
  // how well the admin's laptop clock is set.
  const stale = data.stale;
  const dotClass = stale
    ? 'text-rose-700/70 dark:text-rose-400/70'
    : 'text-sky-700/70 dark:text-sky-400/70';

  return (
    // mb-8 deliberately matches PageHeader's `-mt-8` (page-shell.tsx): most
    // rule pages render a flush PageHeader that cancels its parent's p-8 via
    // negative margin. Placing this banner directly above it as a plain
    // sibling means that same -mt-8 now cancels this banner's mb-8 instead,
    // landing the header flush against the banner with no gap and no overlap
    // — without the layout needing any extra wrapper (see rules/layout.tsx).
    <div
      data-testid="replica-mode-banner"
      // data-stale is the stable hook for the staleness assertion: the colour
      // it drives lives in a Tailwind class string that is expected to be
      // restyled, and a test pinned to "border-rose-200" would then fail for a
      // palette change while still passing if the fresh/stale distinction were
      // dropped entirely — exactly backwards.
      data-stale={stale ? 'true' : 'false'}
      role="status"
      // Both palettes are spelled out as COMPLETE literal class strings, and
      // the near-duplication is the price of that. Tailwind finds classes by
      // scanning source text, so the tempting cleanup — one shared string with
      // the colour interpolated, `border-${c}-200 bg-${c}-50` — produces
      // classes that exist in no source file, get purged from the production
      // stylesheet, and leave the banner unstyled in prod while looking correct
      // in dev. Keep them literal.
      className={
        stale
          ? 'mb-8 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
          : 'mb-8 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm text-sky-900 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200'
      }
    >
      {stale ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
      ) : (
        <GitBranch className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
      )}
      <span className="font-medium">{t('label')}</span>
      <span className={dotClass}>·</span>
      <span>{t('lastSync', { time: lastSync })}</span>
      <span className={dotClass}>·</span>
      <span>{t('primaryAddr', { addr: primaryAddr })}</span>
      {stale && (
        // The banner exists to stop an admin misreading read-only rule pages
        // and stale rules as a bug (spec §4.4). Colour alone does not say
        // that, and colour alone is also nothing to a colour-blind or
        // screen-reader user: the reason is spelled out in words.
        <>
          <span className={dotClass}>·</span>
          <span className="font-medium">{t('staleWarning')}</span>
        </>
      )}
    </div>
  );
}
