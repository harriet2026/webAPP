'use client';

// 组织通讯录选择器：部门树（勾选即含全部子部门）+ 展开定位到具体人员，外加
// 独立的按姓名/邮箱搜人入口（不需要先展开部门层级即可直接勾选个人）。
//
// 数据源与 @/components/email-disposal/disposal-settings/notification-scope-selector.tsx
// 的部门列同源（GET /contacts/_departments → @/lib/org-departments 派生层级树），
// 但该组件的部门列不支持展开查看个人；本组件是通用化后的升级版——按人员选中
// 落 email（listContacts({dept: node.path}) 懒加载，仅展开时才请求），按部门
// 选中落完整路径。为共享组件，未来可替换 notification-scope-selector 与
// ConditionConfigPanel 的 OrgDepartmentSection（本次先只接入准入规则表单）。

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search, X, User, Building2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApiRequest } from '@/lib/api/client';
import { listContactDepartments, listContacts } from '@/lib/api/contacts';
import type { Contact } from '@/types/contacts';
import {
  buildDepartmentTree,
  getSelfAndDescendantPaths,
  type DepartmentNode,
} from '@/lib/org-departments';

interface OrgContactTreeSelectProps {
  selectedDeptPaths: string[];
  selectedEmails: string[];
  onDeptsChange: (paths: string[]) => void;
  onEmailsChange: (emails: string[]) => void;
  /** data-testid 前缀，默认 "org-contact-tree"；同一组件多处复用时用于区分 */
  testIdPrefix?: string;
}

// testid 用的稳定 slug：部门路径/邮箱本身是稳定标识，不随 UI 语言变化，允许出现在 testid 中。
function slug(value: string): string {
  return value.replaceAll(' / ', '__').replaceAll('@', '_at_').replaceAll('.', '_');
}

