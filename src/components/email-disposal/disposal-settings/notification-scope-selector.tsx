'use client';

// 通知范围选择器：左栏「收信人组」（复用群组管理 GROUPS_LIST_QUERY 接口，
// 过滤 type==='recipient'）+ 右栏「部门」（按 GET /contacts/_departments 聚合行
// 派生层级树，见 @/lib/org-departments）。行为逐条照抄 demo
// design/origin/demo/components/email-disposal-center/notification-scope-selector.tsx，
// 数据源换成后端聚合接口；持久化只存 ruleId / path，不存名称（源头被删 →
// chip 显示「已失效」而非静默丢弃，规格 §5.2）。

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search, X, Users, Building2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApiRequest } from '@/lib/api/client';
import { GROUPS_LIST_QUERY, ruleToGroup } from '@/lib/api/groups';
import type { Rule } from '@/types/unified-rules';
import type { Group } from '@/types/groups';
import { listContactDepartments } from '@/lib/api/contacts';
import {
  buildDepartmentTree,
  flattenDepartmentTree,
  getSelfAndDescendantPaths,
  type DepartmentNode,
} from '@/lib/org-departments';

interface NotificationScopeSelectorProps {
  selectedGroupIds: number[];
  selectedDeptPaths: string[];
  onGroupsChange: (ids: number[]) => void;
  onDeptsChange: (paths: string[]) => void;
}

// testid 用的部门路径 slug：testid 规则禁止 locale 依赖（随语言切换而变化的
// 文案），不禁止稳定的中文业务 key（path 本身就是稳定标识，不随 UI 语言变化）。
function slug(path: string): string {
  return path.replaceAll(' / ', '__');
}

