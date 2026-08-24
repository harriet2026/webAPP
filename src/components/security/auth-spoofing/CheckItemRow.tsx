"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AuthSpoofingAction, CheckItem } from "@/types/auth-spoofing";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AuthSpoofingTagPanel } from "./AuthSpoofingTagPanel";
import { toMessageKeySegment } from "@/lib/auth-spoofing-labels";

// 「允许」(accept) 已从认证仿冒移除：每项检查都在跑，管理员只能选处理动作，
// "不拦截"由「标记放行」表达。后端 validateASConfig 会 400 掉 accept，所以它也
// 不能再出现在下拉里。
const ACTIONS: AuthSpoofingAction[] = [
  "quarantine",
  "reject",
  "audit",
  "proceed",
  "discard",
];

export const FORMAT_ACTIONS: AuthSpoofingAction[] = [
  "quarantine",
  "audit",
  "proceed",
  "reject",
  "discard",
];

interface CheckItemRowProps {
  label: string;
  item: CheckItem;
  onChange: (item: CheckItem) => void;
  disabled?: boolean;
  /** i18n key prefix under authSpoofing for enable-warning dialog (e.g. "mailfromEmptyWarning") */
  warningI18nKey?: string;
  /** Restrict the action dropdown to a subset of actions (e.g. format checks omit "audit") */
  actions?: AuthSpoofingAction[];
  /** When true, hide the per-item observe Switch/Badge block (e.g. protocol checks use a global observe switch instead) */
  hideObserve?: boolean;
  /** Optional override for the action dropdown option/value label i18n key (defaults to "action.<a>") */
  actionLabelKey?: (a: AuthSpoofingAction) => string;
}

export function CheckItemRow({
  label,
  item,
  onChange,
  disabled,
  warningI18nKey,
  actions = ACTIONS,
  hideObserve,
  actionLabelKey,
}: CheckItemRowProps) {
  const t = useTranslations("authSpoofing");
  const [pendingEnable, setPendingEnable] = useState(false);

  // actionLabelKey returns keys RELATIVE to the authSpoofing namespace, so
  // resolve them with the scoped `t` (not the root translator).
  const actionLabel = (a: AuthSpoofingAction) =>
    actionLabelKey
      ? t(actionLabelKey(a) as Parameters<typeof t>[0])
      : t(`action.${toMessageKeySegment(a)}` as Parameters<typeof t>[0]);
  const actionTip = (a: AuthSpoofingAction) =>
    t(`actionTooltip.${toMessageKeySegment(a)}` as Parameters<typeof t>[0]);

  const handleEnableChange = (enabled: boolean) => {
    if (enabled && warningI18nKey) {
      setPendingEnable(true);
    } else {
      onChange({ ...item, enabled });
    }
  };

  const showTagPanel = item.enabled && item.action === "proceed";

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border p-3 transition-colors",
          !item.enabled && "opacity-60",
        )}
      >
        <div className="min-w-[80px]">
          <Switch
            checked={item.enabled}
            onCheckedChange={handleEnableChange}
            disabled={disabled}
          />
        </div>

        <div className="flex-1 text-sm font-medium min-w-[140px]">{label}</div>

        <div className="min-w-[140px]">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Select
                    value={item.action}
                    onValueChange={(v) =>
                      onChange({
                        ...item,
                        action: v as AuthSpoofingAction,
                      })
                    }
                    disabled={disabled || !item.enabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{actionLabel(item.action)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {actions.map((a) => (
                        <SelectItem key={a} value={a}>
                          {actionLabel(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <TooltipContent side="top" className="max-w-[220px]">
                <span>{actionTip(item.action)}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {!hideObserve && (
          <div className="flex items-center gap-2 min-w-[100px]">
            <Switch
              size="sm"
              checked={item.observe_mode}
              onCheckedChange={(observe_mode) =>
                onChange({ ...item, observe_mode })
              }
              disabled={disabled || !item.enabled}
            />
            {item.observe_mode && item.enabled && (
              <Badge variant="secondary" className="text-[10px]">
                {t("observing")}
              </Badge>
            )}
          </div>
        )}
      </div>

      {showTagPanel && (
        <AuthSpoofingTagPanel
          value={item}
          onChange={(patch) => onChange({ ...item, ...patch })}
          disabled={disabled}
        />
      )}

      {warningI18nKey && (
      <AlertDialog
        open={pendingEnable}
        onOpenChange={(open) => {
          if (!open) setPendingEnable(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              {t(`${warningI18nKey}.title` as any)}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {t(`${warningI18nKey}.desc` as any)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t(`${warningI18nKey}.cancel` as any)}
            </AlertDialogCancel>
            <AlertDialogAction
              className="border-warning/80 bg-warning text-white data-[hovered=true]:bg-warning/90 active:bg-warning/85"
              onClick={() => {
                onChange({ ...item, enabled: true });
                setPendingEnable(false);
              }}
            >
              {t(`${warningI18nKey}.confirm` as any)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </>
  );
}
