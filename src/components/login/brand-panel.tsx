'use client';

import { ShieldCheck, Bot, FileSearch, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

const FEATURE_ICONS: LucideIcon[] = [ShieldCheck, Bot, FileSearch];

/**
 * BrandPanel — the dark left rail of the login screen (spec
 * 2026-07-01-login-two-factor-design §2.2: dark, shown at >= lg). Hidden below
 * `lg`, where the form column renders a compact brand row instead.
 */
export function BrandPanel() {
  const t = useTranslations();
  return (
    <div
      data-testid="login-brand"
      className="relative hidden h-full flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <ShieldCheck className="h-6 w-6 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold">{t('auth.brandProductName')}</span>
      </div>

      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold leading-tight text-balance">{t('auth.brandHeadline')}</h1>
          <p className="max-w-sm text-sm leading-relaxed text-pretty text-sidebar-foreground/60">
            {t('auth.brandTagline')}
          </p>
        </div>

        <ul className="space-y-5">
          {FEATURE_ICONS.map((Icon, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{t(`auth.brandFeature${i + 1}`)}</p>
                <p className="text-xs leading-relaxed text-sidebar-foreground/50">
                  {t(`auth.brandFeature${i + 1}Desc`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-sidebar-foreground/40">
        {t('auth.brandCopyright', { year: new Date().getFullYear() })}
      </p>
    </div>
  );
}