export function NotificationScopeSelector({
  selectedGroupIds,
  selectedDeptPaths,
  onGroupsChange,
  onDeptsChange,
}: NotificationScopeSelectorProps) {
  const t = useTranslations('disposalSettings');
  const { apiRequest } = useApiRequest();

  const [groupQuery, setGroupQuery] = useState('');
  const [deptQuery, setDeptQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ['groups', 'recipient', 'notification-scope-selector'],
    queryFn: async () => {
      const qs = new URLSearchParams(GROUPS_LIST_QUERY).toString();
      const res = await apiRequest<{ items: Rule[] }>(`/unified-rules?${qs}`, { method: 'GET' });
      return (res.items ?? [])
        .map(ruleToGroup)
        .filter((g): g is Group => g != null && g.type === 'recipient');
    },
  });

  const { data: deptRows = [] } = useQuery({
    queryKey: ['contacts', 'departments'],
    queryFn: async () => (await listContactDepartments(apiRequest)).items,
  });

  const deptTree = useMemo(() => buildDepartmentTree(deptRows), [deptRows]);
  const deptList = useMemo(() => flattenDepartmentTree(deptTree), [deptTree]);

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(groupQuery.trim().toLowerCase()),
  );

  const toggleGroup = (ruleId: number) => {
    onGroupsChange(
      selectedGroupIds.includes(ruleId)
        ? selectedGroupIds.filter((id) => id !== ruleId)
        : [...selectedGroupIds, ruleId],
    );
  };

  // 选中/取消部门：含自身及所有子孙
  const toggleDept = (node: DepartmentNode) => {
    const paths = getSelfAndDescendantPaths(node);
    const allSelected = paths.every((p) => selectedDeptPaths.includes(p));
    if (allSelected) {
      onDeptsChange(selectedDeptPaths.filter((p) => !paths.includes(p)));
    } else {
      onDeptsChange(Array.from(new Set([...selectedDeptPaths, ...paths])));
    }
  };

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // 搜索时命中路径及其祖先默认展开
  const matchedPaths = useMemo(() => {
    const q = deptQuery.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    deptList.forEach((d) => {
      if (d.path.toLowerCase().includes(q)) {
        d.path.split(' / ').forEach((_, i, arr) => set.add(arr.slice(0, i + 1).join(' / ')));
      }
    });
    return set;
  }, [deptQuery, deptList]);

  const renderDeptNode = (node: DepartmentNode, depth = 0) => {
    if (matchedPaths && !matchedPaths.has(node.path)) return null;
    const descendants = getSelfAndDescendantPaths(node);
    const selectedCount = descendants.filter((p) => selectedDeptPaths.includes(p)).length;
    const checked = selectedCount === descendants.length;
    const indeterminate = selectedCount > 0 && !checked;
    const isOpen = matchedPaths ? true : expanded.has(node.path);
    const hasChildren = node.children.length > 0;
    const nodeSlug = slug(node.path);

    return (
      <div key={node.path} data-testid={`disposal-settings-scope-dept-node-${nodeSlug}`}>
        <div
          className="flex items-center gap-1.5 py-1.5 rounded hover:bg-muted/50"
          style={{ paddingLeft: depth * 20 }}
        >
          {hasChildren ? (
            <button
              type="button"
              data-testid={`disposal-settings-scope-dept-expand-${nodeSlug}`}
              onClick={() => toggleExpand(node.path)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <span className="w-4" />
          )}
          <Checkbox
            data-testid={`disposal-settings-scope-dept-toggle-${nodeSlug}`}
            checked={checked}
            indeterminate={indeterminate}
            onCheckedChange={() => toggleDept(node)}
          />
          <span className="text-sm text-foreground">{node.name}</span>
          <span className="text-xs text-muted-foreground">({node.memberCount})</span>
          {node.sourceNames.length > 0 && (
            <span className="text-[10px] text-muted-foreground border border-border rounded px-1 ml-1">
              {node.sourceNames.join('、')}
            </span>
          )}
        </div>
        {isOpen && hasChildren && (
          <div>{node.children.map((c) => renderDeptNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  const hasGroups = groups.length > 0;
  const hasDepts = deptTree.length > 0;

  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="disposal-settings-scope">
      {/* 收信人组 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-muted-foreground" />
          <Label>{t('recipientGroups')}</Label>
          <span className="text-xs text-muted-foreground">
            {t('selectedCount', { n: selectedGroupIds.length })}
          </span>
        </div>
        {!hasGroups ? (
          <EmptyHint testId="disposal-settings-scope-group-empty" text={t('noGroupsHint')} />
        ) : (
          <div className="rounded-lg border border-border">
            <div className="relative p-2 border-b border-border">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                data-testid="disposal-settings-scope-group-search"
                value={groupQuery}
                onChange={(e) => setGroupQuery(e.target.value)}
                placeholder={t('searchGroups')}
                className="pl-8 h-8"
              />
            </div>
            <ScrollArea className="h-44">
              <div className="p-2">
                {filteredGroups.length === 0 ? (
                  <p
                    data-testid="disposal-settings-scope-no-match-group"
                    className="text-sm text-muted-foreground text-center py-6"
                  >
                    {t('noMatch')}
                  </p>
                ) : (
                  filteredGroups.map((g) => (
                    <label
                      key={g.ruleId}
                      data-testid={`disposal-settings-scope-group-row-${g.ruleId}`}
                      className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedGroupIds.includes(g.ruleId)}
                        onCheckedChange={() => toggleGroup(g.ruleId)}
                      />
                      <span className="text-sm text-foreground flex-1">{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t('memberCountSuffix', { n: g.memberCount ?? 0 })}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
        {selectedGroupIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedGroupIds.map((id) => {
              const g = groups.find((x) => x.ruleId === id);
              return (
                <Badge
                  key={id}
                  variant="secondary"
                  className="gap-1"
                  data-testid={`disposal-settings-scope-chip-group-${id}`}
                >
                  {g ? g.name : <span className="text-destructive">{t('invalidRef')}</span>}
                  <button type="button" onClick={() => toggleGroup(id)}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* 部门 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <Label>{t('departments')}</Label>
          <span className="text-xs text-muted-foreground">
            {t('selectedCount', { n: selectedDeptPaths.length })}
          </span>
        </div>
        {!hasDepts ? (
          <EmptyHint testId="disposal-settings-scope-dept-empty" text={t('noDeptsHint')} />
        ) : (
          <div className="rounded-lg border border-border">
            <div className="relative p-2 border-b border-border">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                data-testid="disposal-settings-scope-dept-search"
                value={deptQuery}
                onChange={(e) => setDeptQuery(e.target.value)}
                placeholder={t('searchDepts')}
                className="pl-8 h-8"
              />
            </div>
            <ScrollArea className="h-44">
              <div className="p-2">
                {matchedPaths && matchedPaths.size === 0 ? (
                  <p
                    data-testid="disposal-settings-scope-no-match-dept"
                    className="text-sm text-muted-foreground text-center py-6"
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
        {selectedDeptPaths.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedDeptPaths.map((path) => (
              <Badge
                key={path}
                variant="secondary"
                className="gap-1"
                data-testid={`disposal-settings-scope-chip-dept-${slug(path)}`}
              >
                {path}
                <button
                  type="button"
                  onClick={() => onDeptsChange(selectedDeptPaths.filter((p) => p !== path))}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              data-testid="disposal-settings-scope-dept-clear"
              onClick={() => onDeptsChange([])}
            >
              {t('clearAll')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyHint({ text, testId }: { text: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
    >
      {text}
    </div>
  );
}
