'use client';

// 标签输入（收信域目的地址等多值字段）：回车/逗号/失焦提交；逐项 validate，失败显示 invalidHint
// 红字；重复值忽略；Backspace 在输入为空时删除最后一个标签。对齐
// doc/html-spec/admin-forwarding/index.html §2.7「TagInput：回车/逗号/失焦提交；校验失败红字
// 提示 + AlertTriangle；重复值忽略；Backspace 空输入时删最后一个标签；标签
// max-w-[160px] truncate + Tooltip + × 移除（aria-label「移除 <值>」）」。

import { useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function TagInput({
  value,
  onChange,
  placeholder,
  validate,
  invalidHint,
  testIdPrefix,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  validate?: (v: string) => boolean;
  invalidHint?: string;
  testIdPrefix: string;
}) {
  const t = useTranslations('mailRouting.shared');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const v = draft.trim().replace(/,$/, '');
    if (!v) {
      setDraft('');
      return;
    }
    if (validate && !validate(v)) {
      setError(invalidHint ?? null);
      return;
    }
    setError(null);
    setDraft('');
    if (!value.includes(v)) onChange([...value, v]);
  };

  const remove = (tag: string) => onChange(value.filter((existing) => existing !== tag));

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5',
          error ? 'border-destructive' : 'border-input',
        )}
        data-testid={`${testIdPrefix}-wrapper`}
      >
        {value.map((tag) => (
          <Tooltip key={tag}>
            <TooltipTrigger
              render={
                <span
                  className="inline-flex max-w-[160px] items-center gap-1 truncate rounded-full bg-muted px-2 py-0.5 text-xs"
                  data-testid={`${testIdPrefix}-tag-${tag}`}
                >
                  <span className="truncate">{tag}</span>
                  <button
                    type="button"
                    aria-label={t('removeTag', { value: tag })}
                    onClick={() => remove(tag)}
                    data-testid={`${testIdPrefix}-remove-${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              }
            />
            <TooltipContent>{tag}</TooltipContent>
          </Tooltip>
        ))}
        <input
          className="min-w-[80px] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          value={draft}
          placeholder={value.length === 0 ? placeholder : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={commit}
          data-testid={`${testIdPrefix}-input`}
        />
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive" data-testid={`${testIdPrefix}-error`}>
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}
