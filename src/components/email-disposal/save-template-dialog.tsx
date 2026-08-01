"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";

const MAX_NAME_LENGTH = 30;
const MAX_TEMPLATES = 20;

interface SaveTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current template count (used for default name + limit warning). */
  templateCount: number;
  /** Existing template names for duplicate detection. */
  existingNames: string[];
  /** Initial name — supplied when renaming an existing template. */
  initialName?: string;
  /** "save" shows "保存搜索模板"; "rename" shows "重命名模板". */
  mode?: "save" | "rename";
  /** Called with the confirmed name once user presses save/confirm. */
  onConfirm: (name: string) => void;
}

// 默认名前缀走 i18n（原型里硬编码了中文，产品有四语言）
function buildDefaultName(prefix: string, count: number): string {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${prefix} ${today.getFullYear()}-${mm}-${dd}${count > 0 ? ` (${count + 1})` : ""}`;
}

export function SaveTemplateDialog({
  open,
  onOpenChange,
  templateCount,
  existingNames,
  initialName,
  mode = "save",
  onConfirm,
}: SaveTemplateDialogProps) {
  const t = useTranslations("emailDisposal.search");

  const defaultName =
    initialName ?? buildDefaultName(t("templateDefaultName"), templateCount);

  const [name, setName] = useState(defaultName);
  // Reset name each time the dialog opens. 用 React 官方的「props 变化时在渲染中调整
  // state」写法，而不是 useEffect —— 后者会触发 react-hooks/set-state-in-effect。
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName(defaultName);
  }

  const trimmed = name.trim();
  const isEmpty = trimmed.length === 0;
  // Duplicate: name matches an existing template AND it's not the same as the
  // initial name being renamed (so renaming to same name is a no-op, not error).
  const isDuplicate =
    existingNames.includes(trimmed) && trimmed !== (initialName ?? "").trim();
  const isAtLimit = templateCount >= MAX_TEMPLATES;
  // When saving a new template at the limit, the oldest will be dropped.
  const willDropOldest = mode === "save" && isAtLimit && !isDuplicate;

  const canConfirm = !isEmpty;

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    onConfirm(trimmed);
  }, [canConfirm, onConfirm, trimmed]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.nativeEvent.isComposing && canConfirm) {
        handleConfirm();
      }
    },
    [canConfirm, handleConfirm],
  );

  const isSaveMode = mode === "save";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {isSaveMode ? t("saveTemplateTitle") : t("renameTemplateTitle")}
          </DialogTitle>
          <DialogDescription>
            {isSaveMode
              ? t("saveTemplateDesc", { count: templateCount, max: MAX_TEMPLATES })
              : t("renameTemplateDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="template-name-input">{t("templateNameLabel")}</Label>
            <Input
              id="template-name-input"
              value={name}
              onChange={(e) =>
                setName(e.target.value.slice(0, MAX_NAME_LENGTH))
              }
              onKeyDown={handleKeyDown}
              placeholder={t("templateNamePlaceholder")}
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              autoComplete="off"
            />
            <p className="text-right text-xs text-muted-foreground">
              {trimmed.length}/{MAX_NAME_LENGTH}
            </p>
          </div>

          {/* Empty name error */}
          {isEmpty && name.length > 0 && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t("templateNameRequired")}
              </AlertDescription>
            </Alert>
          )}

          {/* Duplicate name — overwrite warning */}
          {isDuplicate && (
            <Alert className="border-amber-500/40 bg-amber-500/10 py-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t("templateOverwriteWarning")}
              </AlertDescription>
            </Alert>
          )}

          {/* At limit — oldest will be dropped */}
          {willDropOldest && (
            <Alert className="border-amber-500/40 bg-amber-500/10 py-2 text-amber-600 dark:text-amber-400">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t("templateLimitWarning", { max: MAX_TEMPLATES })}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={handleConfirm}
            data-testid="save-template-confirm"
          >
            {isDuplicate
              ? t("templateOverwriteConfirm")
              : isSaveMode
                ? t("save")
                : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
