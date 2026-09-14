"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Info } from "lucide-react";

import { Button } from "@/components/ui/button";

// 与 src/lib/api/rule-effectiveness.ts 的 buildEmailDisposalCenterQuery 保持一致的
// 反向解析映射——身份认证与仿冒检测子策略 id → ruleEffectiveness.path 命名空间下的
// 二级/三级 key 数组。仅用于本组件把 URL 参数还原成可读的策略路径展示，不影响
// 规则效能统计页面自身的路径拼接逻辑。
const AUTH_SUB_STRATEGY_PATH_KEYS: Record<string, string[]> = {
  protocol_check_spf: ["protocolCheck", "protocolCheckSpf"],
  protocol_check_dkim: ["protocolCheck", "protocolCheckDkim"],
  protocol_check_dmarc: ["protocolCheck", "protocolCheckDmarc"],
  protocol_check_ptr: ["protocolCheck", "protocolCheckPtr"],
  format_check_mailfrom_empty: ["formatCheck", "formatCheckMailfromEmpty"],
  format_check_mailfrom_invalid: ["formatCheck", "formatCheckMailfromInvalid"],
  format_check_envelope_header_mismatch: [
    "formatCheck",
    "formatCheckEnvelopeMismatch",
  ],
  display_name_spoofing_inbound: ["displayNameSpoofing", "directionReceive"],
  display_name_spoofing_outbound: ["displayNameSpoofing", "directionSend"],
  display_name_spoofing_internal: ["displayNameSpoofing", "directionInternal"],
  similar_domain: ["similarDomain"],
};

const SIMILAR_DETECTION_TYPE_KEYS: Record<string, string> = {
  similar_email: "similarEmail",
  same_subject: "sameSubject",
};

const SIMILAR_DETECTION_SCOPE_KEYS: Record<string, string> = {
  receive: "directionReceive",
  send: "directionSend",
  internal: "directionInternal",
  aggregate: "aggregateScope",
};

/**
 * 把 policy_key/sub_strategy 两个 URL 参数还原为策略路径展示文案数组。
 * 未识别的取值一律退化为模块级名称，不让页面因陌生 id 而报错或显示乱码。
 */
function resolveStrategyPathLabels(
  policyKey: string,
  subStrategy: string,
  tPath: (key: string) => string,
): string[] {
  if (policyKey === "similar_detection") {
    const [type, scope] = subStrategy.split(":");
    const typeKey = SIMILAR_DETECTION_TYPE_KEYS[type];
    if (!typeKey) return [tPath("similarDetection")];
    const scopeKey = SIMILAR_DETECTION_SCOPE_KEYS[scope] ?? "aggregateScope";
    return [tPath("similarDetection"), tPath(typeKey), tPath(scopeKey)];
  }
  if (policyKey === "phishing_detection") {
    return [tPath("phishingDetection")];
  }
  if (policyKey === "auth_spoofing") {
    const segments = AUTH_SUB_STRATEGY_PATH_KEYS[subStrategy];
    if (!segments) return [tPath("authSpoofing")];
    return [tPath("authSpoofing"), ...segments.map((key) => tPath(key))];
  }
  return [];
}

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

  const pathLabels = resolveStrategyPathLabels(policyKey, subStrategy, (key) =>
    tPath(key),
  );
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
            {t("observedSince", { date: observeWindowFrom })}
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
