import { describe, it, expect } from 'vitest';
import { buildDepartmentTree, flattenDepartmentTree, getSelfAndDescendantPaths } from './org-departments';
import type { ContactDepartmentRow } from '@/lib/api/contacts';

// 与 Task 8 mock fixture（webapp/src/lib/mock/fixtures.ts::mockContactDepartmentsList）
// 完全一致的 8 行聚合数据：只有叶子部门行，"研发部"/"销售部" 等父节点行不存在，
// 必须由 buildDepartmentTree 按 " / " 前缀自动补全（memberCount 0、sourceNames 空）。
const FIXTURE_ROWS: ContactDepartmentRow[] = [
  { path: '研发部 / 后端组', name: '后端组', parent_path: '研发部', member_count: 1, source_names: ['总部 AD'] },
  { path: '研发部 / 前端组', name: '前端组', parent_path: '研发部', member_count: 1, source_names: ['总部 AD'] },
  { path: '财务部', name: '财务部', parent_path: null, member_count: 1, source_names: ['总部 AD'] },
  { path: '市场部', name: '市场部', parent_path: null, member_count: 1, source_names: ['邮件系统'] },
  { path: '总裁办', name: '总裁办', parent_path: null, member_count: 1, source_names: ['网易企邮'] },
  { path: '人力资源部', name: '人力资源部', parent_path: null, member_count: 1, source_names: ['网易企邮'] },
  { path: '销售部 / 华东区', name: '华东区', parent_path: '销售部', member_count: 1, source_names: ['邮件系统'] },
  { path: '法务部', name: '法务部', parent_path: null, member_count: 1, source_names: ['总部 AD'] },
];

describe('buildDepartmentTree', () => {
  it('synthesizes missing ancestor nodes (研发部/销售部 have no direct fixture row)', () => {
    const roots = buildDepartmentTree(FIXTURE_ROWS);
    const rd = roots.find((n) => n.path === '研发部');
    expect(rd).toBeDefined();
    expect(rd!.memberCount).toBe(0);
    expect(rd!.sourceNames).toEqual([]);
    expect(rd!.parentPath).toBeNull();
    expect(rd!.children.map((c) => c.path).sort()).toEqual(['研发部 / 后端组', '研发部 / 前端组'].sort());

    const sales = roots.find((n) => n.path === '销售部');
    expect(sales).toBeDefined();
    expect(sales!.memberCount).toBe(0);
    expect(sales!.children.map((c) => c.path)).toEqual(['销售部 / 华东区']);
  });

  it('fills memberCount/sourceNames only for rows with an exact path match', () => {
    const roots = buildDepartmentTree(FIXTURE_ROWS);
    const rd = roots.find((n) => n.path === '研发部')!;
    const backend = rd.children.find((c) => c.path === '研发部 / 后端组')!;
    expect(backend.memberCount).toBe(1);
    expect(backend.sourceNames).toEqual(['总部 AD']);
    expect(backend.name).toBe('后端组');
    expect(backend.parentPath).toBe('研发部');
  });

  it('leaf-only rows (财务部/市场部/总裁办/人力资源部/法务部) become root nodes directly', () => {
    const roots = buildDepartmentTree(FIXTURE_ROWS);
    const rootPaths = roots.map((n) => n.path);
    expect(rootPaths).toContain('财务部');
    expect(rootPaths).toContain('市场部');
    expect(rootPaths).toContain('总裁办');
    expect(rootPaths).toContain('人力资源部');
    expect(rootPaths).toContain('法务部');
    // 7 根节点：研发部 + 财务部 + 市场部 + 总裁办 + 人力资源部 + 销售部 + 法务部
    expect(roots).toHaveLength(7);
  });
});

describe('getSelfAndDescendantPaths', () => {
  it('returns 3 paths for 研发部 (self + 后端组 + 前端组)', () => {
    const roots = buildDepartmentTree(FIXTURE_ROWS);
    const rd = roots.find((n) => n.path === '研发部')!;
    const paths = getSelfAndDescendantPaths(rd);
    expect(paths.sort()).toEqual(['研发部', '研发部 / 后端组', '研发部 / 前端组'].sort());
  });

  it('returns just itself for a leaf node with no children', () => {
    const roots = buildDepartmentTree(FIXTURE_ROWS);
    const finance = roots.find((n) => n.path === '财务部')!;
    expect(getSelfAndDescendantPaths(finance)).toEqual(['财务部']);
  });
});

describe('flattenDepartmentTree', () => {
  it('flattens all 10 nodes (7 roots + 3 synthesized/leaf children) sorted by path', () => {
    const roots = buildDepartmentTree(FIXTURE_ROWS);
    const flat = flattenDepartmentTree(roots);
    expect(flat).toHaveLength(10);
    const paths = flat.map((n) => n.path);
    const sorted = [...paths].sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(sorted);
  });

  it('sort order is stable across repeated calls', () => {
    const roots = buildDepartmentTree(FIXTURE_ROWS);
    const first = flattenDepartmentTree(roots).map((n) => n.path);
    const second = flattenDepartmentTree(roots).map((n) => n.path);
    expect(first).toEqual(second);
  });
});
