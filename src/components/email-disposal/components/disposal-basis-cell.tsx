'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProductForm } from '@/contexts/product-form-context';
import type { ApiRequestFn } from '@/lib/api/client';
import type { DisposalBasis, DisposalBasisGroupSummary } from '@/types/email-disposal';
import { getMailLogDetail } from '../lib/disposal-detail-api';
import {
  formatListReason,
  formatMultiBasisListReason,
  getModuleName,
  groupRecipientBasisByPolicy,
  groupsFromSummaries,
  isStage1Policy,
  recipientBasisState,
  recipientsOfBasisEntry,
  sortBasisGroupsForTooltip,
  type DisposalLang,
} from '../lib/disposal-basis-config';

interface DisposalBasisCellProps {
  mailLogId: number;
  basis: DisposalBasis | undefined;
  groups: DisposalBasisGroupSummary[] | undefined;
  reason: string | undefined;
  lang: DisposalLang;
  requestFn: ApiRequestFn;
  highlightPolicyKeys?: string[];
  highlightRuleIds?: string[];
}

export function DisposalBasisCell({
  mailLogId,
  basis,
  groups: summaries,
  reason,
  lang,
  requestFn,
  highlightPolicyKeys,
  highlightRuleIds,
}: DisposalBasisCellProps) {
  const t = useTranslations('emailDisposal.table');
  const tFeatures = useTranslations('emailDisposal.detail.features');
  const { viewer, capabilities } = useProductForm();
  const isTenantViewer = viewer === 'tenant' && capabilities?.multiTenant === true;
  const [open, setOpen] = useState(false);

  const summaryGroups = useMemo(
    () => groupsFromSummaries(basis, summaries),
    [basis, summaries],
  );
  // A single policy group can still contain several independently matched
  // rules. It needs the same lazy-loaded detail treatment as multiple groups;
  // otherwise a filter for the second rule renders the first rule forever.
  const needsDetail = summaryGroups.length > 1
    || summaryGroups.some((group) => group.entries.length > 1);
  const detailQuery = useQuery({
    // Share the detail drawer's cache/invalidation key. `select` keeps this
    // cell scoped to the basis while avoiding a second request when the user
    // opens the same mail immediately after inspecting the tooltip.
    queryKey: ['mail-log-detail', mailLogId],
    queryFn: () => getMailLogDetail(mailLogId, requestFn),
    select: (detail) => detail.disposal_basis ?? null,
    enabled: open && needsDetail,
    staleTime: 5 * 60 * 1000,
  });

  if (summaryGroups.length === 0) {
    if (!reason) return <>{'—'}</>;
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="block cursor-default truncate" />}>
          {reason}
        </TooltipTrigger>
        <TooltipContent className="max-w-md text-xs">{reason}</TooltipContent>
      </Tooltip>
    );
  }

  if (!needsDetail) {
    const entry = summaryGroups[0]?.entries[0] ?? basis;
    const isPlatformPolicy = isTenantViewer && isStage1Policy(summaryGroups[0]?.policyKey);
    const label = isPlatformPolicy
      ? tFeatures('platformPolicyListReason')
      : entry ? formatListReason(entry, lang) : '';
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="block cursor-default truncate" />}>
          {label || reason || '—'}
        </TooltipTrigger>
        <TooltipContent className="max-w-md text-xs">
          {isPlatformPolicy ? tFeatures('platformPolicyHitDetail') : label || reason || '—'}
        </TooltipContent>
      </Tooltip>
    );
  }

  const mainLabel = formatMultiBasisListReason(
    summaryGroups,
    lang,
    highlightPolicyKeys,
    highlightRuleIds,
  );
  const detailBasis = detailQuery.data ?? undefined;
  const hasDetailBasis = detailBasis !== undefined;
  const loadedGroups = detailBasis
    ? groupRecipientBasisByPolicy(detailBasis)
    : summaryGroups;
  const orderedGroups = sortBasisGroupsForTooltip(
    loadedGroups,
    highlightPolicyKeys,
    highlightRuleIds,
  );

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        render={<span className="block cursor-default truncate" data-testid={`disposal-basis-${mailLogId}`} />}
      >
        {mainLabel || reason || '—'}
      </TooltipTrigger>
      <TooltipContent className="max-w-md flex-col items-stretch gap-2 text-xs">
        {detailQuery.isLoading && (
          <div data-testid={`disposal-basis-loading-${mailLogId}`}>{t('disposalBasisLoading')}</div>
        )}
        {(detailQuery.isError || (detailQuery.isSuccess && !hasDetailBasis)) && (
          <div data-testid={`disposal-basis-error-${mailLogId}`}>{t('disposalBasisLoadFailed')}</div>
        )}
        {orderedGroups.map((group) => {
          const isPlatformPolicy = isTenantViewer && isStage1Policy(group.policyKey);
          const moduleLabel = isPlatformPolicy
            ? tFeatures('platformPolicyListReason')
            : getModuleName(group.policyKey, lang);
          return (
            <div key={group.policyKey} data-testid={`disposal-basis-group-${group.policyKey}`}>
              <div className="font-medium">
                {t('disposalBasisGroupHeader', {
                  module: moduleLabel,
                  count: group.recipientCount,
                })}
              </div>
              {hasDetailBasis && (
                <ul className="mt-0.5 space-y-0.5">
                  {group.entries.flatMap((entry, entryIndex) => {
                    const recipients = recipientsOfBasisEntry(entry);
                    return recipients.map((recipient, recipientIndex) => {
                      const state = recipientBasisState(entry, recipient);
                      const stateLabel = t(`disposalBasisState.${state}`);
                      return (
                        <li key={`${entry.rule_id ?? entryIndex}-${recipient}-${recipientIndex}`}>
                          {isPlatformPolicy
                            ? t('disposalBasisPlatformRuleLine', {
                                recipient,
                                policyLabel: tFeatures('platformPolicyListReason'),
                                state: stateLabel,
                              })
                            : t('disposalBasisRuleLine', {
                                recipient,
                                ruleName: entry.rule_name || '—',
                                ruleId: entry.rule_id || '—',
                                state: stateLabel,
                              })}
                        </li>
                      );
                    });
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </TooltipContent>
    </Tooltip>
  );
}
