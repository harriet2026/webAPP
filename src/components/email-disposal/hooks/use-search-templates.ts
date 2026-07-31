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
  /** The raw AI natural-language input text at save time. Restored to the
   *  input box on load but NOT auto-parsed — user re-triggers AI search. */
  aiQuery?: string;
  /** ISO timestamp of the last overwrite; absent for first-save. */
  updatedAt?: string;
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
    (
      name: string,
      quickFilter: DisposalQuickFilter,
      advancedFilter: AdvancedFilter,
      aiQuery?: string,
    ): SearchTemplate => {
      const trimmed = name.trim();
      const existingIndex = templates.findIndex((t) => t.name === trimmed);

      // Same-name overwrite: replace in place, keep original id and createdAt.
      if (existingIndex !== -1) {
        const existing = templates[existingIndex];
        const updated: SearchTemplate = {
          ...existing,
          quickFilter,
          advancedFilter,
          aiQuery,
          updatedAt: new Date().toISOString(),
        };
        const next = templates.map((t, i) => (i === existingIndex ? updated : t));
        persist(next);
        return updated;
      }

      const template: SearchTemplate = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: trimmed,
        quickFilter,
        advancedFilter,
        aiQuery,
        createdAt: new Date().toISOString(),
      };
      // If at limit, drop the oldest (last) entry to make room.
      const base = templates.length >= MAX_TEMPLATES ? templates.slice(0, MAX_TEMPLATES - 1) : templates;
      persist([template, ...base]);
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

  const renameTemplate = useCallback(
    (id: string, newName: string): boolean => {
      const trimmed = newName.trim();
      if (!trimmed) return false;
      // Disallow duplicate names (unless renaming to same name).
      const target = templates.find((t) => t.id === id);
      if (!target) return false;
      if (trimmed !== target.name && templates.some((t) => t.name === trimmed)) {
        return false; // caller should surface a conflict error
      }
      persist(
        templates.map((t) =>
          t.id === id ? { ...t, name: trimmed, updatedAt: new Date().toISOString() } : t,
        ),
      );
      return true;
    },
    [templates, persist],
  );

  /** Whether a given name already exists (for dialog duplicate detection). */
  const hasTemplateName = useCallback(
    (name: string) => templates.some((t) => t.name === name.trim()),
    [templates],
  );

  return { templates, saveTemplate, deleteTemplate, renameTemplate, hasTemplateName };
}
