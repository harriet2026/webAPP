'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';
import { languageMetadata, languages } from '@/lib/constants';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();

  const currentLocale = pathname.split('/')[1] || 'zh';

  const handleLanguageChange = (locale: string) => {
    const segments = pathname.split('/');
    segments[1] = locale;
    router.push(segments.join('/'));
  };

  // GT-12501 只隐藏泰语/俄语选项，路由本身仍受支持；直接访问 /th 或 /ru
  // 时必须回显当前语言，不能错误地退回“中文”造成混合语言界面。
  const currentLanguage =
    languageMetadata.find((language) => language.code === currentLocale) ||
    languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-transparent px-3 text-[0.8rem] font-medium text-foreground shadow-xs transition-[background-color,border-color,color] duration-[120ms] ease-out motion-reduce:transition-none data-[hovered=true]:border-foreground/20 data-[hovered=true]:bg-muted/35 data-[hovered=true]:text-foreground data-pressed:bg-muted/60 data-popup-open:border-primary/30 data-popup-open:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        aria-label={t('header.language')}
        data-testid="language-switcher-trigger"
      >
        <Globe className="size-4" />
        <span>{currentLanguage.flag}</span>
        <span>{currentLanguage.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="rounded-md border border-border"
        data-testid="language-switcher-menu"
      >
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={cn(
              'gap-2 rounded-sm px-2 py-1.5',
              currentLocale === lang.code
                ? 'bg-primary/10 text-primary data-[hovered=true]:bg-primary/15 data-[hovered=true]:text-primary focus:bg-primary/15 focus:text-primary'
                : 'data-[hovered=true]:bg-muted/65 data-[hovered=true]:text-foreground focus:bg-muted/65 focus:text-foreground',
            )}
            data-testid={`language-switcher-option-${lang.code}`}
            aria-current={currentLocale === lang.code ? 'true' : undefined}
          >
            <span className="mr-2">{lang.flag}</span>
            {lang.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
