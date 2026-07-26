// ==================== 组织部门树派生工具 ====================
// 组织通讯录没有独立的部门实体：后端 GET /contacts/_departments 按人员的
// deptPath 聚合出去重后的「叶子部门行」（ContactDepartmentRow[]，一行=一条
// 精确路径的人数/来源聚合，不是层级树，也不保证包含祖先行——例如只有
// "研发部 / 后端组" 行而没有 "研发部" 本身的行）。
//
// 本模块从这些行派生出带祖先补全的层级树，逻辑照抄 demo
// design/origin/demo/lib/org-departments.ts 的 accumulatePaths /
// getDepartmentTree / getSelfAndDescendantPaths 语义（分隔符同为 " / "），
// 供「隔离区通知范围」等多处以树形多选方式引用。

import type { ContactDepartmentRow } from '@/lib/api/contacts';

export interface DepartmentNode {
  /** 完整路径，作为稳定唯一键，如 "研发部 / 后端组" */
  path: string;
  /** 当前层级名称，如 "后端组" */
  name: string;
  /** 父级完整路径，根节点为 null */
  parentPath: string | null;
  children: DepartmentNode[];
  /** 直接归属该部门（精确匹配 path）的人数；祖先补全节点为 0 */
  memberCount: number;
  /** 该部门涉及的同步来源（如 总部 AD、网易企邮）；祖先补全节点为空数组 */
  sourceNames: string[];
}

const SEP = ' / ';

// 将完整路径拆分为逐级累积的路径数组：
// "研发部 / 后端组" -> ["研发部", "研发部 / 后端组"]
function accumulatePaths(path: string): { name: string; path: string; parentPath: string | null }[] {
  const segments = path.split(SEP).map((s) => s.trim()).filter(Boolean);
  return segments.map((name, i) => ({
    name,
    path: segments.slice(0, i + 1).join(SEP),
    parentPath: i === 0 ? null : segments.slice(0, i).join(SEP),
  }));
}

/**
 * 从后端聚合行派生部门层级树：自动补全缺失的祖先节点（memberCount 0、
 * sourceNames 空），精确匹配的行填充真实 memberCount/sourceNames。
 */
export function buildDepartmentTree(rows: ContactDepartmentRow[]): DepartmentNode[] {
  const map = new Map<string, DepartmentNode>();

  // 先建立所有层级节点（含祖先补全）
  rows.forEach((row) => {
    accumulatePaths(row.path).forEach(({ name, path, parentPath }) => {
      if (!map.has(path)) {
        map.set(path, { path, name, parentPath, children: [], memberCount: 0, sourceNames: [] });
      }
    });
  });

  // 精确匹配的行直接覆盖 memberCount/sourceNames（后端已按 path 聚合，
  // 不需要像 demo 那样逐人累加）
  rows.forEach((row) => {
    const node = map.get(row.path);
    if (node) {
      node.memberCount = row.member_count;
      node.sourceNames = [...row.source_names];
    }
  });

  // 组装父子关系
  const roots: DepartmentNode[] = [];
  map.forEach((node) => {
    if (node.parentPath && map.has(node.parentPath)) {
      map.get(node.parentPath)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

/** 扁平化部门树（用于搜索匹配 / 计数），按路径排序，结果稳定 */
export function flattenDepartmentTree(roots: DepartmentNode[]): DepartmentNode[] {
  const flat: DepartmentNode[] = [];
  const walk = (nodes: DepartmentNode[]) => {
    nodes.forEach((n) => {
      flat.push(n);
      walk(n.children);
    });
  };
  walk(roots);
  return flat.sort((a, b) => a.path.localeCompare(b.path));
}

/** 收集某部门自身及其所有子孙的路径（选中父部门含子部门时使用） */
export function getSelfAndDescendantPaths(node: DepartmentNode): string[] {
  const paths = [node.path];
  node.children.forEach((child) => paths.push(...getSelfAndDescendantPaths(child)));
  return paths;
}
