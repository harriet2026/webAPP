'use client';

import { Palette } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useThemeColor, type ThemeColor } from '@/contexts/theme-color-context';
import { cn } from '@/lib/utils';

// 每个选项的圆点用固定色（蓝 blue-500 / 绿 emerald-500），与 demo 一致：
// 圆点表示「该选项的主题色」，不随当前激活主题变化。
const THEMES: { code: ThemeColor; labelKey: string; dot: string }[] = [
  { code: 'blue', labelKey: 'theme.blue', dot: 'bg-blue-500' },
  { code: 'green', labelKey: 'theme.green', dot: 'bg-emerald-500' },
];

export function ThemeSwitcher() {
  const { themeColor, setThemeColor } = useThemeColor();
  const t = useTranslations();

  const current = THEMES.find((th) => th.code === themeColor) ?? THEMES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        data-testid="theme-switcher-trigger"
        aria-label={t('theme.label')}
      >
        <Palette className="h-4 w-4" />
        <span className={cn('h-3 w-3 rounded-full', current.dot)} />
        <span>{t(current.labelKey)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="theme-switcher-menu">
        {THEMES.map((th) => (
          <DropdownMenuItem
            key={th.code}
            onClick={() => setThemeColor(th.code)}
            className={cn('gap-2', themeColor === th.code && 'bg-accent')}
            data-testid={`theme-switcher-option-${th.code}`}
            data-active={themeColor === th.code ? 'true' : undefined}
          >
            <span className={cn('h-3 w-3 rounded-full', th.dot)} />
            {t(th.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
