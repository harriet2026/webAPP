'use client';

// 群组多选筛选器：把"平铺按钮墙"换成"下拉触发 + 搜索 + 勾选列表"，群组数量再多
// 也只占用一行触发按钮的纵向空间（弹层内部用 Command 的滚动列表兜底，不会撑高
// 外部容器，如抽屉/表单）。选中结果作为可删除的 Badge 芯片展示在触发按钮下方，
// 与组织通讯录（org-contact-tree-select）、通知范围选择器（disposal-settings/
// notification-scope-selector）已有的"搜索 + 勾选 + 芯片"交互保持一致。
//
// 纯展示型组件：不关心 id 的存储格式（调用方决定，例如群组策略场景用
// `grp:<name>` 前缀），也不关心分组语义（发信人/收信人/其他），只负责"从一批
// 选项里勾选若干个"这一件事，因此可在群组策略之外的场景复用。

import { useState } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface GroupMultiSelectOption {
  id: string;
  label: string;
}

interface GroupMultiSelectProps {
  options: GroupMultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** 未选中任何项时，触发按钮上显示的占位文案 */
  triggerPlaceholder: string;
  /** 弹层内搜索框占位文案 */
  searchPlaceholder: string;
  /** options 为空（尚无可选项）时展示的提示，替代整个触发按钮 */
  emptyHint: string;
  /** 搜索无匹配结果时的提示 */
  noMatchLabel: string;
  /** 已选中 ≥1 项时，触发按钮上显示的摘要文案（调用方预先格式化好数量） */
  selectedCountLabel: string;
  /** 芯片上移除单项按钮的无障碍文案 */
  removeLabel: string;
  /** 清空全部已选项的按钮文案 */
  clearAllLabel: string;
  /** 用于生成稳定 data-testid 的前缀（不随语言切换变化） */
  testIdPrefix: string;
  className?: string;
}

// testid 用的选项 id slug：id 本身（如 `grp:financial-emails`）可能含冒号/空格等
// 字符，转成 testid 安全字符集，同时保留中文（业务标识本身是稳定 key，不随 UI
// 语言变化，参考 notification-scope-selector.tsx 的 slug 约定）。
function slugify(id: string): string {
  return id.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_');
}

export function GroupMultiSelect({
  options,
  selected,
  onChange,
  triggerPlaceholder,
  searchPlaceholder,
  emptyHint,
  noMatchLabel,
  selectedCountLabel,
  removeLabel,
  clearAllLabel,
  testIdPrefix,
  className,
}: GroupMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()));

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  if (options.length === 0) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)} data-testid={`${testIdPrefix}-empty`}>
        {emptyHint}
      </p>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setSearch('');
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              data-testid={`${testIdPrefix}-trigger`}
              className="w-full justify-between font-normal"
            />
          }
        >
          <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
            {selected.length > 0 ? selectedCountLabel : triggerPlaceholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-[--anchor-width] min-w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={searchPlaceholder}
              data-testid={`${testIdPrefix}-search`}
            />
            <CommandList>
              {filtered.length === 0 ? (
                <CommandEmpty data-testid={`${testIdPrefix}-no-match`}>{noMatchLabel}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filtered.map((opt) => {
                    const checked = selected.includes(opt.id);
                    return (
                      <CommandItem
                        key={opt.id}
                        value={opt.id}
                        data-checked={checked ? 'true' : undefined}
                        data-testid={`${testIdPrefix}-option-${slugify(opt.id)}`}
                        onSelect={() => toggle(opt.id)}
                      >
                        {opt.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((id) => {
            const opt = options.find((o) => o.id === id);
            return (
              <Badge key={id} variant="secondary" className="gap-1" data-testid={`${testIdPrefix}-chip-${slugify(id)}`}>
                {opt ? opt.label : id}
                <button type="button" onClick={() => toggle(id)} aria-label={removeLabel} className="ml-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            data-testid={`${testIdPrefix}-clear`}
            onClick={() => onChange([])}
          >
            {clearAllLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
