'use client';

// 出站路由 Tab —— 三步向导装配（Task 7 落地 + Task 13 接通真实后端）。
//
// 步骤一（代理 IP）/ 步骤二（投递通道）现在都打真实后端 proxysvr-endpoints / proxysvr-groups
// （Task 13，取代 mock-only 虚拟 endpoint，BackendPendingPanel 占位随之退役，A9 已作废）；步骤三
// （路由规则，rule-step.tsx）CRUD 走 unified-rules（真实后端权威）。
//
// 代理 / 通道列表在本层统一发起查询（query key 与 ProxyStep/ChannelStep 内部一致，react-query
// 按 key 去重缓存，不会重复请求），满足"步骤二/三与步骤一共用同一份代理数据"的要求：
// ChannelStep 需要 proxies 渲染已选代理表；RuleStep 需要 proxies+channels 渲染通道内代理预览/
// HELO 派生/模拟链路+失效引用检测。步骤间不设前置门禁：未配置代理/自定义通道时，路由规则仍可
// 使用默认通道。

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useScopedApiRequest } from '@/lib/api/client';
import { listProxysvrEndpoints, listProxysvrGroups } from '@/lib/api/proxysvr';
import { proxysvrEndpointToRow } from './outbound/proxy-mapping';
import { proxysvrGroupToRow } from './outbound/channel-mapping';
import { StepBar } from './outbound/step-bar';
import { ProxyStep } from './outbound/proxy-step';
import { ChannelStep } from './outbound/channel-step';
import { RuleStep } from './outbound/rule-step';

export interface OutboundRoutingTabProps {
  /** The tenant whose rules to manage. Sent as X-Tenant-ID by useScopedApiRequest(tenantId). */
  tenantId: number;
}

export function OutboundRoutingTab({ tenantId }: OutboundRoutingTabProps) {
  const t = useTranslations('mailRouting.outbound');
  const { apiRequest } = useScopedApiRequest(tenantId);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const { data: endpoints = [] } = useQuery({
    queryKey: ['proxysvr-endpoints', tenantId],
    queryFn: () => listProxysvrEndpoints(apiRequest),
  });
  const proxies = endpoints.map(proxysvrEndpointToRow);

  const { data: groups = [] } = useQuery({
    queryKey: ['proxysvr-groups', tenantId],
    queryFn: () => listProxysvrGroups(apiRequest),
  });
  const channels = groups.map(proxysvrGroupToRow);

  return (
    <div className="space-y-4" data-testid="mr-ob-root">
      <p className="text-sm text-muted-foreground max-w-prose">{t('description')}</p>
      <StepBar step={step} onStepChange={setStep} />
      <div data-testid={`mr-ob-step-${step}-panel`}>
        {step === 1 && <ProxyStep tenantId={tenantId} />}
        {step === 2 && <ChannelStep tenantId={tenantId} proxies={proxies} />}
        {step === 3 && <RuleStep tenantId={tenantId} channels={channels} proxies={proxies} />}
      </div>
    </div>
  );
}
