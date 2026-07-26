'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Columns3, Search } from 'lucide-react';

export interface ColumnConfig {
  key: string;
  label: string;
  defaultVisible: boolean;
  group?: string;
}

interface ColumnSelectorProps {
  storageKey: string;
  columns: ColumnConfig[];
  onColumnsChange: (visibleKeys: string[]) => void;
  buttonLabel?: string;
  groupLabels?: Record<string, string>;
  // Optional: return a localized display label for a column.
  // When provided, the selector shows the label next to the raw field key
  // so users see both the friendly name and the machine name.
  getLabel?: (col: ColumnConfig) => string;
}

export function ColumnSelector({ storageKey, columns, onColumnsChange, buttonLabel, groupLabels, getLabel }: ColumnSelectorProps) {
  const t = useTranslations('common');
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      setVisibleKeys(JSON.parse(stored));
    } else {
      setVisibleKeys(columns.filter((c) => c.defaultVisible).map((c) => c.key));
    }
  }, [storageKey, columns]);

  const handleColumnsChange = useCallback(onColumnsChange, [onColumnsChange]);

  useEffect(() => {
    handleColumnsChange(visibleKeys);
  }, [visibleKeys, handleColumnsChange]);

  function toggleColumn(key: string) {
    const newKeys = visibleKeys.includes(key)
      ? visibleKeys.filter((k) => k !== key)
      : [...visibleKeys, key];
    setVisibleKeys(newKeys);
    localStorage.setItem(storageKey, JSON.stringify(newKeys));
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return columns;
    const q = search.toLowerCase();
    return columns.filter((c) => {
      if (c.key.toLowerCase().includes(q)) return true;
      if (c.label.toLowerCase().includes(q)) return true;
      const localized = getLabel ? getLabel(c).toLowerCase() : '';
      return localized.includes(q);
    });
  }, [columns, search, getLabel]);

  const grouped = useMemo(() => {
    const groups: Record<string, ColumnConfig[]> = {};
    for (const col of filtered) {
      const g = col.group || 'default';
      if (!groups[g]) groups[g] = [];
      groups[g].push(col);
    }
    return groups;
  }, [filtered]);

  const groupOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const col of filtered) {
      const g = col.group || 'default';
      if (!seen.has(g)) {
        seen.add(g);
        order.push(g);
      }
    }
    return order;
  }, [filtered]);

  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline" size="sm" className="w-full">
          <Columns3 className="h-4 w-4 mr-2" />
          {buttonLabel || t('selectColumns')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
        <div className="flex items-center border-b px-3 py-2 shrink-0">
          <Search className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
          <Input
            placeholder={t('search') + '...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0 text-sm"
          />
        </div>
        <ScrollArea className="h-80">
          <div className="px-1 py-1">
            {groupOrder.map((groupName) => (
              <div key={groupName}>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {groupLabels?.[groupName] || groupName}
                </div>
                {grouped[groupName]?.map((column) => {
                  const localized = getLabel ? getLabel(column) : '';
                  const showBoth = localized && localized !== column.key;
                  return (
                    <label
                      key={column.key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={visibleKeys.includes(column.key)}
                        onCheckedChange={() => toggleColumn(column.key)}
                        className="shrink-0"
                      />
                      {showBoth ? (
                        <span className="flex flex-1 min-w-0 items-center justify-between gap-2">
                          <span className="truncate">{localized}</span>
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0">{column.key}</span>
                        </span>
                      ) : (
                        <span className="font-mono text-xs">{column.key}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                {t('noData')}
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
