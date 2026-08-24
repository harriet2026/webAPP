'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, ChevronsUpDown, Search, User, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listContacts, type ContactDepartmentRow } from '@/lib/api/contacts';
import { useApiRequest } from '@/lib/api/client';
import { buildDepartmentTree, getSelfAndDescendantPaths, type DepartmentNode } from '@/lib/org-departments';

export interface ScopeGroupOption {
  uid: string;
  name: string;
}

interface CommonLabels {
  noMatch: string;
  clearAll: string;
  selectedCount: (count: number) => string;
}

interface GroupScopeSelectProps extends CommonLabels {
  options: ScopeGroupOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyHint: string;
  testIdPrefix: string;
}

function slug(value: string) {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_');
}

/**
 * Compact searchable selector used by the admission drawer. Values deliberately
 * remain stable unified-rule UIDs; labels are presentation only.
 */
export function GroupScopeSelect({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyHint,
  noMatch,
  clearAll,
  selectedCount,
  testIdPrefix,
}: GroupScopeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = options.filter((option) => option.name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (uid: string) => onChange(
    selected.includes(uid) ? selected.filter((value) => value !== uid) : [...selected, uid],
  );

  if (options.length === 0) {
    return <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{emptyHint}</p>;
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
        <PopoverTrigger
          render={(
            <Button
              type="button"
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              data-testid={`${testIdPrefix}-trigger`}
              className="w-full justify-between font-normal"
            />
          )}
        >
          <span className={selected.length === 0 ? 'truncate text-muted-foreground' : 'truncate'}>
            {selected.length ? selectedCount(selected.length) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-[--anchor-width] min-w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
            <CommandList>
              {filtered.length === 0 ? <CommandEmpty>{noMatch}</CommandEmpty> : (
                <CommandGroup>
                  {filtered.map((option) => (
                    <CommandItem
                      key={option.uid}
                      value={option.uid}
                      data-testid={`${testIdPrefix}-option-${slug(option.uid)}`}
                      data-checked={selected.includes(option.uid) || undefined}
                      onSelect={() => toggle(option.uid)}
                    >
                      <Checkbox checked={selected.includes(option.uid)} tabIndex={-1} />
                      {option.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((uid) => (
            <Badge key={uid} variant="secondary" className="gap-1">
              {options.find((option) => option.uid === uid)?.name ?? uid}
              <Button type="button" variant="ghost" size="icon-xs" className="-my-1 size-5 rounded-full p-0" onClick={() => toggle(uid)} aria-label={clearAll}><X className="size-3" /></Button>
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" className="px-2 text-sm" onClick={() => onChange([])}>
            {clearAll}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface DepartmentScopeSelectProps extends CommonLabels {
  rows: ContactDepartmentRow[];
  selected: string[];
  onChange: (values: string[]) => void;
  selectedEmails: string[];
  onEmailsChange: (values: string[]) => void;
  onInvalidEmail: () => void;
  personSearchPlaceholder: string;
  loadingLabel: string;
  searchPlaceholder: string;
  emptyHint: string;
  testIdPrefix: string;
}

/** Department selection mirrors the prototype tree while persisting canonical full paths. */
export function DepartmentScopeSelect({
  rows,
  selected,
  onChange,
  selectedEmails,
  onEmailsChange,
  onInvalidEmail,
  personSearchPlaceholder,
  loadingLabel,
  searchPlaceholder,
  emptyHint,
  noMatch,
  clearAll,
  testIdPrefix,
}: DepartmentScopeSelectProps) {
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const [query, setQuery] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildDepartmentTree(rows), [rows]);
  const normalizedQuery = query.trim().toLowerCase();
  const matchedPaths = useMemo(() => {
    if (!normalizedQuery) return null;
    const matches = new Set<string>();
    const walk = (nodes: DepartmentNode[]) => nodes.forEach((node) => {
      if (node.name.toLowerCase().includes(normalizedQuery) || node.path.toLowerCase().includes(normalizedQuery)) {
        node.path.split(' / ').forEach((_part, index, parts) => matches.add(parts.slice(0, index + 1).join(' / ')));
      }
      walk(node.children);
    });
    walk(tree);
    return matches;
  }, [normalizedQuery, tree]);
  const normalizedPersonQuery = personQuery.trim();
  const personQueryResult = useQuery({
    queryKey: ['contacts', 'phishing-scope-search', effectiveTenantId, normalizedPersonQuery],
    queryFn: () => listContacts({ keyword: normalizedPersonQuery, page_size: 20 }, apiRequest),
    enabled: normalizedPersonQuery.length > 0,
  });
  const toggleEmail = (email: string) => {
    const normalized = email.trim().toLowerCase();
    onEmailsChange(selectedEmails.includes(normalized)
      ? selectedEmails.filter((value) => value !== normalized)
      : [...selectedEmails, normalized]);
  };
  const addExactEmail = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedPersonQuery)) {
      onInvalidEmail();
      return;
    }
    if (!selectedEmails.includes(normalizedPersonQuery.toLowerCase())) toggleEmail(normalizedPersonQuery);
    setPersonQuery('');
  };

  const toggleNode = (node: DepartmentNode) => {
    const paths = getSelfAndDescendantPaths(node);
    const allSelected = paths.every((path) => selected.includes(path));
    onChange(allSelected
      ? selected.filter((path) => !paths.includes(path))
      : Array.from(new Set([...selected, ...paths])));
  };

  const renderNode = (node: DepartmentNode, depth = 0): React.ReactNode => {
    if (matchedPaths && !matchedPaths.has(node.path)) return null;
    const paths = getSelfAndDescendantPaths(node);
    const selectedCount = paths.filter((path) => selected.includes(path)).length;
    const checked = selectedCount === paths.length;
    const isOpen = matchedPaths ? true : expanded.has(node.path);
    const canExpand = node.children.length > 0;
    return (
      <div key={node.path} data-testid={`${testIdPrefix}-node-${slug(node.path)}`}>
        <div className="flex items-center gap-1.5 rounded py-1.5" style={{ paddingLeft: depth * 20 }}>
          {canExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-6 text-muted-foreground data-[hovered=true]:text-foreground"
              onClick={() => setExpanded((current) => {
                const next = new Set(current);
                if (next.has(node.path)) next.delete(node.path); else next.add(node.path);
                return next;
              })}
            >
              <ChevronRight className={`size-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </Button>
          ) : <span className="w-4" />}
          <Checkbox
            checked={checked}
            indeterminate={selectedCount > 0 && !checked}
            data-testid={`${testIdPrefix}-toggle-${slug(node.path)}`}
            onCheckedChange={() => toggleNode(node)}
          />
          <span className="text-sm">{node.name}</span>
          <span className="text-xs text-muted-foreground">({node.memberCount})</span>
        </div>
        {isOpen ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid={`${testIdPrefix}-email-input`}
            value={personQuery}
            onChange={(event) => setPersonQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addExactEmail(); } }}
            placeholder={personSearchPlaceholder}
            className="h-8 pl-8"
          />
        </div>
        {normalizedPersonQuery ? (
          <div className="max-h-32 overflow-y-auto rounded-md border border-border">
            {personQueryResult.isFetching ? <p className="px-3 py-2 text-xs text-muted-foreground">{loadingLabel}</p>
              : (personQueryResult.data?.items ?? []).length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">{noMatch}</p>
                : personQueryResult.data!.items.map((person) => (
                  <Button key={person.email} type="button" variant="ghost" className="h-auto w-full justify-start gap-2 whitespace-normal rounded-none px-2 py-1.5 text-left font-normal data-[hovered=true]:bg-muted/50" onClick={() => toggleEmail(person.email)}>
                    <Checkbox checked={selectedEmails.includes(person.email.toLowerCase())} tabIndex={-1} />
                    <User className="size-3 text-muted-foreground" />
                    <span className="text-sm">{person.display_name}</span>
                    <span className="text-xs text-muted-foreground">{person.email}</span>
                  </Button>
                ))}
          </div>
        ) : null}
      </div>
      {tree.length === 0 ? <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{emptyHint}</p> : <div className="rounded-lg border border-border">
        <div className="relative border-b border-border p-2">
          <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} className="h-8 pl-8" />
        </div>
        <ScrollArea className="h-40">
          <div className="p-2">
            {matchedPaths?.size === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{noMatch}</p> : tree.map((node) => renderNode(node))}
          </div>
        </ScrollArea>
      </div>}
      {selected.length > 0 || selectedEmails.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((path) => (
            <Badge key={path} variant="secondary" className="gap-1">
              <Building2 className="size-3" />{path}
              <Button type="button" variant="ghost" size="icon-xs" className="-my-1 size-5 rounded-full p-0" onClick={() => onChange(selected.filter((value) => value !== path))} aria-label={clearAll}><X className="size-3" /></Button>
            </Badge>
          ))}
          {selectedEmails.map((email) => (
            <Badge key={email} variant="secondary" className="gap-1">
              <User className="size-3" />{email}
              <Button type="button" variant="ghost" size="icon-xs" className="-my-1 size-5 rounded-full p-0" onClick={() => toggleEmail(email)} aria-label={clearAll}><X className="size-3" /></Button>
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" className="px-2 text-sm" onClick={() => { onChange([]); onEmailsChange([]); }}>{clearAll}</Button>
        </div>
      ) : null}
    </div>
  );
}
