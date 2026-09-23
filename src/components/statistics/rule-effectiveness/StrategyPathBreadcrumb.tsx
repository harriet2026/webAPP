import { Fragment } from 'react';

interface StrategyPathBreadcrumbProps {
  /** 已翻译好的路径文案，按「一级模块 → 二级子模块/策略 → 三级具体项」顺序排列。 */
  segments: string[];
}

/**
 * 以面包屑形式呈现观察对象的完整策略路径，与配置页导航层级保持一致
 * （例如「身份认证与仿冒检测 → 基础格式检查 → 无效 MAIL FROM」）。
 * 末级（真正需要管理员关注和操作的具体对象）保持正常文字色并加粗，
 * 前面几级弱化为 muted 文字，避免路径过长时抢夺注意力。
 */
export function StrategyPathBreadcrumb({ segments }: StrategyPathBreadcrumbProps) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-sm leading-relaxed">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <Fragment key={`${segment}-${index}`}>
            <span className={isLast ? 'font-medium text-foreground' : 'text-muted-foreground'}>{segment}</span>
            {!isLast && <span aria-hidden="true" className="text-muted-foreground">→</span>}
          </Fragment>
        );
      })}
    </span>
  );
}
