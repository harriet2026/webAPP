'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AdvancedFilter } from '@/types/log';
import type { DisposalQuickFilter } from '@/types/email-disposal';

export interface SearchTemplate {
  id: string;
  name: string;
  quickFilter: DisposalQuickFilter;
  advancedFilter: AdvancedFilter;
  createdAt: string;
}

const STORAGE_KEY = 'osgateway_disposal_search_templates';
const MAX_TEMPLATES = 20;

export function useSearchTemplates() {
  const [templates, setTemplates] = useState<SearchTemplate[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setTemplates(JSON.parse(raw));
      } catch {
        // ignore malformed data
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const persist = useCallback((next: SearchTemplate[]) => {
    setTemplates(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors (quota exceeded, private browsing)
    }
  }, []);

  const saveTemplate = useCallback(
    (name: string, quickFilter: DisposalQuickFilter, advancedFilter: AdvancedFilter): SearchTemplate => {
      const template: SearchTemplate = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        quickFilter,
        advancedFilter,
        createdAt: new Date().toISOString(),
      };
      // Keep the most recent MAX_TEMPLATES entries
      persist([template, ...templates].slice(0, MAX_TEMPLATES));
      return template;
    },
    [templates, persist],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      persist(templates.filter((t) => t.id !== id));
    },
    [templates, persist],
  );

  return { templates, saveTemplate, deleteTemplate };
}
