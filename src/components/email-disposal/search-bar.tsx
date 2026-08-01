"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InteractiveSurface } from "@/components/ui/interactive-surface";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sparkles,
  Search,
  X,
  Loader2,
  AlertCircle,
  RotateCcw,
  Save,
  ChevronDown,
  Filter,
  Trash2,
  Pencil,
} from "lucide-react";
import { useApiRequest } from "@/lib/api/client";
import { parseQuery } from "./lib/disposal-api";
import { toast } from "sonner";
import type { AdvancedFilter } from "@/types/log";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MAX_INPUT_LENGTH = 500;

interface SearchBarProps {
  // parse-query 的解析结果直接透传给调用方，不在这里拍平成 AICondition[]——
  // 拍平会把 in/between 的数组值变成逗号拼接字符串,后端 400（修复见
  // design spec §7 / lib/ai-backfill.ts）。清空场景传 null。
  // query 同时交给页面保存，避免 SearchBar 因热更新/重挂载丢失“当前输入已有
  // AI 结果”的状态后，搜索按钮又错误补上一条默认主题条件。
  onAiParsed: (
    filter: AdvancedFilter | null,
    summary: string,
    query: string,
  ) => void;
  onSearch: (query: string) => void;
  onReset: () => void;
  aiEnabled?: boolean;
  templates?: { id: string; name: string }[];
  onSaveTemplate?: () => void;
  onLoadTemplate?: (id: string) => void;
  onDeleteTemplate?: (id: string) => void;
  onRenameTemplate?: (id: string) => void;
  sampleCount?: number;
  onClearSamples?: () => void;
  filtersExpanded?: boolean;
  onToggleFilters?: () => void;
  activeFilterCount?: number;
  hasActiveFilters?: boolean;
  canSaveTemplate?: boolean;
  hasPendingFilters?: boolean;
}

