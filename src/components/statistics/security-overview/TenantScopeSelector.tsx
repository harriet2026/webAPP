'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { listTenants } from '@/lib/api/tenants';

const ALL = '__all__';
const DEBOUNCE_MS = 300;

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export function TenantScopeSelector({ value, onChange }: Props) {
  const t = useTranslations('securityOverview.filter.tenantScope');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      timerRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [search]);

  const { data } = useQuery({
    queryKey: ['security-overview-tenant-options', debouncedSearch],
    queryFn: () => listTenants({ search: debouncedSearch, status: 'active', pageSize: 100 }),
    staleTime: 60_000,
  });

  const tenants = data?.items ?? [];
  const selected = value === null ? null : tenants.find((x) => x.id === value) ?? null;
  const label = value === null ? t('allTenants') : selected ? `${selected.name} (${selected.code})` : `#${value}`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap" title={t('tooltip')}>
        {t('label')}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={(
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              className="w-56 justify-between"
              data-testid="tenant-scope-selector"
            />
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={t('placeholder')} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{t('empty')}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={ALL}
                  onSelect={() => { onChange(null); setOpen(false); }}
                >
                  <Check className={`mr-2 h-4 w-4 ${value === null ? 'opacity-100' : 'opacity-0'}`} />
                  {t('allTenants')}
                </CommandItem>
                {tenants.map((tenant) => (
                  <CommandItem
                    key={tenant.id}
                    value={String(tenant.id)}
                    onSelect={() => { onChange(tenant.id); setOpen(false); }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === tenant.id ? 'opacity-100' : 'opacity-0'}`} />
                    <span className="truncate">{tenant.name} ({tenant.code})</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
