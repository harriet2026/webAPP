'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  group?: string;
}

interface MultiSelectFilterProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  selectedCountLabel: (count: number) => string;
  clearLabel?: string;
  className?: string;
}

// Reusable multi-select popover (checkbox list) for quick filters that need
// OR-semantics multi-value selection (e.g. mail type, disposal policy
// modules) — mirrors the pattern already used in
// threat-retro/overview/run-filters.tsx.
export function MultiSelectFilter({
  options,
  value,
  onChange,
  placeholder,
  selectedCountLabel,
  clearLabel,
  className,
}: MultiSelectFilterProps) {
  const toggle = (val: string) => {
    onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);
  };
  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : selectedCountLabel(value.length);

  const groups = new Map<string | undefined, MultiSelectOption[]>();
  for (const opt of options) {
    const key = opt.group;
    const list = groups.get(key) ?? [];
    list.push(opt);
    groups.set(key, list);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" className={cn('h-8 w-full justify-between text-xs font-normal', className)} />}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="max-h-72 overflow-y-auto">
          {Array.from(groups.entries()).map(([group, opts]) => (
            <div key={group ?? '__ungrouped'}>
              {group && (
                <div className="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">{group}</div>
              )}
              {opts.map((option) => {
                const checked = value.includes(option.value);
                return (
                  <InteractiveSurface
                    key={option.value}
                    asChild
                    variant="control"
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs data-[hovered=true]:bg-accent/70 focus-within:ring-2 focus-within:ring-ring/60"
                  >
                    <label>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(option.value)}
                        className="shrink-0"
                      />
                      <span className="flex-1 truncate">{option.label}</span>
                      {checked ? <Check className="h-3 w-3 opacity-50" /> : null}
                    </label>
                  </InteractiveSurface>
                );
              })}
            </div>
          ))}
        </div>
        {clearLabel ? (
          <div className="mt-1 border-t px-1 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs"
              disabled={value.length === 0}
              onClick={() => onChange([])}
            >
              {clearLabel}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