export function SearchBar({
  onAiParsed,
  onSearch,
  onReset,
  aiEnabled = true,
  templates = [],
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  onRenameTemplate,
  sampleCount = 0,
  onClearSamples,
  filtersExpanded = false,
  onToggleFilters,
  activeFilterCount = 0,
  hasActiveFilters = false,
  canSaveTemplate = false,
  hasPendingFilters = false,
}: SearchBarProps) {
  const t = useTranslations("emailDisposal.search");
  const { apiRequest } = useApiRequest();
  const [value, setValue] = useState("");
  const [parsing, setParsing] = useState(false);
  const [aiError, setAiError] = useState("");
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastSuccessfulQueryRef = useRef("");

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
    },
    [],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw.length > MAX_INPUT_LENGTH) {
        setValue(raw.slice(0, MAX_INPUT_LENGTH));
        toast.warning(t("truncatedTo500"));
      } else {
        setValue(raw);
      }
    },
    [t],
  );

  const executeSearch = useCallback(
    async (rawQuery: string) => {
      const query = rawQuery.trim();
      if (!query) {
        // Empty natural-language input is still a useful action: apply any
        // structured draft or refresh the list with the current conditions.
        onSearch("");
        return;
      }
      if (hasPendingFilters && query === lastSuccessfulQueryRef.current) {
        onSearch("");
        return;
      }

      if (!aiEnabled) {
        lastSuccessfulQueryRef.current = query;
        onSearch(query);
        return;
      }

      controllerRef.current?.abort();
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setAiError("");
      setParsing(true);
      const controller = new AbortController();
      controllerRef.current = controller;
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 30000);
      try {
        const result = await parseQuery(
          { description: query },
          apiRequest,
          controller.signal,
        );
        if (requestIdRef.current !== requestId) return;

        lastSuccessfulQueryRef.current = query;
        onAiParsed(result.filter, result.summary, query);
        const hasParsedConditions =
          result.filter?.groups.some((group) => group.conditions.length > 0) ??
          false;
        // A successful parser response can legitimately contain no structured
        // condition. In that case retain the useful fallback: search the query
        // as a subject keyword instead of silently returning an unchanged list.
        if (!hasParsedConditions) onSearch(query);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        const wasAborted = err instanceof Error && err.name === "AbortError";
        if (wasAborted && !timedOut) return;
        setAiError(timedOut ? t("aiTimeout") : t("aiError"));
        // A transient parsing failure must not destroy filters from the last
        // successful search. The user can retry or continue with the visible
        // structured controls.
      } finally {
        clearTimeout(timeoutId);
        if (requestIdRef.current === requestId) {
          controllerRef.current = null;
          setParsing(false);
        }
      }
    },
    [aiEnabled, apiRequest, hasPendingFilters, onAiParsed, onSearch, t],
  );

  const handleReset = useCallback(() => {
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    lastSuccessfulQueryRef.current = "";
    setParsing(false);
    setValue("");
    setAiError("");
    onAiParsed(null, "", "");
    onReset();
  }, [onAiParsed, onReset]);

  const resetDisabled = !value.trim() && !hasActiveFilters && sampleCount === 0;
  // The template menu is always accessible so users can browse and manage
  // existing templates. Only the "Save current" item inside is gated by canSaveTemplate.
  const templateMenuDisabled = false;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[18rem] flex-1 lg:max-w-[60%]">
          <Input
            data-testid="disposal-natural-language-input"
            value={
              sampleCount > 0
                ? t(sampleCount === 1 ? "sampleSingle" : "sampleMultiple", {
                    n: sampleCount,
                  })
                : value
            }
            onChange={handleChange}
            placeholder={t("placeholder")}
            className="h-9 pr-11"
            disabled={sampleCount > 0 || parsing}
            aria-busy={parsing}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void executeSearch(value);
              }
            }}
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2">
            {sampleCount > 0 ? (
              <Button
                data-testid="disposal-search-clear"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={t("aiClear")}
                title={t("aiClear")}
                onClick={() => {
                  setValue("");
                  setAiError("");
                  onAiParsed(null, "", "");
                  onSearch("");
                  onClearSamples?.();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : aiEnabled ? (
              <span
                className="flex h-7 w-7 items-center justify-center text-muted-foreground"
                data-testid="disposal-ai-indicator"
                title={t("aiParse")}
                aria-hidden="true"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            data-testid="disposal-search-submit"
            className="h-9 min-w-[5.25rem] gap-1.5 px-4 disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
            onClick={() => void executeSearch(value)}
            disabled={parsing || sampleCount > 0}
            aria-busy={parsing}
          >
            {parsing ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {t("search")}
          </Button>
          <Button
            data-testid="disposal-search-reset"
            variant="outline"
            className="h-9 gap-1.5 px-3"
            onClick={handleReset}
            disabled={resetDisabled}
          >
            <RotateCcw className="h-4 w-4" />
            {t("reset")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  data-testid="disposal-template-menu"
                  variant="outline"
                  className="h-9 gap-1.5 px-3"
                  aria-label={t("templates")}
                  disabled={templateMenuDisabled}
                />
              }
            >
              <Save className="h-4 w-4" />
              {t("templates")}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  data-testid="disposal-template-save"
                  onClick={onSaveTemplate}
                  disabled={!canSaveTemplate}
                >
                  <Save className="h-4 w-4" />
                  {t("saveCurrent")}
                </DropdownMenuItem>
                {templates.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{t("savedTemplates")}</DropdownMenuLabel>
                    {templates.map((template) => (
                      <DropdownMenuItem
                        key={template.id}
                        data-testid={`disposal-template-load-${template.id}`}
                        onClick={() => onLoadTemplate?.(template.id)}
                      >
                        <span className="min-w-0 flex-1 truncate">{template.name}</span>
                        <span className="ml-1 flex shrink-0 items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`${t("renameTemplate")}: ${template.name}`}
                            className="text-muted-foreground data-[hovered=true]:bg-muted data-[hovered=true]:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation();
                              onRenameTemplate?.(template.id);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`${t("deleteTemplate")}: ${template.name}`}
                            className="text-muted-foreground data-[hovered=true]:bg-destructive/10 data-[hovered=true]:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteTemplate?.(template.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            data-testid="disposal-filters-toggle"
            variant="outline"
            className={`h-9 min-w-[7.875rem] gap-1.5 px-3 ${filtersExpanded ? "border-primary/40 bg-primary/10 text-primary data-[hovered=true]:bg-primary/15 data-[hovered=true]:text-primary" : ""}`}
            aria-expanded={filtersExpanded}
            onClick={onToggleFilters}
          >
            <Filter className="h-4 w-4" />
            {filtersExpanded ? t("collapse") : t("advancedFilter")}
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                {activeFilterCount}
              </span>
            ) : null}
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${filtersExpanded ? "rotate-180" : ""}`}
            />
          </Button>
        </div>
      </div>

      {aiError && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{aiError}</AlertDescription>
        </Alert>
      )}

      {sampleCount === 0 && (
        <div className="flex flex-wrap items-center gap-y-1 text-sm text-muted-foreground">
          {(t.raw("samples") as unknown as string[])?.map?.((sample, i) => (
            <span key={i} className="inline-flex items-center">
              {i > 0 && <span className="mx-3 text-border">|</span>}
              <InteractiveSurface
                asChild
                variant="text"
                className="data-[hovered=true]:text-primary"
              >
                <button
                  type="button"
                  data-testid={`disposal-search-sample-${i + 1}`}
                  onClick={() => {
                    setValue(sample);
                    void executeSearch(sample);
                  }}
                >
                  {sample}
                </button>
              </InteractiveSurface>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