export function OrgContactTreeSelect({
  selectedDeptPaths,
  selectedEmails,
  onDeptsChange,
  onEmailsChange,
  testIdPrefix = 'org-contact-tree',
}: OrgContactTreeSelectProps) {
  const t = useTranslations('orgContactTreeSelect');
  const { apiRequest } = useApiRequest();

  const [deptQuery, setDeptQuery] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 已抓取过的联系人缓存（按邮箱去重），用于芯片回显姓名——覆盖部门展开与
  // 姓名/邮箱搜索两条数据来源，避免同一人重复请求。
  const [contactCache, setContactCache] = useState<Map<string, Contact>>(new Map());

  const mergeContacts = (list: Contact[]) => {
    if (list.length === 0) return;
    setContactCache((prev) => {
      const next = new Map(prev);
      list.forEach((c) => next.set(c.email, c));
      return next;
    });
  };

  const { data: deptRows = [] } = useQuery({
    queryKey: ['contacts', 'departments'],
    queryFn: async () => (await listContactDepartments(apiRequest)).items,
  });

  const deptTree = useMemo(() => buildDepartmentTree(deptRows), [deptRows]);

  const deptQueryLower = deptQuery.trim().toLowerCase();
  const matchedPaths = useMemo(() => {
    if (!deptQueryLower) return null;
    const set = new Set<string>();
    const walk = (nodes: DepartmentNode[]) => {
      nodes.forEach((n) => {
        if (n.name.toLowerCase().includes(deptQueryLower) || n.path.toLowerCase().includes(deptQueryLower)) {
          n.path.split(' / ').forEach((_, i, arr) => set.add(arr.slice(0, i + 1).join(' / ')));
        }
        walk(n.children);
      });
    };
    walk(deptTree);
    return set;
  }, [deptQueryLower, deptTree]);

  // 展开部门时懒加载该部门下的人员（仅精确匹配 department_path，子部门作为
  // 独立树节点各自展开），一次拉 50 条已覆盖多数团队规模。
  const expandedList = Array.from(expanded);
  const { data: deptContactsMap = {} } = useQuery({
    queryKey: ['contacts', 'by-dept', expandedList],
    queryFn: async () => {
      const entries = await Promise.all(
        expandedList.map(async (path) => {
          const res = await listContacts({ dept: path, page_size: 50 }, apiRequest);
          return [path, res.items] as const;
        }),
      );
      const map: Record<string, Contact[]> = {};
      entries.forEach(([path, items]) => {
        map[path] = items;
        mergeContacts(items);
      });
      return map;
    },
    enabled: expandedList.length > 0,
  });

  // 独立搜人入口：不依赖部门展开状态，直接按姓名/邮箱关键字查询。
  const personQueryTrimmed = personQuery.trim();
  const { data: personSearchResults = [], isFetching: personSearching } = useQuery({
    queryKey: ['contacts', 'search', personQueryTrimmed],
    queryFn: async () => {
      const res = await listContacts({ keyword: personQueryTrimmed, page_size: 20 }, apiRequest);
      mergeContacts(res.items);
      return res.items;
    },
    enabled: personQueryTrimmed.length > 0,
  });

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleDept = (node: DepartmentNode) => {
    const paths = getSelfAndDescendantPaths(node);
    const allSelected = paths.every((p) => selectedDeptPaths.includes(p));
    if (allSelected) {
      onDeptsChange(selectedDeptPaths.filter((p) => !paths.includes(p)));
    } else {
      onDeptsChange(Array.from(new Set([...selectedDeptPaths, ...paths])));
    }
  };

  const togglePerson = (email: string) => {
    onEmailsChange(
      selectedEmails.includes(email)
        ? selectedEmails.filter((e) => e !== email)
        : [...selectedEmails, email],
    );
  };

  const renderDeptNode = (node: DepartmentNode, depth = 0) => {
    if (matchedPaths && !matchedPaths.has(node.path)) return null;
    const descendants = getSelfAndDescendantPaths(node);
    const selectedCount = descendants.filter((p) => selectedDeptPaths.includes(p)).length;
    const checked = selectedCount === descendants.length;
    const indeterminate = selectedCount > 0 && !checked;
    const isOpen = matchedPaths ? true : expanded.has(node.path);
    const hasChildren = node.children.length > 0;
    const nodeSlug = slug(node.path);
    const people = deptContactsMap[node.path] ?? [];
    const deptCovered = checked; // 部门已整体选中时，其下人员视为隐含包含

    return (
      <div key={node.path} data-testid={`${testIdPrefix}-dept-node-${nodeSlug}`}>
        <div
          className="flex items-center gap-1.5 py-1.5 rounded hover:bg-muted/50"
          style={{ paddingLeft: depth * 20 }}
        >
          {hasChildren || node.memberCount > 0 ? (
            <button
              type="button"
              data-testid={`${testIdPrefix}-dept-expand-${nodeSlug}`}
              onClick={() => toggleExpand(node.path)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-4" />
          )}
          <Checkbox
            data-testid={`${testIdPrefix}-dept-toggle-${nodeSlug}`}
            checked={checked}
            indeterminate={indeterminate}
            onCheckedChange={() => toggleDept(node)}
          />
          <span className="text-sm text-foreground">{node.name}</span>
          <span className="text-xs text-muted-foreground">({node.memberCount})</span>
        </div>
        {isOpen && (
          <div>
            {node.children.map((c) => renderDeptNode(c, depth + 1))}
            {people.map((person) => (
              <label
                key={person.email}
                data-testid={`${testIdPrefix}-dept-person-${slug(person.email)}`}
                className={`flex items-center gap-2 py-1 rounded hover:bg-muted/50 ${
                  deptCovered ? 'opacity-60' : 'cursor-pointer'
                }`}
                style={{ paddingLeft: (depth + 1) * 20 + 20 }}
                title={deptCovered ? t('impliedByDept') : undefined}
              >
                <Checkbox
                  checked={deptCovered || selectedEmails.includes(person.email)}
                  disabled={deptCovered}
                  onCheckedChange={() => togglePerson(person.email)}
                />
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm text-foreground">{person.display_name}</span>
                <span className="text-xs text-muted-foreground">{person.email}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  const hasDepts = deptTree.length > 0;

  return (
    <div className="space-y-3" data-testid={testIdPrefix}>
      {/* 直接搜人 */}
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid={`${testIdPrefix}-person-search`}
            value={personQuery}
            onChange={(e) => setPersonQuery(e.target.value)}
            placeholder={t('searchPersonPlaceholder')}
            className="h-8 pl-8"
          />
        </div>
        {personQueryTrimmed && (
          <div className="max-h-32 overflow-y-auto rounded-md border">
            {personSearching ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">{t('loading')}</p>
            ) : personSearchResults.length === 0 ? (
              <p
                data-testid={`${testIdPrefix}-person-search-empty`}
                className="px-3 py-2 text-xs text-muted-foreground"
              >
                {t('noMatch')}
              </p>
            ) : (
              personSearchResults.map((person) => (
                <label
                  key={person.email}
                  data-testid={`${testIdPrefix}-person-result-${slug(person.email)}`}
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedEmails.includes(person.email)}
                    onCheckedChange={() => togglePerson(person.email)}
                  />
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm text-foreground">{person.display_name}</span>
                  <span className="text-xs text-muted-foreground">{person.email}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{person.department_path}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {/* 部门树 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          {t('departmentTreeLabel')}
        </div>
        {!hasDepts ? (
          <div
            data-testid={`${testIdPrefix}-dept-empty`}
            className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground"
          >
            {t('noDeptsHint')}
          </div>
        ) : (
          <div className="rounded-lg border">
            <div className="relative border-b p-2">
              <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid={`${testIdPrefix}-dept-search`}
                value={deptQuery}
                onChange={(e) => setDeptQuery(e.target.value)}
                placeholder={t('searchDeptPlaceholder')}
                className="h-8 pl-8"
              />
            </div>
            <ScrollArea className="h-40">
              <div className="p-2">
                {matchedPaths && matchedPaths.size === 0 ? (
                  <p
                    data-testid={`${testIdPrefix}-dept-search-empty`}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    {t('noMatch')}
                  </p>
                ) : (
                  deptTree.map((n) => renderDeptNode(n))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* 已选芯片 */}
      {(selectedDeptPaths.length > 0 || selectedEmails.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedDeptPaths.map((path) => (
            <Badge key={path} variant="secondary" className="gap-1" data-testid={`${testIdPrefix}-chip-dept-${slug(path)}`}>
              <Building2 className="h-3 w-3" />
              {path}
              <button type="button" onClick={() => onDeptsChange(selectedDeptPaths.filter((p) => p !== path))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selectedEmails.map((email) => (
            <Badge key={email} variant="secondary" className="gap-1" data-testid={`${testIdPrefix}-chip-person-${slug(email)}`}>
              <User className="h-3 w-3" />
              {contactCache.get(email)?.display_name ?? email}
              <button type="button" onClick={() => togglePerson(email)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            data-testid={`${testIdPrefix}-clear-all`}
            onClick={() => {
              onDeptsChange([]);
              onEmailsChange([]);
            }}
          >
            {t('clearAll')}
          </Button>
        </div>
      )}
    </div>
  );
}
