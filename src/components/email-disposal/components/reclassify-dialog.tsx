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
import { mailTypeConfig, stripDetailPrefix } from "../lib/detail-helpers";
import type { EmailType } from "@/types/email-disposal-detail";

// Sentinel for the shadcn/base-ui Select, which does not allow an empty-string
// item value; resolves to `undefined` (== "暂不改判" / no reclassify) in onConfirm.
const NO_RECLASSIFY = "__no_reclassify__";

const EMAIL_TYPES = Object.keys(mailTypeConfig) as EmailType[];

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
      <AlertDialogContent
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
            <SelectContent>
              <SelectItem value={NO_RECLASSIFY}>
                {t("reclassify.noChange")}
              </SelectItem>
              {EMAIL_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {tDetail(stripDetailPrefix(mailTypeConfig[type].labelKey))}
                </SelectItem>
              ))}
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
          <AlertDialogAction
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
