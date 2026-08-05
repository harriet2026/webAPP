"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  mailTypeConfig,
  RECLASSIFY_TYPE_ORDER,
  stripDetailPrefix,
} from "../lib/detail-helpers";
import type { EmailType } from "@/types/email-disposal-detail";

// Sentinel for the shadcn/base-ui Select, which does not allow an empty-string
// item value; resolves to `undefined` (== "暂不改判" / no reclassify) in onConfirm.
const NO_RECLASSIFY = "__no_reclassify__";

// GT-12422: 顺序对齐原型（layer-6/8），「暂不改判」按原型放在最后。
const EMAIL_TYPES = RECLASSIFY_TYPE_ORDER;

interface ReclassifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 'normal' for deliver, 'spam' for recall, per spec §5.3.
  defaultType: EmailType | undefined;
  onConfirm: (finalType: string | undefined, whitelistSender?: boolean) => void;
  busy?: boolean;
  // Only true for the 'deliver' action -- restores the old overview-tab.tsx
  // "放行并加白" behavior (spec §6.1) as an opt-in checkbox on the deliver
  // reclassify dialog. Never shown for 'recall', matching the old UI, which
  // never combined whitelist with recall.
  showWhitelistOption?: boolean;
  action?: "release" | "recall";
}

export function ReclassifyDialog({
  open,
  onOpenChange,
  defaultType,
  onConfirm,
  busy = false,
  showWhitelistOption = false,
  action,
}: ReclassifyDialogProps) {
  const t = useTranslations("emailDisposal.detail.overview");
  const tDetail = useTranslations("emailDisposal.detail");
  const tBatch = useTranslations("emailDisposal.batch");
  const [value, setValue] = useState<string>(defaultType ?? NO_RECLASSIFY);
  const [whitelist, setWhitelist] = useState(false);

  // Re-seed the dropdown (and the whitelist checkbox) from the caller's
  // default every time the dialog is (re)opened, so a leftover selection from
  // a previous action doesn't leak in. Adjusting state during render (rather
  // than in a useEffect) mirrors detail-modal.tsx's own reset-on-reopen
  // pattern and avoids the set-state-in-effect lint rule / an extra render
  // pass.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setValue(defaultType ?? NO_RECLASSIFY);
      setWhitelist(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/*
        html_spec layer-6/8 要求弹窗 sm:max-w-md(448px)。基类宽度是
        data-[size=default]:sm:max-w-sm，带 data 变体前缀、特异性高于裸
        sm:max-w-md，必须用同前缀写法才能被 tailwind-merge 正确替换。
      */}
      <AlertDialogContent
        className="data-[size=default]:sm:max-w-md"
        data-testid={`disposal-${action ?? "reclassify"}-dialog`}
      >
        <AlertDialogHeader>
          <AlertDialogTitle
            className={
              action === "release"
                ? "text-emerald-700 dark:text-emerald-400"
                : action === "recall"
                  ? "text-amber-700 dark:text-amber-400"
                  : undefined
            }
          >
            {action ? tBatch(action) : t("reclassify.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action ? tBatch(`${action}Description`) : t("reclassify.body")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {action && (
          <div
            className={
              action === "release"
                ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            }
          >
            {tBatch(`${action}AuditHint`)}
          </div>
        )}
        <div className="py-2">
          <Select
            value={value}
            onValueChange={(v) => setValue(v ?? NO_RECLASSIFY)}
          >
            <SelectTrigger className="w-full">
              {/*
                base-ui's <Select.Value> resolves its displayed label by
                looking up the selected value against the currently-mounted
                <SelectItem>s (SelectContent's Popup isn't mounted until the
                dropdown is opened at least once) -- so without a `children`
                render function, it falls back to the raw untranslated value
                ("spam"/"normal") on first render, before the user ever opens
                the dropdown. Passing a render function resolves the label
                directly from mailTypeConfig instead, independent of item
                mount state -- fixes the pre-open label always showing the
                raw EmailType/NO_RECLASSIFY string. Found while writing
                DD-14's e2e coverage of the recall-defaults-to-spam and
                bulk-deliver-defaults-to-normal scenarios.
              */}
              <SelectValue>
                {(v: string | null) =>
                  v && v !== NO_RECLASSIFY
                    ? tDetail(
                        stripDetailPrefix(
                          mailTypeConfig[v as EmailType].labelKey,
                        ),
                      )
                    : t("reclassify.noChange")
                }
              </SelectValue>
            </SelectTrigger>
            {/*
              GT-12774 遮挡修复：
              - className="z-[200]" 将 SelectContent 的 Positioner 层叠顺序提升至高于
                AlertDialogContent（z-50），消除下拉层被弹窗内容区遮挡的问题。
              - collisionPadding={8} 启用 Base UI Positioner 碰撞检测，弹窗偏下时
                下方空间不足会自动向上翻转，避免下拉项列表被截断。
            */}
            <SelectContent className="z-[200]" collisionPadding={8}>
              {EMAIL_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {tDetail(stripDetailPrefix(mailTypeConfig[type].labelKey))}
                </SelectItem>
              ))}
              <SelectItem value={NO_RECLASSIFY}>
                {t("reclassify.noChange")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showWhitelistOption && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={whitelist}
              onCheckedChange={(c) => setWhitelist(c === true)}
              aria-label={t("releaseWhitelist")}
            />
            {t("recipientStatus.whitelistCheckbox")}
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          {/*
            html_spec layer-6/8: 确认按钮语义色, 放行 bg-green-500 hover 600 /
            召回 bg-orange-500 hover 600 白字。Button 的 hover 走
            data-[hovered=true] 机制, 用同前缀覆盖默认 variant 的
            data-[hovered=true]:bg-primary/90。无 action 的纯改判弹窗保持默认。
          */}
          <AlertDialogAction
            className={
              action === "release"
                ? "border-green-500/20 bg-green-500 text-white data-[hovered=true]:bg-green-600 active:bg-green-600"
                : action === "recall"
                  ? "border-orange-500/20 bg-orange-500 text-white data-[hovered=true]:bg-orange-600 active:bg-orange-600"
                  : undefined
            }
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm(
                value === NO_RECLASSIFY ? undefined : value,
                showWhitelistOption ? whitelist : undefined,
              );
            }}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("confirmBtn")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
