"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Info } from "lucide-react";

import { Button } from "@/components/ui/button";

import { strategyPathLabels } from '@/components/statistics/rule-effectiveness/constants';
import type { PolicyModule } from '@/lib/api/rule-effectiveness-view';

/**
 * 规则效能统计跳转过来的上下文提示条——仅当 URL 携带
 * source=rule_effectiveness 时渲染，展示来源策略路径与观察起始时间，
 * 并提供返回入口。不读取/不影响处置中心自身的筛选与列表查询状态。
 */
export function RuleEffectivenessContextBanner() {
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const t = useTranslations("emailDisposal.ruleEffectivenessContext");
  const tPath = useTranslations("ruleEffectiveness.path");

  const source = searchParams.get("source");
  const policyKey = searchParams.get("policy_key");
  const subStrategy = searchParams.get("sub_strategy");
  const observeWindowFrom = searchParams.get("observe_window_from");

  if (source !== "rule_effectiveness" || !policyKey || !subStrategy) {
    return null;
  }

  if (!['auth_spoofing', 'similar_detection', 'phishing_detection', 'sender_filter'].includes(policyKey)) return null;
  const pathLabels = policyKey === 'sender_filter'
    ? [searchParams.get('strategy_name') ?? subStrategy]
    : strategyPathLabels({ policy_module: policyKey as PolicyModule, sub_strategy_id: subStrategy, sub_strategy_name_snapshot: searchParams.get('strategy_name') ?? subStrategy }, tPath);
  if (pathLabels.length === 0) {
    return null;
  }
  const pathText = pathLabels.join(" / ");

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/${locale}/statistics/rule-effectiveness`);
  };

  return (
    <div
      data-testid="disposal-rule-effectiveness-context-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-foreground"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Info className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">{t("label")}</span>
        <span className="font-medium">{pathText}</span>
        {observeWindowFrom && (
          <span className="text-muted-foreground">
            {t("observedSince", { date: `${observeWindowFrom} ~ ${searchParams.get("observe_window_to") ?? observeWindowFrom}` })}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={handleBack}
        data-testid="disposal-rule-effectiveness-context-back"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Button>
    </div>
  );
}
