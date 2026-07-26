'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sidebarNavItems, offNavRouteTitles, type NavItem } from '@/lib/constants';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { visibleNavIds, isNavItemAllowed } from './sidebar-visibility';
import { VersionFooter } from './version-footer';

interface SidebarNavItemProps {
  item: NavItem;
  level?: number;
  expandedItems: Set<string>;
  toggleExpand: (id: string) => void;
  isItemAllowed: (item: NavItem) => boolean;
  titleKeyOverrides?: Record<string, string>;
}

function SidebarNavItem({ item, level = 0, expandedItems, toggleExpand, isItemAllowed, titleKeyOverrides }: SidebarNavItemProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { isHovered, pointerHoverProps } = usePointerHover<HTMLButtonElement>();

  if (!isItemAllowed(item)) {
    return null;
  }

  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedItems.has(item.id);
  const isActive = item.href ? pathname.startsWith(item.href) : false;
  const hasChildActive = item.children?.some((child) => child.href && pathname.startsWith(child.href));
  const isSelected = Boolean(isActive || hasChildActive);

  const Icon = item.icon;

  const filteredChildren = item.children?.filter(isItemAllowed);

  if (hasChildren && filteredChildren?.length === 0) {
    return null;
  }

  const handleClick = () => {
    if (hasChildren) {
      toggleExpand(item.id);
    } else if (item.href) {
      router.push(item.href);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        {...pointerHoverProps}
        data-active={isSelected ? 'true' : undefined}
        aria-expanded={hasChildren ? isExpanded : undefined}
        className={cn(
          'flex w-full cursor-pointer items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium',
          'transition-[background-color,color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          'motion-reduce:transition-none',
          level === 0 && 'text-sidebar-foreground/72',
          level > 0 && 'text-sidebar-foreground/62',
          level > 0 && 'rounded-lg px-3 py-2',
          isSelected && !isHovered && 'bg-primary/15 text-white',
          isSelected && isHovered &&
            'bg-primary/18 text-white shadow-[inset_0_0_0_1px_rgb(96_165_250/0.14)]',
          !isSelected && isHovered &&
            'text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.055)]',
          !isSelected && isHovered && level === 0 && 'bg-white/[0.07]',
          !isSelected && isHovered && level > 0 && 'bg-white/[0.05]',
        )}
      >
        {level === 0 && Icon && (
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-[color,scale] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:scale-100 motion-reduce:transition-none',
              isHovered && 'scale-[1.04] text-blue-300',
            )}
          />
        )}
        <span className="flex-1 text-left">{t(titleKeyOverrides?.[item.id] ?? item.titleKey)}</span>
        {hasChildren && (
          <span className="flex-shrink-0">
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-[color,rotate] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                isHovered && 'text-white/85',
                isExpanded && 'rotate-180',
              )}
            />
          </span>
        )}
      </button>

      {hasChildren && isExpanded && (
        <div className="ml-5 mt-1 space-y-1 border-l border-white/8 pl-3">
          {filteredChildren?.map((child) => (
            <SidebarNavItem
              key={child.id}
              item={child}
              level={level + 1}
              expandedItems={expandedItems}
              toggleExpand={toggleExpand}
              isItemAllowed={isItemAllowed}
              titleKeyOverrides={titleKeyOverrides}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarNav() {
  const currentPath = usePathname();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    // 默认展开集合刻意偏离 demo 原型（demo 展开 统计/邮件处置/系统管理）：webapp 的
    // 主工作流是规则管理，故默认展开 高级规则设置/规则管理/检测设置/邮件管理，与
    // advanced-rules-menu.spec.ts 的“detection group expanded by default”契约一致。
    const expanded = new Set(['advanced-rules', 'rules', 'detection', 'mail']);
    // Auto-expand groups whose children match the current path.
    sidebarNavItems.forEach((item) => {
      if (item.children?.some((child) => child.href && currentPath.startsWith(child.href))) {
        expanded.add(item.id);
      }
    });
    return expanded;
  });
  const { hasPermission, isSystemAdmin, showAdvancedRules, canSeeRoute } = useAuth();
  const { capabilities, registry, viewer, grants } = useProductForm();
  const t = useTranslations();
  const brandName = capabilities?.saas ? t('branding.saasName') : t('branding.selfHostedName');

  useEffect(() => {
    document.title = brandName;
  }, [brandName, currentPath]);

  const formVisible = capabilities ? new Set(visibleNavIds(registry, capabilities, viewer, grants)) : null;
  // §1.1（admin-contacts html_spec）：多租户租户视角下「系统管理」分组改名
  // 「组织与成员」（demo nav.tenantSystemManagement，sidebar-nav.tsx:297-303）。
  const titleKeyOverrides =
    capabilities?.multiTenant && viewer === 'tenant'
      ? { system: 'sidebar.tenantSystemManagement' }
      : undefined;
  // GT-12376: the gate is now the shared isNavItemAllowed (sidebar-visibility.ts)
  // so the admin-audit「操作模块」filter reuses the exact same visibility.
  const navGateCtx = { hasPermission, isSystemAdmin, showAdvancedRules, canSeeRoute, registry, formVisible, capabilities, viewer };
  const isItemAllowed = (item: NavItem): boolean => isNavItemAllowed(item, navGateCtx);

  // GT-11761: the subtitle under the brand logo should follow the active route
  // (the deepest matching nav item's title), not be hardcoded to "Dashboard".
  // offNavRouteTitles covers the routes that are still served but no longer in
  // the nav tree, so they keep their own subtitle instead of falling back.
  const resolveActiveTitleKey = (): string | null => {
    let bestKey: string | null = null;
    let bestLen = 0;
    const consider = (href: string | undefined, titleKey: string) => {
      if (href && currentPath.startsWith(href) && href.length > bestLen) {
        bestKey = titleKey;
        bestLen = href.length;
      }
    };
    const visit = (item: NavItem) => {
      consider(item.href, item.titleKey);
      item.children?.forEach(visit);
    };
    sidebarNavItems.forEach(visit);
    offNavRouteTitles.forEach((r) => consider(r.href, r.titleKey));
    return bestKey;
  };
  const activeTitleKey = resolveActiveTitleKey();

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      <div className="border-b border-white/8 px-5 py-5">
        <div className="flex items-center gap-3">
          <Image
            src="/logo_white.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-wide text-white">{brandName}</div>
            <div className="truncate text-xs text-sidebar-foreground/55">
              {activeTitleKey ? t(activeTitleKey) : t('sidebar.dashboard')}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {sidebarNavItems.map((item) => (
          <SidebarNavItem
            key={item.id}
            item={item}
            expandedItems={expandedItems}
            toggleExpand={toggleExpand}
            isItemAllowed={isItemAllowed}
            titleKeyOverrides={titleKeyOverrides}
          />
        ))}
      </nav>

      <VersionFooter />
    </div>
  );
}
