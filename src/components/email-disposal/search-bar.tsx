'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Search, X, Loader2, AlertCircle, RotateCcw, Save, ChevronDown, Filter, Trash2 } from 'lucide-react';
import { useApiRequest } from '@/lib/api/client';
import { parseQuery } from './lib/disposal-api';
import { toast } from 'sonner';
import type { AICondition } from '@/types/email-disposal';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MAX_INPUT_LENGTH = 500;

interface SearchBarProps {
  onAiConditions: (conditions: AICondition[], summary: string) => void;
  onSearch: (query: string) => void;
  onReset: () => void;
  aiEnabled?: boolean;
  templates?: { id: string; name: string }[];
  onSaveTemplate?: () => void;
  onLoadTemplate?: (id: string) => void;
  onDeleteTemplate?: (id: string) => void;
  sampleCount?: number;
  onClearSamples?: () => void;
  filtersExpanded?: boolean;
  onToggleFilters?: () => void;
}

export function SearchBar({
  onAiConditions, onSearch, onReset, aiEnabled = true, templates = [],
  onSaveTemplate, onLoadTemplate, onDeleteTemplate,
  sampleCount = 0, onClearSamples,
  filtersExpanded = false, onToggleFilters,
}: SearchBarProps) {
  const t = useTranslations('emailDisposal.search');
  const { apiRequest } = useApiRequest();
  const [value, setValue] = useState('');
  const [parsing, setParsing] = useState(false);
  const [aiError, setAiError] = useState('');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.length > MAX_INPUT_LENGTH) {
      setValue(raw.slice(0, MAX_INPUT_LENGTH));
      toast.warning(t('truncatedTo500'));
    } else {
      setValue(raw);
    }
  }, [t]);

  const handleAiParse = useCallback(async () => {
    if (!value.trim()) return;
    setAiError('');
    setParsing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await parseQuery({ description: value }, apiRequest, controller.signal);
      const conditions: AICondition[] = [];
      if (result.filter) {
        for (const group of result.filter.groups) {
          for (const cond of group.conditions) {
            conditions.push({ field: cond.field, op: cond.op, value: String(cond.value ?? ''), source: 'ai' });
          }
        }
      }
      onAiConditions(conditions, result.summary);
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      setAiError(isTimeout ? t('aiTimeout') : t('aiError'));
      onAiConditions([], '');
    } finally {
      clearTimeout(timeoutId);
      setParsing(false);
    }
  }, [value, apiRequest, onAiConditions, t]);

  const handleSearch = useCallback(() => {
    if (!value.trim()) return;
    onSearch(value);
    toast.success(t('searchApplied'));
  }, [value, onSearch, t]);

  const handleReset = useCallback(() => {
    setValue('');
    setAiError('');
    onAiConditions([], '');
    onReset();
    toast.success(t('resetDone'));
  }, [onAiConditions, onReset, t]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[18rem] flex-1 lg:max-w-[60%]">
          <Input
            data-testid="disposal-natural-language-input"
            value={sampleCount > 0 ? t(sampleCount === 1 ? 'sampleSingle' : 'sampleMultiple', { n: sampleCount }) : value}
            onChange={handleChange}
            placeholder={t('placeholder')}
            className="h-10 pr-11"
            disabled={sampleCount > 0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2">
            {sampleCount > 0 ? (
              <Button
                data-testid="disposal-search-clear"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={t('aiClear')}
                title={t('aiClear')}
                onClick={() => { setValue(''); setAiError(''); onAiConditions([], ''); onSearch(''); onClearSamples?.(); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : aiEnabled ? (
              <Button
                data-testid="disposal-ai-parse"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={handleAiParse}
                disabled={parsing || !value.trim()}
                aria-label={t('aiParse')}
                title={t('aiParse')}
              >
                {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
          </div>
        </div>
        <Button data-testid="disposal-search-submit" className="h-10 px-5" onClick={handleSearch} disabled={parsing || sampleCount > 0 || !value.trim()}>
          <Search className="h-4 w-4 mr-2" />
          {t('search')}
        </Button>
        <Button data-testid="disposal-search-reset" variant="outline" className="h-10 px-5" onClick={handleReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('reset')}
        </Button>
        {templates.length === 0 ? (
          <Button
            data-testid="disposal-template-save"
            variant="outline"
            className="h-10 px-5"
            onClick={onSaveTemplate}
          >
            <Save className="mr-2 h-4 w-4" />
            {t('saveTemplate')}
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  data-testid="disposal-template-menu"
                  variant="outline"
                  className="h-10 px-5"
                  aria-label={t('savedTemplates')}
                />
              }
            >
              <Save className="mr-2 h-4 w-4" />
              {t('saveTemplate')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuItem data-testid="disposal-template-save" onClick={onSaveTemplate}>
                  <Save className="h-4 w-4" />
                  {t('saveCurrent')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t('savedTemplates')}</DropdownMenuLabel>
                {templates.map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    data-testid={`disposal-template-load-${template.id}`}
                    onClick={() => onLoadTemplate?.(template.id)}
                  >
                    <span className="flex-1">{template.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${t('deleteTemplate')}: ${template.name}`}
                      className="text-muted-foreground data-[hovered=true]:bg-destructive/10 data-[hovered=true]:text-destructive"
                      onClick={(event) => { event.stopPropagation(); onDeleteTemplate?.(template.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          data-testid="disposal-filters-toggle"
          variant="outline"
          className={`h-10 px-5 ${filtersExpanded ? 'border-primary/40 bg-primary/10 text-primary data-[hovered=true]:bg-primary/15 data-[hovered=true]:text-primary' : ''}`}
          aria-expanded={filtersExpanded}
          onClick={onToggleFilters}
        >
          <Filter className="mr-2 h-4 w-4" />
          {filtersExpanded ? t('collapse') : t('advancedFilter')}
          <ChevronDown
            className={`ml-2 h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${filtersExpanded ? 'rotate-180' : ''}`}
          />
        </Button>
      </div>

      {aiError && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{aiError}</AlertDescription>
        </Alert>
      )}

      {sampleCount === 0 && <div className="flex flex-wrap items-center gap-y-1 text-sm text-muted-foreground">
        {(t.raw('samples') as unknown as string[])?.map?.((sample, i) => (
          <span key={i} className="inline-flex items-center">
            {i > 0 && <span className="mx-3 text-border">|</span>}
            <InteractiveSurface asChild variant="text" className="data-[hovered=true]:text-primary">
              <button
                type="button"
                data-testid={`disposal-search-sample-${i + 1}`}
                onClick={() => { setValue(sample); onSearch(sample); }}
              >
                {sample}
              </button>
            </InteractiveSurface>
          </span>
        ))}
      </div>}
    </div>
  );
}
