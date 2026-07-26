'use client';

// System-status health banner (Plan Task 6, spec §4.4 综合健康状态条).
//
// `resolveHealthLevel` is the pure three-level decision function: it looks at
// the (already scope-filtered by hooks.ts) alert list and picks the worst
// level present — danger > warning > normal. `info`-level items (used by
// hooks.ts for tenant-scope backlog items like pending disposal) never
// escalate the banner past `normal`; they only ever surface in the
// todo-alerts list. `n` is the count of items AT the winning level (0 for
// `normal`, since there are no danger/warning items to count) — the caller
// substitutes the real "threats blocked" count for the `normal` message's
// `{n}` placeholder (spec: "已拦截 N 封威胁邮件"), which is not something
// this pure function has access to.
import { useTranslations } from 'next-intl';
import { ShieldAlert, AlertTriangle, CheckCircle2, CloudOff } from 'lucide-react';
import {
  StatusBanner,
  type StatusBannerTone,
} from '@/components/shared/status-banner';
import { Skeleton } from '@/components/ui/skeleton';
import type { SystemStatusAlertLevel, SystemStatusRange } from './hooks';

export type HealthLevel = 'danger' | 'warning' | 'normal';

export interface HealthLevelResolution {
  level: HealthLevel;
  /** Relative key under the `systemStatus.health` namespace. */
  key: HealthLevel;
  /** Count of alert items at the winning level (0 for `normal`). */
  n: number;
}

export function resolveHealthLevel(alerts: { level: SystemStatusAlertLevel }[]): HealthLevelResolution {
  const dangerCount = alerts.filter((a) => a.level === 'danger').length;
  if (dangerCount > 0) {
    return { level: 'danger', key: 'danger', n: dangerCount };
  }
  const warningCount = alerts.filter((a) => a.level === 'warning').length;
  if (warningCount > 0) {
    return { level: 'warning', key: 'warning', n: warningCount };
  }
  return { level: 'normal', key: 'normal', n: 0 };
}

const LEVEL_STYLES: Record<HealthLevel, { icon: typeof ShieldAlert; tone: StatusBannerTone }> = {
  danger: {
    icon: ShieldAlert,
    tone: 'danger',
  },
  warning: {
    icon: AlertTriangle,
    tone: 'warning',
  },
  normal: {
    icon: CheckCircle2,
    tone: 'success',
  },
};

// Neutral (slate) style for the data-load-failure state — deliberately NOT
// green, so a failed fetch never reads as "系统运行正常".
const ERROR_STYLE = {
  icon: CloudOff,
  tone: 'neutral',
} as const satisfies { icon: typeof CloudOff; tone: StatusBannerTone };

interface HealthBannerProps {
  alerts: { level: SystemStatusAlertLevel }[];
  /** Threats-blocked count for the current range — used as the `{n}` value in the `normal` message only. */
  threats: number;
  range: SystemStatusRange;
  isLoading: boolean;
  /** The combined dashboard query rejected — show a neutral "load failed" banner instead of a false-green healthy one. */
  isError?: boolean;
}

export function HealthBanner({ alerts, threats, range, isLoading, isError }: HealthBannerProps) {
  const t = useTranslations('systemStatus.health');
  const tRange = useTranslations('systemStatus.range');

  if (isLoading) {
    return <Skeleton className="h-[46px] w-full rounded-lg" />;
  }

  if (isError) {
    const { icon: EIcon, tone } = ERROR_STYLE;
    return (
      <StatusBanner
        tone={tone}
        icon={EIcon}
        data-testid="system-status-health-banner"
        data-level="error"
      >
        {t('error')}
      </StatusBanner>
    );
  }

  const { level, key, n } = resolveHealthLevel(alerts);
  const { icon: Icon, tone } = LEVEL_STYLES[level];
  const messageN = level === 'normal' ? threats : n;
  const message = t(key as Parameters<typeof t>[0], { n: messageN, range: tRange(range as Parameters<typeof tRange>[0]) });

  return (
    <StatusBanner
      tone={tone}
      icon={Icon}
      data-testid="system-status-health-banner"
      data-level={level}
    >
      {message}
    </StatusBanner>
  );
}
